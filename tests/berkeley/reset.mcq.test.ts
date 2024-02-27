import { describe, expect, it } from "@jest/globals";
import {
  formatTime,
  sleep,
  initBlockchain,
  Memory,
  accountBalanceMina,
  fee,
} from "zkcloudworker";
import { Field, PublicKey, MerkleMap, Signature, Mina } from "o1js";
import { MultipleChoiceQuestionsContract } from "../../src/multiple-choice/contract";
import { MultipleChoiceMapUpdate } from "../../src/multiple-choice/map";
import { multipleChoiceQuestionsContract, deployer } from "../../src/config";
import {
  checkMinaZkappTransaction,
  fetchMinaAccount,
} from "../../src/lib/fetch";

const { ownerPrivateKey, contractAddress, contractPrivateKey } =
  multipleChoiceQuestionsContract;
const ownerPublicKey =
  multipleChoiceQuestionsContract.ownerPrivateKey.toPublicKey();

describe("Reset Multiple Choice Questions Contract", () => {
  const publicKey = PublicKey.fromBase58(contractAddress);
  let initialValue = Field(0);
  initBlockchain("berkeley");

  let initialRoot: Field = Field(0);
  let initialCount: Field = Field(0);

  it("should get initial value", async () => {
    await fetchMinaAccount(publicKey);
    const zkApp = new MultipleChoiceQuestionsContract(publicKey);
    const count: Field = zkApp.count.get();
    const root: Field = zkApp.root.get();
    console.log("initial count:", count.toJSON());
    console.log("initial root:", root.toJSON());
    initialRoot = root;
    initialCount = count;
  });

  it("should reset the value", async () => {
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
    const map = new MerkleMap();
    const root = map.getRoot();
    const count = Field(0);
    if (
      root.equals(initialRoot).toBoolean() &&
      count.equals(initialCount).toBoolean()
    ) {
      console.log(
        "Root and count are the same as initial ones. No need to reset"
      );
      return;
    }
    const signature = Signature.create(ownerPrivateKey, [root, count]);
    console.time("compiled");
    await MultipleChoiceMapUpdate.compile();
    await MultipleChoiceQuestionsContract.compile();
    console.timeEnd("compiled");

    const startTime = Date.now();
    const sender = deployer.toPublicKey();
    const zkApp = new MultipleChoiceQuestionsContract(publicKey);
    console.log("zkApp address:", publicKey.toBase58());
    expect(deployer).toBeDefined();
    expect(sender).toBeDefined();
    if (deployer === undefined || sender === undefined) return;
    await fetchMinaAccount(sender);
    await fetchMinaAccount(publicKey);
    const balance = await accountBalanceMina(sender);
    console.log("balance", balance);
    expect(balance).toBeGreaterThan(0);
    if (balance === 0) return;
    const tx = await Mina.transaction(
      { sender, fee: await fee(), memo: "reset" },
      () => {
        zkApp.setRoot(root, count, signature);
      }
    );
    await tx.prove();
    const txResult = await tx.sign([deployer]).send();
    const txHash = txResult.hash();
    console.log("tx sent:", txHash);
    Memory.info(`reset`);
    const endTime = Date.now();
    console.log(
      `Time spent to sent the reset tx: ${formatTime(endTime - startTime)} (${
        endTime - startTime
      } ms)`
    );
    expect(txHash).toBeDefined();
    if (txHash === undefined) return;
    expect(txHash).not.toBe("");
    if (txHash === "") return;
    console.log("Waiting for reset tx to be included into block...");
    console.time("reset tx included into block");
    let remainedTx = 1;
    while (remainedTx > 0) {
      await sleep(1000 * 30);
      const result = await checkMinaZkappTransaction(txHash);
      if (result.success) {
        console.log("reset tx included into block:", txHash);
        remainedTx--;
      }
    }
    console.timeEnd("reset tx included into block");
  });

  it("should get final values", async () => {
    await fetchMinaAccount(publicKey);
    const zkApp = new MultipleChoiceQuestionsContract(publicKey);
    const count: Field = zkApp.count.get();
    const root: Field = zkApp.root.get();
    console.log("final count:", count.toJSON());
    console.log("final root:", root.toJSON());
    initialValue = count;
  });
});
