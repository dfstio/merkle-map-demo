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
  MultipleChoiceQuestionsContract,
  Answer,
  AnswerData,
  ReducerState,
  BATCH_SIZE,
} from "../src/multiple-choice/contract";
import {
  MultipleChoiceMapUpdate,
  MultipleChoiceMapUpdateProof,
} from "../src/multiple-choice/map";
import { calculateProof } from "../src/multiple-choice/proof";
import { emptyActionsHash, calculateActionsHash } from "../src/lib/hash";
import {
  Question,
  generateAnswers,
  generateQuestions,
  calculateAnswersCommitment,
  calculateQuestionsCommitment,
  validateQuestions,
  validateAnswers,
  FullAnswer,
} from "../src/multiple-choice/questions";
import { collect } from "../src/lib/gc";
import { Memory } from "../src/lib/memory";

const USERS_COUNT = 10;
const BULK_UPDATE_COUNT = Math.floor(USERS_COUNT / 2);
const ACTIONS_COUNT = USERS_COUNT - BULK_UPDATE_COUNT;
const QUESTIONS_NUMBER = 10;
const CHOICES_NUMBER = 5;
const prefixQuestions = "questions";
const prefixAnswers = "answers";

let verificationKey: VerificationKey | undefined = undefined;

describe("Multiple Choice Questions Contract", () => {
  const Local = Mina.LocalBlockchain();
  Mina.setActiveInstance(Local);
  const deployer = Local.testAccounts[0].privateKey;
  const sender = deployer.toPublicKey();
  const privateKey = PrivateKey.random();
  const publicKey = privateKey.toPublicKey();
  const zkApp = new MultipleChoiceQuestionsContract(publicKey);
  const userPrivateKeys: PrivateKey[] = [];
  const ownerPrivateKey = PrivateKey.random(); // owner of the contract
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
    console.time(`calculated commitment for questions`);
    const commitment = calculateQuestionsCommitment(questions, prefixQuestions);
    console.timeEnd(`calculated commitment for questions`);
    console.log(`questions commitment`, commitment.toJSON());
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

  it(`should compile contract`, async () => {
    await collect();
    console.time("methods analyzed");
    let methods = MultipleChoiceQuestionsContract.analyzeMethods();
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
      `method's total size for a MultipleChoiceQuestionsContract with batch size ${BATCH_SIZE} is ${size} rows (${percentage}% of max ${maxRows} rows)`
    );
    for (const method in methods) {
      console.log(method, `rows:`, methods[method].rows);
    }

    const methods1 = MultipleChoiceMapUpdate.analyzeMethods();

    //console.log("methods", methods1);
    // calculate the size of the contract - the sum or rows for each method
    size = Object.values(methods1).reduce(
      (acc, method) => acc + method.rows,
      0
    );
    // calculate percentage rounded to 0 decimal places
    percentage = Math.round((size / maxRows) * 100);

    console.log(
      `method's total size for a MultipleChoiceMapUpdate is ${size} rows (${percentage}% of max ${maxRows} rows)`
    );

    console.log("Compiling contracts...");
    console.time("MultipleChoiceMapUpdate compiled");
    verificationKey = (await MultipleChoiceMapUpdate.compile()).verificationKey;
    console.timeEnd("MultipleChoiceMapUpdate compiled");

    console.time("MultipleChoiceQuestionsContract compiled");
    await MultipleChoiceQuestionsContract.compile();
    console.timeEnd("MultipleChoiceQuestionsContract compiled");
    Memory.info(`should compile the SmartContract`);
  });

  it("should deploy the contract", async () => {
    expect(deployer).toBeDefined();
    expect(sender).toBeDefined();
    if (deployer === undefined || sender === undefined) return;
    expect(questionsCommitment).toBeDefined();
    if (questionsCommitment === undefined) return;
    const root = map.getRoot();
    const tx = await Mina.transaction({ sender }, () => {
      AccountUpdate.fundNewAccount(sender);
      zkApp.deploy({});
      zkApp.questionsCommitment.set(questionsCommitment!);
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

  it("should send the actions with answers", async () => {
    console.time("sent answers");
    for (let i = 0; i < ACTIONS_COUNT; i++) {
      const tx = await Mina.transaction({ sender }, () => {
        zkApp.add(answers[i].data);
      });
      await collect();
      Memory.info(`answer ${i + 1}/${ACTIONS_COUNT} sent`);
      await tx.prove();
      if (i === 0) Memory.info(`Setting base for RSS memory`, false, true);
      await tx.sign([deployer]).send();
    }
    console.timeEnd("sent answers");
    Memory.info(`should send the answers`);
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
      expect(actions2.length).toBe(actions.length);
      for (let i = 0; i < actions2.length; i++) {
        //console.log("action", i, actions2[i].actions[0]);
        //console.log("hash", actions2[i].hash);

        actionState = calculateActionsHash(actions2[i].actions, actionState);
        //console.log("actionState", actionState.toJSON());
        expect(actionState.toJSON()).toEqual(actions2[i].hash);
      }
    }
    expect(finalActionState.toJSON()).toEqual(actionState.toJSON());
  });

  it("should update the state using actions", async () => {
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
        const actionsAnswers: FullAnswer[] = [];
        for (let i = 0; i < length; i++) {
          const actionAnswer: Answer = Answer.fromFields(
            actions[i].actions[0].map((f: string) => Field.fromJSON(f))
          );
          hash = hash.add(actionAnswer.hash);
          const answer: FullAnswer | undefined = answers.find((a) =>
            a.data.address.toBase58() === actionAnswer.address.toBase58() &&
            a.data.commitment.toJSON() === actionAnswer.commitment.toJSON()
              ? a
              : undefined
          );
          expect(answer).toBeDefined();
          if (answer === undefined) return;
          actionsAnswers.push(answer);
        }
        const reducerState = new ReducerState({
          count: Field(length),
          hash,
        });
        const endActionState: Field = Field.fromJSON(actions[length - 1].hash);

        expect(verificationKey).toBeDefined();
        if (verificationKey === undefined) return;
        const proof: MultipleChoiceMapUpdateProof = await calculateProof(
          actionsAnswers,
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

  it("should update the state using bulk update", async () => {
    const isSynced = zkApp.isSynced.get().toBoolean();
    expect(isSynced).toEqual(true);
    console.time("bulk update");
    const bulkAnswers: FullAnswer[] = [];
    for (let i = ACTIONS_COUNT; i < USERS_COUNT; i++) {
      bulkAnswers.push(answers[i]);
    }

    expect(verificationKey).toBeDefined();
    if (verificationKey === undefined) return;
    const proof: MultipleChoiceMapUpdateProof = await calculateProof(
      bulkAnswers,
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

    const tx = await Mina.transaction({ sender }, () => {
      zkApp.bulkUpdate(proof, signature);
    });
    await collect();
    await tx.prove();
    await tx.sign([deployer]).send();
    Memory.info(`should bulk update the state`);
    console.timeEnd("bulk update");
  });
});
