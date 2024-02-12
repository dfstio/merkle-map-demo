import { describe, expect, it } from "@jest/globals";
import {
  zkCloudWorker,
  formatTime,
  sleep,
  initBlockchain,
  Memory,
} from "zkcloudworker";
import {
  Field,
  PublicKey,
  UInt64,
  checkZkappTransaction as o1js_checkZkappTransaction,
  fetchAccount as o1js_fetchAccount,
  MerkleMap,
  PrivateKey,
  Poseidon,
  Signature,
  Mina,
} from "o1js";
import {
  MapContract,
  MapElement,
  BATCH_SIZE,
  ReducerState,
} from "../src/mapcontract";
import { Storage } from "../src/storage";
import { MapUpdateData, MapTransition } from "../src/update";
import { ownerPrivateKey, contractAddress, JWT } from "../src/config";

const ELEMENTS_COUNT = 128;
const addActions = false;

const map = new MerkleMap();
const userPrivateKeys: PrivateKey[] = [];
const elements: MapElement[] = [];
const storage = new Storage({ hashString: [Field(1), Field(2)] });

let transactions: string[] = [];

describe("Merkle map demo", () => {
  const publicKey = PublicKey.fromBase58(contractAddress);
  const zkApp = new MapContract(publicKey);
  const startTime: number[] = [];
  const endTime: number[] = [];
  const jobId: string[] = [];
  const hash: string[] = [];
  let calculateJobId = "";
  const api = new zkCloudWorker(JWT);
  let initialValue = Field(0);
  initBlockchain("berkeley");

  it("should get initial value", async () => {
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const count: Field = zkApp.count.get();
    console.log("initial count:", count.toBigInt().toString());
    initialValue = count;
  });

  if (addActions) {
    it("should generate elements", () => {
      for (let i = 0; i < ELEMENTS_COUNT; i++) {
        const name = Field(i < 2 ? 1 : i + 1000);
        const userPrivateKey = PrivateKey.random();
        const address = userPrivateKey.toPublicKey();
        const element = new MapElement({
          name,
          address,
          addressHash: Poseidon.hash(address.toFields()),
          hash: Poseidon.hash([name, ...address.toFields()]),
          storage,
        });
        elements.push(element);
        userPrivateKeys.push(userPrivateKey);
      }
    });

    it("should send the elements", async () => {
      console.time("send elements");
      for (let i = 0; i < ELEMENTS_COUNT; i++) {
        const signature = Signature.create(
          userPrivateKeys[i],
          elements[i].toFields()
        );
        const tx = {
          name: elements[i].name.toJSON(),
          address: elements[i].address.toBase58(),
          signature: signature.toBase58(),
          storage: [...elements[i].storage.toFields().map((f) => f.toJSON())],
        };
        const args = ["add", contractAddress];
        const apiresult = await api.createJob({
          name: "nameservice",
          task: "send",
          transactions: [JSON.stringify(tx, null, 2)],
          args,
          developer: "@staketab",
        });
        startTime.push(Date.now());
        console.log("add api call result", apiresult);
        expect(apiresult.success).toBe(true);
        expect(apiresult.jobId).toBeDefined();
        if (apiresult.jobId === undefined) return;
        jobId.push(apiresult.jobId);
      }
      console.timeEnd("send elements");
      Memory.info(`should send the elements`);
    });

    it(`should get the tx hashes`, async () => {
      let i = 0;
      for (const id of jobId) {
        const result = await api.waitForJobResult({ jobId: id });
        endTime.push(Date.now());
        console.log(
          `Time spent to send add tx: ${formatTime(
            endTime[i] - startTime[i]
          )} (${endTime[i] - startTime[i]} ms)`
        );
        console.log("add api call result", result);
        //expect(result.success).toBe(true);
        if (result.success === true) {
          const txHash = result.result.result;
          console.log("add txHash", txHash);
          //expect(txHash).toBeDefined();
          if (txHash !== undefined) hash.push(txHash);
        }
        i++;
      }
    });

    it(`should wait for tx to be included into block`, async () => {
      console.log(
        `Sent add txs: ${hash.length}/${ELEMENTS_COUNT} (${Math.floor(
          (hash.length * 100) / ELEMENTS_COUNT
        )}%)`
      );
      expect(hash.length).toBeGreaterThan(0);
      if (hash.length === 0) return;
      console.log("Waiting for add txs to be included into block...", hash);
      console.time("txs included into block");
      let remainedTx = hash.length;
      while (remainedTx > 0) {
        await sleep(1000 * 30);
        for (const h of hash) {
          const result = await checkZkappTransaction(h);
          if (result.success) {
            console.log("add tx included into block:", h);
            remainedTx--;
          }
        }
      }
      console.timeEnd("txs included into block");
      await sleep(1000 * 60 * 5);
    });
  }

  /*
  it("should check the actions", async () => {
    console.time("check actions");
    await fetchAccount(publicKey);
    const actions2 = await Mina.fetchActions(publicKey);
    if (Array.isArray(actions2)) {
      console.log("all actions:", actions2.length);
    }
  });
  */

  it("should prepare and send the state update txs", async () => {
    await fetchAccount(publicKey);
    let length = 0;
    let startActionState: Field = zkApp.actionState.get();
    console.log("startActionState", startActionState.toJSON());
    let actions = await fetchMinaActions(publicKey, startActionState);
    if (Array.isArray(actions)) {
      length = Math.min(actions.length, BATCH_SIZE);
      console.log("actions total length from startActionState", actions.length);
    } else throw new Error("actions is not an array");
    while (length === 0 && hash.length > 0) {
      await sleep(1000 * 60);
      await fetchAccount(publicKey);
      startActionState = zkApp.actionState.get();
      actions = await fetchMinaActions(publicKey, startActionState);
      if (Array.isArray(actions)) {
        length = Math.min(actions.length, BATCH_SIZE);
        console.log(
          "actions total length from startActionState",
          actions.length
        );
      } else throw new Error("actions is not an array");
    }
    while (length > 0) {
      console.time("reduce");
      if (Array.isArray(actions)) {
        console.log("reduce length", length);
        let hash: Field = Field(0);
        const elements: MapElement[] = [];
        for (let i = 0; i < length; i++) {
          const element: MapElement = MapElement.fromFields(
            actions[i].actions[0].map((f: string) => Field.fromJSON(f))
          );
          hash = hash.add(element.hash);
          elements.push(element);
        }
        const reducerState = new ReducerState({
          count: Field(length),
          hash,
        });
        console.log("startActionsState", startActionState.toJSON());
        const endActionState: Field = Field.fromJSON(actions[length - 1].hash);
        console.log("endActionState", endActionState.toJSON());
        console.log("actions", actions);
        const actions2 = await fetchMinaActions(publicKey, startActionState);
        if (Array.isArray(actions2)) {
          console.log("actions2 length", actions2.length);
          /*
          if (actions2.length !== length)
            throw new Error("actions2 length is not equal to length");
          */
        } else throw new Error("actions2 is not an array");

        const update = await prepareProofData(elements);
        console.log("sending proofMap job", update.length);
        const signature = Signature.create(ownerPrivateKey, update);
        let args = [contractAddress];

        let apiresult = await api.createJob({
          name: "nameservice",
          task: "proofMap",
          transactions,
          args,
          developer: "@staketab",
        });
        let startTime = Date.now();
        console.log("proofMap api call result", apiresult);
        expect(apiresult.success).toBe(true);
        expect(apiresult.jobId).toBeDefined();
        if (apiresult.jobId === undefined) return;
        calculateJobId = apiresult.jobId;
        Memory.info(`calculate proof`);
        let result = await api.waitForJobResult({ jobId: calculateJobId });
        let endTime = Date.now();
        console.log(
          `Time spent to calculate the proof: ${formatTime(
            endTime - startTime
          )} (${endTime - startTime} ms)`
        );
        //console.log("api call result", result);
        expect(result.success).toBe(true);
        if (result.success === false) return;
        const proof = result.result.result;
        //console.log("proof", proof);
        expect(proof).toBeDefined();
        if (proof === undefined) return;
        const tx = {
          startActionState: startActionState.toJSON(),
          endActionState: endActionState.toJSON(),
          reducerState: {
            count: reducerState.count.toJSON(),
            hash: reducerState.hash.toJSON(),
          },
          proof,
          signature: signature.toBase58(),
        };
        console.log("reduce job count", tx.reducerState.count);

        args = ["reduce", contractAddress];

        apiresult = await api.createJob({
          name: "nameservice",
          task: "send",
          transactions: [JSON.stringify(tx, null, 2)],
          args,
          developer: "@staketab",
        });
        startTime = Date.now();
        console.log("reduce api call result", apiresult);
        expect(apiresult.success).toBe(true);
        expect(apiresult.jobId).toBeDefined();
        if (apiresult.jobId === undefined) return;
        calculateJobId = apiresult.jobId;
        Memory.info(`calculate proof`);
        result = await api.waitForJobResult({ jobId: calculateJobId });
        endTime = Date.now();
        console.log(
          `Time spent to sent the reduce tx: ${formatTime(
            endTime - startTime
          )} (${endTime - startTime} ms)`
        );
        console.log("reduce api call result", result);
        expect(result.success).toBe(true);
        if (result.success === false) return;
        const txHash = result.result.result;
        console.log("txHash", txHash);
        expect(txHash).toBeDefined();
        if (txHash === undefined) return;
        expect(txHash).not.toBe("");
        if (txHash === "") return;
        console.log("Waiting for reduce tx to be included into block...");
        console.time("reduce tx included into block");
        let remainedTx = 1;
        while (remainedTx > 0) {
          await sleep(1000 * 30);
          const result = await checkZkappTransaction(txHash);
          if (result.success) {
            console.log("tx included into block:", txHash);
            remainedTx--;
          }
        }
        console.timeEnd("reduce tx included into block");
      }
      await sleep(1000 * 60);
      await fetchAccount(publicKey);
      startActionState = zkApp.actionState.get();
      actions = await fetchMinaActions(publicKey, startActionState);
      if (actions && Array.isArray(actions))
        length = Math.min(actions.length, BATCH_SIZE);
      else throw new Error("actions is not an array");
      console.timeEnd("reduce");
    }
  });

  it("should get final values", async () => {
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const count: Field = zkApp.count.get();
    const root: Field = zkApp.root.get();
    console.log("final count:", count.toJSON());
    console.log("final root:", root.toJSON());
    initialValue = count;
  });
  /*
  it("should reset the value", async () => {
    const map = new MerkleMap();
    const root = map.getRoot();
    const count = Field(0);
    const signature = Signature.create(ownerPrivateKey, [root, count]);
    const tx = {
      root: root.toJSON(),
      count: count.toJSON(),
      signature: signature.toBase58(),
    };
    const args = ["setRoot", contractAddress];

    const apiresult = await api.createJob({
      name: "nameservice",
      task: "send",
      transactions: [JSON.stringify(tx, null, 2)],
      args,
      developer: "@staketab",
    });
    const startTime = Date.now();
    console.log("reset api call result", apiresult);
    expect(apiresult.success).toBe(true);
    expect(apiresult.jobId).toBeDefined();
    if (apiresult.jobId === undefined) return;
    calculateJobId = apiresult.jobId;
    Memory.info(`reset`);
    const result = await api.waitForJobResult({ jobId: calculateJobId });
    const endTime = Date.now();
    console.log(
      `Time spent to sent the reset tx: ${formatTime(endTime - startTime)} (${
        endTime - startTime
      } ms)`
    );
    console.log("reset api call result", result);
    expect(result.success).toBe(true);
    if (result.success === false) return;
    const txHash = result.result.result;
    console.log("txHash", txHash);
    expect(txHash).toBeDefined();
    if (txHash === undefined) return;
    expect(txHash).not.toBe("");
    if (txHash === "") return;
    console.log("Waiting for reset tx to be included into block...");
    console.time("reset tx included into block");
    let remainedTx = 1;
    while (remainedTx > 0) {
      await sleep(1000 * 30);
      const result = await checkZkappTransaction(txHash);
      if (result.success) {
        console.log("reset tx included into block:", txHash);
        remainedTx--;
      }
    }
    console.timeEnd("reset tx included into block");
  });

  it("should get final values after reset", async () => {
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const count: Field = zkApp.count.get();
    const root: Field = zkApp.root.get();
    console.log("final count:", count.toJSON());
    console.log("final root:", root.toJSON());
    initialValue = count;
  });
  */
});

async function prepareProofData(elements: MapElement[]): Promise<Field[]> {
  console.log(`Preparing proofs data for ${elements.length} elements...`);
  transactions = [];

  interface ElementState {
    isElementAccepted: boolean;
    update?: MapUpdateData;
    oldRoot: Field;
  }
  let updates: ElementState[] = [];

  for (const element of elements) {
    const oldRoot = map.getRoot();
    if (isAccepted(element)) {
      map.set(element.name, element.addressHash);
      const newRoot = map.getRoot();
      const update = new MapUpdateData({
        oldRoot,
        newRoot,
        key: element.name,
        oldValue: Field(0),
        newValue: element.addressHash,
        witness: map.getWitness(element.name),
      });
      updates.push({ isElementAccepted: true, update, oldRoot });
    } else {
      updates.push({ isElementAccepted: false, oldRoot });
    }
  }

  let states: MapTransition[] = [];
  for (let i = 0; i < elements.length; i++) {
    console.log(
      `Calculating state ${i}/${elements.length}...`,
      elements[i].name.toJSON()
    );
    if (updates[i].isElementAccepted) {
      const update = updates[i].update;
      if (update === undefined) throw new Error("Update is undefined");
      const state = MapTransition.accept(update, elements[i].address);
      states.push(state);
      const tx = {
        isAccepted: true,
        state: state.toFields().map((f) => f.toJSON()),
        address: elements[i].address.toBase58(),
        update: update.toFields().map((f) => f.toJSON()),
      };
      transactions.push(JSON.stringify(tx, null, 2));
    } else {
      const state = MapTransition.reject(
        updates[i].oldRoot,
        elements[i].name,
        elements[i].address
      );
      const tx = {
        isAccepted: false,
        state: state.toFields().map((f) => f.toJSON()),
        address: elements[i].address.toBase58(),
        root: updates[i].oldRoot.toJSON(),
        name: elements[i].name.toJSON(),
      };
      transactions.push(JSON.stringify(tx, null, 2));
      states.push(state);
    }
  }

  let state: MapTransition = states[0];
  for (let i = 1; i < states.length; i++) {
    const newState = MapTransition.merge(state, states[i]);
    state = newState;
  }

  return state.toFields();
}

function isAccepted(element: MapElement): boolean {
  const name = element.name;
  const value = map.get(name);
  const isAccepted: boolean = value.equals(Field(0)).toBoolean();
  return isAccepted;
}

async function checkZkappTransaction(hash: string) {
  try {
    const result = await o1js_checkZkappTransaction(hash);
    return result;
  } catch (error) {
    console.error("Error in checkZkappTransaction:", error);
    return { success: false };
  }
}

async function fetchAccount(publicKey: PublicKey) {
  const timeout = 1000 * 60 * 5; // 5 minutes
  const startTime = Date.now();
  let result = { account: undefined };
  while (Date.now() - startTime < timeout) {
    try {
      const result = await o1js_fetchAccount({
        publicKey,
      });
      if (result.account !== undefined) return result;
      console.log("Cannot fetch account", publicKey.toBase58(), result);
    } catch (error) {
      console.log("Error in fetchAccount:", error);
    }
    await sleep(1000 * 10);
  }
  console.log("Timeout in fetchAccount");
  return result;
}

async function fetchMinaActions(
  publicKey: PublicKey,
  fromActionState: Field,
  endActionState?: Field
) {
  const timeout = 1000 * 60 * 60; // 1 hour
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      let actions = await Mina.fetchActions(publicKey, {
        fromActionState,
        endActionState,
      });
      if (Array.isArray(actions)) return actions;
      else console.log("Cannot fetch actions - wrong format");
    } catch (error: any) {
      console.log(
        "Error in fetchMinaActions",
        error.toString().substring(0, 300)
      );
    }
    await sleep(1000 * 60 * 2);
  }
  console.log("Timeout in fetchMinaActions");
  return undefined;
}
