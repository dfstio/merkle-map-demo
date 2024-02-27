import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  Mina,
  Reducer,
  AccountUpdate,
  Poseidon,
  MerkleMap,
  Bool,
  Signature,
  VerificationKey,
  Account,
} from "o1js";
import {
  MapContract,
  MapElement,
  ReducerState,
  BATCH_SIZE,
} from "../src/base/mapcontract";
import { MapUpdateProof, MapUpdate } from "../src/base/update";
import { calculateProof } from "../src/base/proof";
import { Storage } from "../src/lib/storage";
import { emptyActionsHash, calculateActionsHash } from "../src/lib/hash";
import { collect } from "../src/lib/gc";
import { Memory } from "../src/lib/memory";

const ELEMENTS_COUNT = 7;
const isGC = false;
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
      zkApp.isSynced.set(Bool(true));
      zkApp.count.set(Field(0));
      zkApp.owner.set(ownerPublicKey);
    });
    await tx.sign([deployer, privateKey]).send();
    Memory.info(`should deploy the contract`);
    const account = Account(publicKey);
    const finalActionState = account.actionState.get();
    //console.log("first ActionState", finalActionState.toJSON());
    const emptyActionsState = emptyActionsHash();
    //console.log("emptyActionsState", emptyActionsState.toJSON());
    const reducerActionsState = Reducer.initialActionState;
    //console.log("reducerActionsState", reducerActionsState.toJSON());
    expect(finalActionState.toJSON()).toEqual(emptyActionsState.toJSON());
    expect(finalActionState.toJSON()).toEqual(reducerActionsState.toJSON());
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
    let actionState = emptyActionsHash();
    //console.log("actionState", actionState.toJSON());
    const actions2 = await Mina.fetchActions(publicKey);
    const account = Account(publicKey);
    const finalActionState = account.actionState.get();
    //console.log("finalActionState", finalActionState.toJSON());
    if (Array.isArray(actions2)) {
      for (let i = 0; i < actions2.length; i++) {
        //console.log("action", i, actions2[i].actions[0]);
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

        actionState = calculateActionsHash(actions2[i].actions, actionState);
        //console.log("actionState", actionState.toJSON());
        expect(actionState.toJSON()).toEqual(actions2[i].hash);
      }
    }
    expect(finalActionState.toJSON()).toEqual(actionState.toJSON());
  });

  it("should update the state", async () => {
    let actions = await Mina.fetchActions(publicKey);
    let length = 0;
    let startActionState: Field = zkApp.actionState.get();
    let firstPass = true;
    if (Array.isArray(actions)) length = Math.min(actions.length, BATCH_SIZE);
    while (length > 0) {
      const isSynced = zkApp.isSynced.get().toBoolean();
      expect(isSynced).toEqual(firstPass);
      firstPass = false;
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
        const proof: MapUpdateProof = await calculateProof(
          elements,
          map,
          verificationKey,
          true
        );
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
    const isSynced = zkApp.isSynced.get().toBoolean();
    expect(isSynced).toEqual(true);
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
