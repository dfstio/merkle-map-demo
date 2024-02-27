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
} from "o1js";
import { initBlockchain, fee, accountBalanceMina } from "zkcloudworker";
import { MultipleChoiceQuestionsContract } from "../../src/multiple-choice/contract";
import { MultipleChoiceMapUpdate } from "../../src/multiple-choice/map";
import {
  multipleChoiceQuestionsContract,
  deployer as berkeleyDeployer,
} from "../../src/config";

const useLocalBlockchain = false;
const { ownerPrivateKey, contractAddress, contractPrivateKey } =
  multipleChoiceQuestionsContract;
const ownerPublicKey =
  multipleChoiceQuestionsContract.ownerPrivateKey.toPublicKey();

describe("Deploy Multiple Choice Questions Contract", () => {
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
        zkApp.questionsCommitment.set(Field(0));
        zkApp.root.set(root);
        zkApp.actionState.set(Reducer.initialActionState);
        zkApp.count.set(Field(0));
        zkApp.owner.set(ownerPublicKey);
        zkApp.isSynced.set(Bool(true));
      }
    );
    const txResult = await tx.sign([deployer, privateKey]).send();
    console.log("tx sent:", txResult.hash());
  });
});
