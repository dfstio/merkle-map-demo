import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  Mina,
  Reducer,
  AccountUpdate,
  Poseidon,
  MerkleMap,
  UInt64,
  UInt32,
  Signature,
  verify,
  VerificationKey,
} from "o1js";
import {
  MapContract,
  MapElement,
  ReducerState,
  BATCH_SIZE,
} from "../src/mapcontract";
import {
  MapUpdateProof,
  MapTransition,
  MapUpdate,
  MapUpdateData,
} from "../src/update";
import { Storage } from "../src/storage";
import { sleep } from "zkcloudworker";

const ELEMENTS_COUNT = 1024;
const isGC = true;
const map = new MerkleMap();

let verificationKey: VerificationKey | undefined = undefined;

describe("Contract", () => {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  const deployer = Local.testAccounts[0].privateKey;
  const sender = deployer.toPublicKey();
  const privateKey = PrivateKey.random();
  const publicKey = privateKey.toPublicKey();
  const zkApp = new MapContract(publicKey);
  const userPrivateKeys: PrivateKey[] = [];
  const elements: MapElement[] = [];
  const storage = new Storage({ hashString: [Field(1), Field(2)] });
  const ownerPrivateKey = PrivateKey.random(); // owner of the contract
  const ownerPublicKey = ownerPrivateKey.toPublicKey();

  it(`should compile contract`, async () => {
    await collect();
    console.time("methods analyzed");
    let methods = MapContract.analyzeMethods();
    console.timeEnd("methods analyzed");
    //console.log("methods", methods);
    // calculate the size of the contract - the sum or rows for each method
    let size = Object.values(methods).reduce(
      (acc, method) => acc + method.rows,
      0
    );
    const maxRows = 2 ** 16;
    // calculate percentage rounded to 0 decimal places
    let percentage = Math.round((size / maxRows) * 100);

    console.log(
      `method's total size for a contract with batch size ${BATCH_SIZE} is ${size} rows (${percentage}% of max ${maxRows} rows)`
    );
    console.log("add rows:", methods["add"].rows);
    console.log("update rows:", methods["update"].rows);
    console.log("reduce rows:", methods["reduce"].rows);
    console.log("setOwner rows:", methods["setOwner"].rows);

    const methods1 = MapUpdate.analyzeMethods();

    //console.log("methods", methods);
    // calculate the size of the contract - the sum or rows for each method
    size = Object.values(methods1).reduce(
      (acc, method) => acc + method.rows,
      0
    );
    // calculate percentage rounded to 0 decimal places
    percentage = Math.round((size / maxRows) * 100);

    console.log(
      `method's total size for a MapUpdate is ${size} rows (${percentage}% of max ${maxRows} rows)`
    );

    console.log("Compiling contracts...");
    console.time("MapUpdate compiled");
    verificationKey = (await MapUpdate.compile()).verificationKey;
    console.timeEnd("MapUpdate compiled");
    console.time("MapContract compiled");
    await MapContract.compile();
    console.timeEnd("MapContract compiled");
    Memory.info(`should compile the SmartContract`);
  });

  it("should generate elements", () => {
    for (let i = 0; i < ELEMENTS_COUNT; i++) {
      const name = Field(i < 2 ? 1 : i + 1);
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

  it("should deploy the contract", async () => {
    const root = map.getRoot();
    const tx = await Mina.transaction({ sender }, () => {
      AccountUpdate.fundNewAccount(sender);
      zkApp.deploy({});
      zkApp.domain.set(Field(0));
      zkApp.root.set(root);
      zkApp.actionState.set(Reducer.initialActionState);
      zkApp.count.set(Field(0));
      zkApp.owner.set(ownerPublicKey);
    });
    await tx.sign([deployer, privateKey]).send();
    Memory.info(`should deploy the contract`);
  });

  it("should send the elements", async () => {
    console.time("send elements");
    for (let i = 0; i < ELEMENTS_COUNT; i++) {
      const signature = Signature.create(
        userPrivateKeys[i],
        elements[i].toFields()
      );
      const tx = await Mina.transaction({ sender }, () => {
        zkApp.add(
          elements[i].name,
          elements[i].address,
          elements[i].storage,
          signature
        );
      });
      await collect();
      Memory.info(`element ${i + 1}/${ELEMENTS_COUNT} sent`);
      await tx.prove();
      if (i === 0) Memory.info(`Setting base for RSS memory`, false, true);
      await tx.sign([deployer]).send();
    }
    console.timeEnd("send elements");
    Memory.info(`should send the elements`);
  });

  it("should check the actions", async () => {
    let actions = zkApp.reducer.getActions({
      fromActionState: zkApp.actionState.get(),
    });
    // console.log("actions", actions.length);
    const actions2 = await Mina.fetchActions(publicKey);
    if (Array.isArray(actions2)) {
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

  it("should update the state", async () => {
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
          count: Field(length),
          hash,
        });
        const endActionState: Field = Field.fromJSON(actions[length - 1].hash);

        expect(verificationKey).toBeDefined();
        if (verificationKey === undefined) return;
        const proof: MapUpdateProof = await calculateProof(elements, true);
        const signature = Signature.create(
          ownerPrivateKey,
          proof.publicInput.toFields()
        );

        const tx = await Mina.transaction({ sender }, () => {
          zkApp.reduce(
            startActionState,
            endActionState,
            reducerState,
            proof,
            signature
          );
        });
        await collect();
        await tx.prove();
        await tx.sign([deployer]).send();
        Memory.info(`should update the state`);
      }
      startActionState = zkApp.actionState.get();
      const actionStates = { fromActionState: startActionState };
      actions = await Mina.fetchActions(publicKey, actionStates);
      if (Array.isArray(actions)) length = Math.min(actions.length, BATCH_SIZE);
      console.timeEnd("reduce");
    }
  });

  it("should reset the root", async () => {
    console.time("reset");
    const map = new MerkleMap();
    const root = map.getRoot();
    const signature = Signature.create(ownerPrivateKey, [root, Field(0)]);
    const tx = await Mina.transaction({ sender }, () => {
      zkApp.setRoot(root, Field(0), signature);
    });
    await tx.prove();
    await tx.sign([deployer]).send();
    console.timeEnd("reset");
    Memory.info(`reset`);
  });
});

async function calculateProof(
  elements: MapElement[],
  verbose: boolean = false
): Promise<MapUpdateProof> {
  console.log(`Calculating proofs for ${elements.length} elements...`);
  if (verificationKey === undefined)
    throw new Error("Verification key is not defined");

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

  let proofs: MapUpdateProof[] = [];
  for (let i = 0; i < elements.length; i++) {
    const state = updates[i].isElementAccepted
      ? MapTransition.accept(updates[i].update!, elements[i].address)
      : MapTransition.reject(
          updates[i].oldRoot,
          elements[i].name,
          elements[i].address
        );

    await collect();
    const proof = updates[i].isElementAccepted
      ? await MapUpdate.accept(state, updates[i].update!, elements[i].address)
      : await MapUpdate.reject(
          state,
          updates[i].oldRoot,
          elements[i].name,
          elements[i].address
        );
    if (i === 0) Memory.info(`Setting base for RSS memory`, false, true);
    proofs.push(proof);
    if (verbose) Memory.info(`Proof ${i + 1}/${elements.length} created`);
  }

  console.log("Merging proofs...");
  let proof: MapUpdateProof = proofs[0];
  for (let i = 1; i < proofs.length; i++) {
    const state = MapTransition.merge(proof.publicInput, proofs[i].publicInput);
    await collect();
    let mergedProof: MapUpdateProof = await MapUpdate.merge(
      state,
      proof,
      proofs[i]
    );
    if (i === 1) Memory.info(`Setting base for RSS memory`, false, true);
    proof = mergedProof;
    if (verbose) Memory.info(`Proof ${i}/${proofs.length - 1} merged`);
  }

  function isAccepted(element: MapElement): boolean {
    const name = element.name;
    const value = map.get(name);
    const isAccepted: boolean = value.equals(Field(0)).toBoolean();
    return isAccepted;
  }
  const verificationResult: boolean = await verify(
    proof.toJSON(),
    verificationKey
  );

  console.log("Proof verification result:", verificationResult);
  if (verificationResult === false) {
    throw new Error("Proof verification error");
  }

  return proof;
}

class Memory {
  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  static rss: number = 0;
  constructor() {
    Memory.rss = 0;
  }

  // eslint-disable-next-line @typescript-eslint/no-inferrable-types
  public static info(
    description: string = ``,
    fullInfo: boolean = false,
    reset: boolean = false
  ) {
    const memoryData = process.memoryUsage();
    const formatMemoryUsage = (data: number) =>
      `${Math.round(data / 1024 / 1024)} MB`;
    const oldRSS = Memory.rss;
    if (reset) Memory.rss = Math.round(memoryData.rss / 1024 / 1024);

    const memoryUsage = fullInfo
      ? {
          step: `${description}:`,
          rssDelta: `${(oldRSS === 0
            ? 0
            : Memory.rss - oldRSS
          ).toString()} MB -> Resident Set Size memory change`,
          rss: `${formatMemoryUsage(
            memoryData.rss
          )} -> Resident Set Size - total memory allocated`,
          heapTotal: `${formatMemoryUsage(
            memoryData.heapTotal
          )} -> total size of the allocated heap`,
          heapUsed: `${formatMemoryUsage(
            memoryData.heapUsed
          )} -> actual memory used during the execution`,
          external: `${formatMemoryUsage(
            memoryData.external
          )} -> V8 external memory`,
        }
      : `RSS memory ${description}: ${formatMemoryUsage(memoryData.rss)}${
          oldRSS === 0
            ? ``
            : `, changed by ` +
              (Math.round(memoryData.rss / 1024 / 1024) - oldRSS).toString() +
              ` MB`
        }`;

    console.log(memoryUsage);
  }
}

async function collect() {
  //await sleep(100);
  if (isGC) {
    const memoryData1 = process.memoryUsage();
    if (global.gc === undefined) throw new Error("global.gc is undefined");
    await global.gc();
    const memoryData2 = process.memoryUsage();
    if (memoryData1.rss !== memoryData2.rss) {
      console.log(
        "RSS memory changed after GC:",
        Math.round((memoryData1.rss - memoryData2.rss) / 1024),
        "kB"
      );
    }
  }
}
