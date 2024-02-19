import { describe, expect, it } from "@jest/globals";
import { makeString } from "zkcloudworker";
import { Field, Poseidon, PrivateKey, Encoding, MerkleMap } from "o1js";
import { Storage } from "../src/storage";
import { DynamicMerkleMap, MerkleMapElement } from "../src/DynamicMerkleMap";

const ELEMENTS_NUMBER = 1000;
const mapElements: MerkleMapElement[] = [];

describe("Dynamic Map", () => {
  let root: Field | undefined = undefined;

  it(`should prepare data`, async () => {
    console.time(`prepared data of ${ELEMENTS_NUMBER} items`);
    const storage: Storage = new Storage({ hashString: [Field(0), Field(0)] });
    for (let i = 0; i < ELEMENTS_NUMBER; i++) {
      const name = Encoding.stringToFields(makeString(30))[0];
      const address = PrivateKey.random().toPublicKey();
      const addressHash = Poseidon.hash(address.toFields());
      const mapElement: MerkleMapElement = {
        key: name,
        value: addressHash,
      };
      mapElements.push(mapElement);
    }
    console.timeEnd(`prepared data of ${ELEMENTS_NUMBER} items`);
  });

  it(`should create a map`, async () => {
    console.time(`created a dynamic map`);
    const map: DynamicMerkleMap = new DynamicMerkleMap();
    map.setLeaves(mapElements);
    root = map.getRoot();
    console.log(`root`, root.toJSON());
    console.timeEnd(`created a dynamic map`);
  });

  it(`should check a map root`, async () => {
    expect(root).toBeDefined();
    if (root === undefined) return;
    console.time(`created a map`);
    const map: MerkleMap = new MerkleMap();
    for (let i = 0; i < ELEMENTS_NUMBER; i++) {
      map.set(mapElements[i].key, mapElements[i].value);
    }
    const mapRoot = map.getRoot();
    console.log(`root`, mapRoot.toJSON());
    console.timeEnd(`created a map`);
    expect(root.toJSON()).toEqual(mapRoot.toJSON());
  });
});
