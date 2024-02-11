import { describe, expect, it } from "@jest/globals";
import {
  zkCloudWorker,
  formatTime,
  sleep,
  initBlockchain,
  Memory,
} from "zkcloudworker";
import {
  Field,
  PublicKey,
  checkZkappTransaction as o1js_checkZkappTransaction,
  fetchAccount as o1js_fetchAccount,
  MerkleMap,
  Signature,
} from "o1js";
import { MapContract, MapElement } from "../src/mapcontract";
import { JWT, contractAddress, ownerPrivateKey } from "../src/config";

describe("Merkle map demo reset", () => {
  const publicKey = PublicKey.fromBase58(contractAddress);
  let calculateJobId = "";
  const api = new zkCloudWorker(JWT);
  let initialValue = Field(0);
  initBlockchain("berkeley");

  let initialRoot: Field = Field(0);
  let initialCount: Field = Field(0);

  it("should get initial value", async () => {
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const count: Field = zkApp.count.get();
    const root: Field = zkApp.root.get();
    console.log("initial count:", count.toJSON());
    console.log("initial root:", root.toJSON());
    initialRoot = root;
    initialCount = count;
  });

  it("should reset the value", async () => {
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
    const tx = {
      root: root.toJSON(),
      count: count.toJSON(),
      signature: signature.toBase58(),
    };
    const args = ["setRoot", contractAddress];

    const apiresult = await api.createJob({
      name: "nameservice",
      task: "send",
      transactions: [JSON.stringify(tx, null, 2)],
      args,
      developer: "@staketab",
    });
    const startTime = Date.now();
    console.log("reset api call result", apiresult);
    expect(apiresult.success).toBe(true);
    expect(apiresult.jobId).toBeDefined();
    if (apiresult.jobId === undefined) return;
    calculateJobId = apiresult.jobId;
    Memory.info(`reset`);
    const result = await api.waitForJobResult({ jobId: calculateJobId });
    const endTime = Date.now();
    console.log(
      `Time spent to sent the reset tx: ${formatTime(endTime - startTime)} (${
        endTime - startTime
      } ms)`
    );
    console.log("reset api call result", result);
    expect(result.success).toBe(true);
    if (result.success === false) return;
    const txHash = result.result.result;
    console.log("txHash", txHash);
    expect(txHash).toBeDefined();
    if (txHash === undefined) return;
    expect(txHash).not.toBe("");
    if (txHash === "") return;
    console.log("Waiting for reset tx to be included into block...");
    console.time("reset tx included into block");
    let remainedTx = 1;
    while (remainedTx > 0) {
      await sleep(1000 * 30);
      const result = await checkZkappTransaction(txHash);
      if (result.success) {
        console.log("reset tx included into block:", txHash);
        remainedTx--;
      }
    }
    console.timeEnd("reset tx included into block");
  });

  it("should get final values", async () => {
    await fetchAccount(publicKey);
    const zkApp = new MapContract(publicKey);
    const count: Field = zkApp.count.get();
    const root: Field = zkApp.root.get();
    console.log("final count:", count.toJSON());
    console.log("final root:", root.toJSON());
    initialValue = count;
  });
});

async function checkZkappTransaction(hash: string) {
  try {
    const result = await o1js_checkZkappTransaction(hash);
    return result;
  } catch (error) {
    console.error("Error in checkZkappTransaction:", error);
    return { success: false };
  }
}

async function fetchAccount(publicKey: PublicKey) {
  const timeout = 1000 * 60 * 5; // 5 minutes
  const startTime = Date.now();
  let result = { account: undefined };
  while (Date.now() - startTime < timeout) {
    try {
      const result = await o1js_fetchAccount({
        publicKey,
      });
      if (result.account !== undefined) return result;
      console.log("Cannot fetch account", publicKey.toBase58(), result);
    } catch (error) {
      console.log("Error in fetchAccount:", error);
    }
    await sleep(1000 * 10);
  }
  console.log("Timeout in fetchAccount");
  return result;
}
