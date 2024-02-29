import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  Mina,
  Poseidon,
  MerkleMap,
  Signature,
  VerificationKey,
  PublicKey,
} from "o1js";
import {
  MultipleChoiceQuestionsContract,
  Answer,
  AnswerData,
} from "../../src/multiple-choice/contract";
import {
  MultipleChoiceMapUpdate,
  MultipleChoiceMapUpdateProof,
} from "../../src/multiple-choice/map";
import { calculateProof } from "../../src/multiple-choice/proof";
import {
  Question,
  generateAnswers,
  generateQuestions,
  calculateAnswersCommitment,
  calculateQuestionsCommitment,
  validateQuestions,
  validateAnswers,
  FullAnswer,
  Grade,
} from "../../src/multiple-choice/questions";
import { collect } from "../../src/lib/gc";
import { Memory } from "../../src/lib/memory";
import {
  multipleChoiceQuestionsContract,
  deployer,
  QUESTIONS_NUMBER,
  CHOICES_NUMBER,
  prefixQuestions,
  prefixAnswers,
} from "../../src/config";
import {
  fetchMinaAccount,
  checkMinaZkappTransaction,
} from "../../src/lib/fetch";
import { initBlockchain, accountBalanceMina, fee, sleep } from "zkcloudworker";
import { saveToIPFS, loadFromIPFS } from "../../src/lib/storage";
import { loadFile } from "../../src/lib/files";
import { stringFromFields, stringToFields } from "../../src/lib/hash";
import { PINATA_JWT } from "../../env.json";
import { Storage } from "../../src/lib/storage";

const { ownerPrivateKey, contractAddress, contractPrivateKey } =
  multipleChoiceQuestionsContract;

const USERS_COUNT = 3;
const sender = deployer.toPublicKey();
const privateKey = contractPrivateKey;
const publicKey = privateKey.toPublicKey();
const zkApp = new MultipleChoiceQuestionsContract(publicKey);
const userPrivateKeys: PrivateKey[] = [];
const ownerPublicKey = ownerPrivateKey.toPublicKey();
let questionsCommitment: Field | undefined = undefined;
let questions: Question[] = [];
let answers: FullAnswer[] = [];
let grades: Grade[] = [];
const map = new MerkleMap();
let verificationKey: VerificationKey | undefined = undefined;

describe("Multiple Choice Questions Contract", () => {
  it(`should load questions`, async () => {
    initBlockchain("berkeley");
    console.log("Loading questions...");
    expect(contractAddress).toBeDefined();
    if (contractAddress === undefined) return;
    const data = await loadFile(contractAddress);
    //console.log("loaded data", data);
    expect(data).toBeDefined();
    if (data === undefined) return;
    const { questionsCommitment: commitment, questions: loadedQuestions } =
      data;
    expect(commitment).toBeDefined();
    expect(loadedQuestions).toBeDefined();
    if (commitment === undefined || loadedQuestions === undefined) return;
    const fieldCommitment = Field.fromJSON(commitment);
    expect(fieldCommitment).toBeInstanceOf(Field);
    questionsCommitment = fieldCommitment;
    //console.log("loaded questionsCommitment", questionsCommitment.toJSON());
    const calculatedCommitment = calculateQuestionsCommitment(
      loadedQuestions,
      prefixQuestions
    );
    expect(calculatedCommitment).toBeDefined();
    expect(calculatedCommitment).toBeInstanceOf(Field);
    expect(calculatedCommitment.toJSON()).toEqual(questionsCommitment.toJSON());
    questions = loadedQuestions;
    expect(questions.length).toBe(QUESTIONS_NUMBER);
  });

  it(`should validate questions`, async () => {
    expect(questions.length).toBe(QUESTIONS_NUMBER);
    const checkQuestions = validateQuestions(questions);
    expect(checkQuestions).toBe(true);
  });

  it(`should create users`, async () => {
    for (let i = 0; i < USERS_COUNT; i++) {
      userPrivateKeys.push(PrivateKey.random());
    }
    expect(userPrivateKeys.length).toEqual(USERS_COUNT);
  });

  it(`should generate valid answers`, async () => {
    //console.log("questionsCommitment", questionsCommitment?.toJSON());
    expect(questionsCommitment).toBeDefined();
    if (questionsCommitment === undefined) return;
    console.time(`prepared answers`);
    const generatedAnswers = generateAnswers(
      questions,
      questionsCommitment,
      USERS_COUNT,
      true
    );
    console.timeEnd(`prepared answers`);
    expect(generatedAnswers).toBeDefined();
    for (let i = 0; i < USERS_COUNT; i++) {
      const checkAnswer = validateAnswers(
        questions,
        prefixQuestions,
        generatedAnswers[i],
        0
      );
      expect(checkAnswer).toBe(true);
      const commitment = calculateAnswersCommitment(
        generatedAnswers[i],
        prefixAnswers
      );
      const address = userPrivateKeys[i].toPublicKey();
      const addressHash = Poseidon.hash(address.toFields());
      const hash = Poseidon.hash([commitment, ...address.toFields()]);
      const answer = new Answer({
        commitment,
        address,
        addressHash,
        hash,
      });
      const data: AnswerData = new AnswerData({
        commitment,
        address,
        signature: Signature.create(userPrivateKeys[i], answer.toFields()),
      });
      answers.push({ answer: generatedAnswers[i], data });
    }
  });

  it(`should load database`, async () => {
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

  it(`should compile contracts`, async () => {
    console.log("Compiling contracts...");
    console.time("MultipleChoiceMapUpdate compiled");
    verificationKey = (await MultipleChoiceMapUpdate.compile()).verificationKey;
    console.timeEnd("MultipleChoiceMapUpdate compiled");

    console.time("MultipleChoiceQuestionsContract compiled");
    await MultipleChoiceQuestionsContract.compile();
    console.timeEnd("MultipleChoiceQuestionsContract compiled");
    Memory.info(`should compile the SmartContract`);
  });

  it("should update the state using bulk update", async () => {
    expect(ownerPrivateKey).toBeDefined();
    expect(contractAddress).toBeDefined();
    expect(contractPrivateKey).toBeDefined();
    expect(contractPrivateKey.toPublicKey().toBase58()).toBe(contractAddress);
    expect(PINATA_JWT).toBeDefined();
    expect(deployer).toBeDefined();
    if (
      ownerPrivateKey === undefined ||
      contractAddress === undefined ||
      contractPrivateKey === undefined ||
      deployer === undefined ||
      PINATA_JWT === undefined
    )
      return;
    await fetchMinaAccount(sender);
    await fetchMinaAccount(publicKey);
    const balance = await accountBalanceMina(sender);
    console.log("balance", balance);
    expect(balance).toBeGreaterThan(0);
    if (balance === 0) return;
    const count: Field = zkApp.count.get();
    const root: Field = zkApp.root.get();
    console.log("initial count:", count.toJSON());
    console.log("initial root:", root.toJSON());
    console.time("bulk update");
    expect(verificationKey).toBeDefined();
    if (verificationKey === undefined) return;
    const { proof, grades: newGrades } = await calculateProof(
      answers,
      questions,
      prefixQuestions,
      map,
      verificationKey,
      true
    );
    const signature = Signature.create(
      ownerPrivateKey,
      proof.publicInput.toFields()
    );
    for (const grade of newGrades) grades.push(grade);
    const hash = await saveToIPFS({ grades, newGrades }, PINATA_JWT);
    expect(hash).toBeDefined();
    if (hash === undefined) return;
    const fields = stringToFields(`i:${hash}`);
    const storage: Storage = new Storage({
      hashString: [fields[0], fields[1]],
    });

    const tx = await Mina.transaction(
      { sender, fee: await fee(), memo: "bulk update" },
      () => {
        zkApp.bulkUpdate(proof, signature, ownerPublicKey, storage);
      }
    );
    await collect();
    await tx.prove();
    const txResult = await tx.sign([deployer]).send();
    const txHash = txResult.hash();
    console.log("tx sent:", txHash);
    Memory.info(`should bulk update the state`);
    console.timeEnd("bulk update");
    expect(txHash).toBeDefined();
    if (txHash === undefined) return;
    console.log("Waiting for bulk update tx to be included into block...");
    console.time("bulk update tx included into block");
    let remainedTx = 1;
    while (remainedTx > 0) {
      await sleep(1000 * 30);
      const result = await checkMinaZkappTransaction(txHash);
      if (result.success) {
        console.log("bulk update tx included into block:", txHash);
        remainedTx--;
      }
    }
    console.timeEnd("bulk update tx included into block");
    await sleep(1000 * 10);
    await fetchMinaAccount(publicKey);
    const count1: Field = zkApp.count.get();
    const root1: Field = zkApp.root.get();
    console.log("final count:", count1.toJSON());
    console.log("final root:", root1.toJSON());
  });
});
