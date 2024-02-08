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
} from "o1js";
import {
  MapContract,
  MapElement,
  ReducerState,
  BATCH_SIZE,
} from "../src/contract";
import { Memory } from "zkcloudworker";
import { Storage } from "minanft";

const ELEMENTS_COUNT = 10;

describe("Contract", () => {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  const deployer = Local.testAccounts[0].privateKey;
  const sender = deployer.toPublicKey();
  const privateKey = PrivateKey.random();
  const publicKey = privateKey.toPublicKey();
  const zkApp = new MapContract(publicKey);
  const elements: MapElement[] = [];
  const storage = new Storage({ hashString: [Field(1), Field(2)] });

  it(`should compile contract`, async () => {
    console.time("compiled");
    await MapContract.compile();
    const methods = MapContract.analyzeMethods();
    console.timeEnd("compiled");

    console.log(`method size for a contract with batch size: ${BATCH_SIZE}`);
    console.log("add rows:", methods["add"].rows);
    console.log("update rows:", methods["update"].rows);
    console.log("reduce rows:", methods["update"].rows);
    Memory.info(`should compile the SmartContract`);
  });

  it("should generate elements", () => {
    for (let i = 0; i < ELEMENTS_COUNT; i++) {
      const name = Field.random();
      const address = PrivateKey.random().toPublicKey();
      const element = new MapElement({
        name,
        address,
        addressHash: Poseidon.hash(address.toFields()),
        hash: Poseidon.hash([name, ...address.toFields()]),
        storage,
      });
      elements.push(element);
    }
  });

  it("should deploy the contract", async () => {
    const map = new MerkleMap();
    const root = map.getRoot();
    const tx = await Mina.transaction({ sender }, () => {
      AccountUpdate.fundNewAccount(sender);
      zkApp.deploy({});
      zkApp.root.set(root);
      zkApp.actionState.set(Reducer.initialActionState);
      zkApp.count.set(UInt64.from(0));
    });
    await tx.sign([deployer, privateKey]).send();
    Memory.info(`should deploy the contract`);
  });

  it("should send the elements", async () => {
    for (const element of elements) {
      const tx = await Mina.transaction({ sender }, () => {
        zkApp.add(element.name, element.address, element.storage);
      });
      await tx.prove();
      await tx.sign([deployer]).send();
    }
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
      if (Array.isArray(actions)) {
        console.log("length", length);
        let hash: Field = Field(0);
        for (let i = 0; i < length; i++) {
          const element: MapElement = MapElement.fromFields(
            actions[i].actions[0].map((f: string) => Field.fromJSON(f))
          );
          hash = hash.add(element.hash);
        }
        const reducerState = new ReducerState({
          count: UInt64.from(length),
          hash,
        });
        const endActionState: Field = Field.fromJSON(actions[length - 1].hash);

        const tx = await Mina.transaction({ sender }, () => {
          zkApp.reduce(startActionState, endActionState, reducerState);
        });
        await tx.prove();
        await tx.sign([deployer]).send();
        Memory.info(`should update the state`);
      }
      startActionState = zkApp.actionState.get();
      const actionStates = { fromActionState: startActionState };
      actions = await Mina.fetchActions(publicKey, actionStates);
      if (Array.isArray(actions)) length = Math.min(actions.length, BATCH_SIZE);
    }
  });
});
