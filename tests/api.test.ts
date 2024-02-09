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
  UInt32,
} from "o1js";
import {
  MapContract,
  MapElement,
  BATCH_SIZE,
  ReducerState,
} from "../src/mapcontract";
import { Storage } from "../src/storage";
import { MapUpdateData, MapTransition } from "../src/update";

const ELEMENTS_COUNT = 5;

const map = new MerkleMap();
const userPrivateKeys: PrivateKey[] = [];
const elements: MapElement[] = [];
const storage = new Storage({ hashString: [Field(1), Field(2)] });
const ownerPrivateKey = PrivateKey.fromBase58(
  "EKFRg9MugtXvFPe4N6Au28kQyYx9txt4CVPgBPRYdv4wvbKBJpEy"
); // owner of the contract
let transactions: string[] = [];

describe("Merkle map demo", () => {
  const JWT =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY0NTkwMzQ5NDYiLCJpYXQiOjE3MDEzNTY5NzEsImV4cCI6MTczMjg5Mjk3MX0.r94tKntDvLpPJT2zzEe7HMUcOAQYQu3zWNuyFFiChD0";

  const contractAddress =
    "B62qqCF9cLudc1qctFT1om4KDJ6eiVcKoUh9t8gNAjEVjpMZYoWNAME";
  const publicKey = PublicKey.fromBase58(contractAddress);
  const zkApp = new MapContract(publicKey);
  const startTime: number[] = [];
  const endTime: number[] = [];
  const jobId: string[] = [];
  const hash: string[] = [];
  let calculateJobId = "";
  const api = new zkCloudWorker(JWT);
  let initialValue = UInt64.from(0);
  initBlockchain("berkeley");

  it("should get initial value", async () => {
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const count: UInt64 = zkApp.count.get();
    console.log("initial count:", count.toBigInt().toString());
    initialValue = count;
  });

  it("should generate elements", () => {
    for (let i = 0; i < ELEMENTS_COUNT; i++) {
      const name = Field.random();
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
      console.log("api call result", apiresult);
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
        `Time spent to send tx: ${formatTime(endTime[i] - startTime[i])} (${
          endTime[i] - startTime[i]
        } ms)`
      );
      console.log("api call result", result);
      expect(result.success).toBe(true);
      if (result.success === false) return;
      const hash = result.result.result;
      expect(hash).toBeDefined();
      if (hash === undefined) return;
      hash.push(hash);
      i++;
    }
  });

  it(`should wait for tx to be included into block`, async () => {
    expect(hash.length).toBeGreaterThan(0);
    if (hash.length === 0) return;
    console.log("Waiting for txs to be included into block...");
    console.time("txs included into block");
    let remainedTx = hash.length;
    while (remainedTx > 0) {
      await sleep(1000 * 30);
      for (const h of hash) {
        const result = await checkZkappTransaction(h);
        if (result.success) {
          console.log("tx included into block:", h);
          remainedTx--;
        }
      }
    }
    console.timeEnd("txs included into block");
  });

  it("should check the actions", async () => {
    await fetchAccount(publicKey);
    let actions = zkApp.reducer.getActions({
      fromActionState: zkApp.actionState.get(),
    });
    console.log("actions", actions.length);
    const actions2 = await Mina.fetchActions(publicKey);
    if (Array.isArray(actions2)) {
      console.log("actions2", actions2.length);
      for (let i = 0; i < actions2.length; i++) {
        //console.log("action", actions2[i].actions[0]);
        //console.log("hash", actions2[i].hash);
        const element = MapElement.fromFields(
          actions2[i].actions[0].map((f: string) => Field.fromJSON(f))
        );
        expect(element.name.toJSON()).toEqual(actions[i][0].name.toJSON());
        expect(element.address.toJSON()).toEqual(
          actions[i][0].address.toJSON()
        );
        expect(element.addressHash.toJSON()).toEqual(
          actions[i][0].addressHash.toJSON()
        );
        expect(element.hash.toJSON()).toEqual(actions[i][0].hash.toJSON());
      }
    }
  });

  it("should prepare and send the state update txs", async () => {
    let actions = await Mina.fetchActions(publicKey);
    let length = 0;
    let startActionState: Field = zkApp.actionState.get();
    if (Array.isArray(actions)) length = Math.min(actions.length, BATCH_SIZE);
    while (length > 0) {
      console.time("reduce");
      if (Array.isArray(actions)) {
        console.log("length", length);
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
          count: UInt32.from(length),
          hash,
        });
        const endActionState: Field = Field.fromJSON(actions[length - 1].hash);
        const update = await prepareProofData(elements);
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
        console.log("api call result", apiresult);
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

        args = ["reduce", contractAddress];

        apiresult = await api.createJob({
          name: "nameservice",
          task: "send",
          transactions: [JSON.stringify(tx, null, 2)],
          args,
          developer: "@staketab",
        });
        startTime = Date.now();
        console.log("api call result", apiresult);
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
        console.log("api call result", result);
        expect(result.success).toBe(true);
        if (result.success === false) return;
        const txHash = result.result.result;
        console.log("txHash", txHash);
        expect(txHash).toBeDefined();
        if (txHash === undefined) return;
        expect(txHash).not.toBe("");
        if (txHash === "") return;
        console.log("Waiting for tx to be included into block...");
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
      await fetchAccount(publicKey);
      startActionState = zkApp.actionState.get();
      const actionStates = { fromActionState: startActionState };
      actions = await Mina.fetchActions(publicKey, actionStates);
      if (Array.isArray(actions)) length = Math.min(actions.length, BATCH_SIZE);
      console.timeEnd("reduce");
    }
  });

  it("should get count", async () => {
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const count: UInt64 = zkApp.count.get();
    console.log("count:", count.toBigInt().toString());
    //expect(Number(count.toBigInt())).toEqual(ELEMENTS_COUNT);
  });

  it("should reset the value", async () => {
    const map = new MerkleMap();
    const root = map.getRoot();
    const signature = Signature.create(ownerPrivateKey, [root]);
    const tx = {
      root: root.toJSON(),
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
    console.log("api call result", apiresult);
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
    console.log("api call result", result);
    expect(result.success).toBe(true);
    if (result.success === false) return;
    const txHash = result.result.result;
    console.log("txHash", txHash);
    expect(txHash).toBeDefined();
    if (txHash === undefined) return;
    expect(txHash).not.toBe("");
    if (txHash === "") return;
    console.log("Waiting for tx to be included into block...");
    console.time("reset tx included into block");
    let remainedTx = 1;
    while (remainedTx > 0) {
      await sleep(1000 * 30);
      const result = await checkZkappTransaction(txHash);
      if (result.success) {
        console.log("tx included into block:", txHash);
        remainedTx--;
      }
    }
    console.timeEnd("reset tx included into block");
  });

  it("should get root", async () => {
    const map = new MerkleMap();
    const emptyRoot = map.getRoot();
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const root: Field = zkApp.root.get();
    console.log("root:", root.toJSON());
    expect(root.toJSON()).toEqual(emptyRoot.toJSON());
  });
});

async function prepareProofData(elements: MapElement[]): Promise<Field[]> {
  console.log(`Preparing proofs data for ${elements.length} elements...`);
  transactions = [];

  let updates: MapUpdateData[] = [];

  for (const element of elements) {
    const oldRoot = map.getRoot();
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
    updates.push(update);
  }

  let states: MapTransition[] = [];
  for (let i = 0; i < elements.length; i++) {
    const state = MapTransition.accept(updates[i], elements[i].address);
    states.push(state);
    const tx = {
      state: state.toFields().map((f) => f.toJSON()),
      update: updates[i].toFields().map((f) => f.toJSON()),
      address: elements[i].address.toBase58(),
    };
    transactions.push(JSON.stringify(tx, null, 2));
  }

  let state: MapTransition = states[0];
  for (let i = 1; i < states.length; i++) {
    const newState = MapTransition.merge(state, states[i]);
    state = newState;
  }

  return state.toFields();
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
