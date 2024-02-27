import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  Mina,
  Poseidon,
  MerkleMap,
  Signature,
  VerificationKey,
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
} from "../../src/multiple-choice/questions";
import { collect } from "../../src/lib/gc";
import { Memory } from "../../src/lib/memory";
import { multipleChoiceQuestionsContract, deployer } from "../../src/config";
import {
  fetchMinaAccount,
  checkMinaZkappTransaction,
} from "../../src/lib/fetch";
import { initBlockchain, accountBalanceMina, fee, sleep } from "zkcloudworker";

const { ownerPrivateKey, contractAddress, contractPrivateKey } =
  multipleChoiceQuestionsContract;

const USERS_COUNT = 5;
const QUESTIONS_NUMBER = 10;
const CHOICES_NUMBER = 5;
const prefixQuestions = "questions";
const prefixAnswers = "answers";

let verificationKey: VerificationKey | undefined = undefined;

describe("Multiple Choice Questions Contract", () => {
  initBlockchain("berkeley");
  const sender = deployer.toPublicKey();
  const privateKey = contractPrivateKey;
  const publicKey = privateKey.toPublicKey();
  const zkApp = new MultipleChoiceQuestionsContract(publicKey);
  const userPrivateKeys: PrivateKey[] = [];
  const ownerPublicKey = ownerPrivateKey.toPublicKey();
  let questionsCommitment: Field | undefined = undefined;
  let questions: Question[] = [];
  let answers: FullAnswer[] = [];
  const map = new MerkleMap();

  it(`should generate questions`, async () => {
    console.time(
      `prepared ${QUESTIONS_NUMBER} questions with ${CHOICES_NUMBER} choices`
    );
    questions = await generateQuestions(QUESTIONS_NUMBER, CHOICES_NUMBER);
    console.timeEnd(
      `prepared ${QUESTIONS_NUMBER} questions with ${CHOICES_NUMBER} choices`
    );
  });

  it(`should validate questions`, async () => {
    const checkQuestions = validateQuestions(questions);
    expect(checkQuestions).toBe(true);
  });

  it(`should calculate commitment for questions`, async () => {
    const commitment = calculateQuestionsCommitment(questions, prefixQuestions);
    expect(commitment).toBeDefined();
    expect(commitment).toBeInstanceOf(Field);
    questionsCommitment = commitment;
  });

  it(`should create users`, async () => {
    for (let i = 0; i < USERS_COUNT; i++) {
      userPrivateKeys.push(PrivateKey.random());
    }
    expect(userPrivateKeys.length).toEqual(USERS_COUNT);
  });

  it(`should generate valid answers`, async () => {
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
    expect(deployer).toBeDefined();
    if (
      ownerPrivateKey === undefined ||
      contractAddress === undefined ||
      contractPrivateKey === undefined ||
      deployer === undefined
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
    const map = new MerkleMap();
    const emptyRoot = map.getRoot();
    const emptyCount = Field(0);
    if (
      root.equals(emptyRoot).toBoolean() === false ||
      count.equals(emptyCount).toBoolean() === false
    ) {
      console.log(
        "Root and count are not empty. Please reset the state before running the test"
      );
      return;
    }
    console.time("bulk update");
    expect(verificationKey).toBeDefined();
    if (verificationKey === undefined) return;
    const proof: MultipleChoiceMapUpdateProof = await calculateProof(
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

    const tx = await Mina.transaction(
      { sender, fee: await fee(), memo: "bulk update" },
      () => {
        zkApp.bulkUpdate(proof, signature);
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
  });
});
