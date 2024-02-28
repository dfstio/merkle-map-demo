import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  Poseidon,
  MerkleMap,
  VerificationKey,
  PublicKey,
} from "o1js";
import { MultipleChoiceQuestionsContract } from "../../src/multiple-choice/contract";
import {
  Question,
  FullAnswer,
  Grade,
} from "../../src/multiple-choice/questions";
import { multipleChoiceQuestionsContract, deployer } from "../../src/config";
import { fetchMinaAccount } from "../../src/lib/fetch";
import { initBlockchain } from "zkcloudworker";
import { loadFromIPFS } from "../../src/lib/storage";
import { stringFromFields, stringToFields } from "../../src/lib/hash";

const { ownerPrivateKey, contractAddress, contractPrivateKey } =
  multipleChoiceQuestionsContract;

const sender = deployer.toPublicKey();
const privateKey = contractPrivateKey;
const publicKey = privateKey.toPublicKey();
const zkApp = new MultipleChoiceQuestionsContract(publicKey);
const userPrivateKeys: PrivateKey[] = [];
const ownerPublicKey = ownerPrivateKey.toPublicKey();
let grades: Grade[] = [];
const map = new MerkleMap();

describe("Read the database of the Multiple Choice Questions Contract", () => {
  it(`should load database`, async () => {
    initBlockchain("berkeley");
    await fetchMinaAccount(publicKey);
    const storage = zkApp.storage.get();
    if (
      storage.hashString[0].toBigInt() === 0n &&
      storage.hashString[1].toBigInt() === 0n
    ) {
      console.log("No data in the database");
    } else {
      const hash = stringFromFields(storage.hashString);
      expect(hash).toBeDefined();
      if (hash === undefined) return;
      expect(hash.substring(0, 2)).toEqual("i:");
      console.log("Loading data from IPFS:", hash.substring(2));
      const data = await loadFromIPFS(hash.substring(2));
      expect(data).toBeDefined();
      if (data === undefined) return;
      const { grades: loadedGrades, newGrades: loadedNewGrades } = data;
      expect(loadedGrades).toBeDefined();
      expect(loadedNewGrades).toBeDefined();
      if (loadedGrades === undefined || loadedNewGrades === undefined) return;
      grades = loadedGrades;
      console.log("Loaded grades:", grades);
    }
  });
  it(`should verify database`, async () => {
    for (const grade of grades) {
      const address = PublicKey.fromBase58(grade.address);
      const key = Poseidon.hash(address.toFields());
      const value = Field.fromJSON(grade.grade);
      map.set(key, value);
    }
    const calculatedRoot = map.getRoot();
    const root = zkApp.root.get();
    expect(calculatedRoot.equals(root).toBoolean()).toBe(true);
  });
});
