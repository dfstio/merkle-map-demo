import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  Mina,
  Reducer,
  AccountUpdate,
  fetchAccount,
  MerkleMap,
  Bool,
  Poseidon,
} from "o1js";
import { initBlockchain, fee, accountBalanceMina } from "zkcloudworker";
import { MultipleChoiceQuestionsContract } from "../../src/multiple-choice/contract";
import { MultipleChoiceMapUpdate } from "../../src/multiple-choice/map";
import {
  multipleChoiceQuestionsContract,
  deployer as berkeleyDeployer,
  QUESTIONS_NUMBER,
  CHOICES_NUMBER,
  prefixQuestions,
} from "../../src/config";
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
import { loadFile, saveFile } from "../../src/lib/files";
import { sleep } from "zkcloudworker";
import { checkMinaZkappTransaction } from "../../src/lib/fetch";
import { Storage } from "../../src/lib/storage";

const useLocalBlockchain = false;
const { ownerPrivateKey, contractAddress, contractPrivateKey } =
  multipleChoiceQuestionsContract;
const ownerPublicKey =
  multipleChoiceQuestionsContract.ownerPrivateKey.toPublicKey();

describe("Deploy Multiple Choice Questions Contract", () => {
  let questionsCommitment: Field | undefined = undefined;
  let questions: Question[] = [];
  const storage: Storage = new Storage({ hashString: [Field(0), Field(0)] });

  it(`should generate questions`, async () => {
    console.time(
      `prepared ${QUESTIONS_NUMBER} questions with ${CHOICES_NUMBER} choices`
    );
    questions = generateQuestions(QUESTIONS_NUMBER, CHOICES_NUMBER);
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

  it(`should save questions`, async () => {
    expect(questionsCommitment).toBeDefined();
    expect(questions).toBeDefined();
    if (questionsCommitment === undefined || questions === undefined) return;
    const name = await saveFile({
      data: { questionsCommitment: questionsCommitment.toJSON(), questions },
      filename: contractAddress,
    });
  });

  it(`should load questions`, async () => {
    expect(contractAddress).toBeDefined();
    expect(questionsCommitment).toBeDefined();
    if (contractAddress === undefined || questionsCommitment === undefined)
      return;
    const data = await loadFile(contractAddress);
    expect(data).toBeDefined();
    if (data === undefined) return;
    const { questionsCommitment: commitment, questions: loadedQuestions } =
      data;
    expect(commitment).toBeDefined();
    expect(loadedQuestions).toBeDefined();
    if (commitment === undefined || loadedQuestions === undefined) return;
    const fieldCommitment = Field.fromJSON(commitment);
    expect(fieldCommitment).toBeInstanceOf(Field);
    expect(fieldCommitment.toJSON()).toEqual(questionsCommitment.toJSON());
    const calculatedCommitment = calculateQuestionsCommitment(
      loadedQuestions,
      prefixQuestions
    );
    expect(calculatedCommitment).toBeDefined();
    expect(calculatedCommitment).toBeInstanceOf(Field);
    expect(calculatedCommitment.toJSON()).toEqual(questionsCommitment.toJSON());
  });

  it(`should compile contract`, async () => {
    console.time("compiled");
    await MultipleChoiceMapUpdate.compile();
    await MultipleChoiceQuestionsContract.compile();
    console.timeEnd("compiled");
  });

  it("should deploy the contract", async () => {
    expect(ownerPrivateKey).toBeDefined();
    expect(contractAddress).toBeDefined();
    expect(contractPrivateKey).toBeDefined();
    expect(contractPrivateKey.toPublicKey().toBase58()).toBe(contractAddress);
    expect(questionsCommitment).toBeDefined();
    if (
      ownerPrivateKey === undefined ||
      contractAddress === undefined ||
      contractPrivateKey === undefined ||
      questionsCommitment === undefined
    )
      return;
    let deployer: PrivateKey | undefined = undefined;
    if (useLocalBlockchain) {
      const Local = Mina.LocalBlockchain();
      Mina.setActiveInstance(Local);
      deployer = Local.testAccounts[0].privateKey;
    } else {
      initBlockchain("berkeley");
      deployer = berkeleyDeployer;
    }
    const sender = deployer.toPublicKey();
    const privateKey = contractPrivateKey;
    const publicKey = privateKey.toPublicKey();
    const zkApp = new MultipleChoiceQuestionsContract(publicKey);
    console.log("zkApp address:", publicKey.toBase58());
    expect(deployer).toBeDefined();
    expect(sender).toBeDefined();
    if (deployer === undefined || sender === undefined) return;
    await fetchAccount({ publicKey: sender });
    const balance = await accountBalanceMina(sender);
    console.log("balance", balance);
    expect(balance).toBeGreaterThan(0);
    if (balance === 0) return;
    const map = new MerkleMap();
    const root = map.getRoot();
    const tx = await Mina.transaction(
      { sender, fee: await fee(), memo: "deploy" },
      () => {
        AccountUpdate.fundNewAccount(sender);
        zkApp.deploy({});
        zkApp.account.zkappUri.set(
          "https://MultipleChoiceQuestions.zkCloudWorker.com"
        );
        zkApp.questionsCommitment.set(questionsCommitment!);
        zkApp.root.set(root);
        zkApp.actionState.set(Reducer.initialActionState);
        zkApp.count.set(Field(0));
        zkApp.owner.set(Poseidon.hash(ownerPublicKey.toFields()));
        zkApp.isSynced.set(Bool(true));
        zkApp.storage.set(storage);
      }
    );
    const txResult = await tx.sign([deployer, privateKey]).send();
    const txHash = txResult.hash();
    console.log("tx sent:", txHash);
    expect(txHash).toBeDefined();
    if (txHash === undefined) return;
    console.log("Waiting for deploy tx to be included into block...");
    console.time("deploy tx included into block");
    let remainedTx = 1;
    while (remainedTx > 0) {
      await sleep(1000 * 30);
      const result = await checkMinaZkappTransaction(txHash);
      if (result.success) {
        console.log("deploy tx included into block:", txHash);
        remainedTx--;
      }
    }
    console.timeEnd("deploy tx included into block");
  });
});
