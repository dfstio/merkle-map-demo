import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  PublicKey,
  Mina,
  Reducer,
  AccountUpdate,
  fetchAccount,
} from "o1js";
import { initBlockchain, fee, accountBalanceMina } from "zkcloudworker";
import { MapContract } from "../src/contract";}

const useLocalBlockchain = false;

describe("Contract", () => {
  it(`should compile contract`, async () => {
    console.time("compiled");
    await MapContract.compile();
    console.timeEnd("compiled");
  });

  it("should deploy the contract", async () => {
    let deployer: PrivateKey | undefined = undefined;
    if (useLocalBlockchain) {
      const Local = Mina.LocalBlockchain();
      Mina.setActiveInstance(Local);
      deployer = Local.testAccounts[0].privateKey;
    } else {
      initBlockchain("berkeley");
      deployer = PrivateKey.fromBase58(
        "EKE1Ci9u5HsYnzEpCzrXZH92PnLoemLRJ8deBARY9MSnasr9zHfm"
      );
    }
    const sender = deployer.toPublicKey();
    const privateKey = PrivateKey.random();
    const publicKey = privateKey.toPublicKey();
    const zkApp = new MapContract(publicKey);
    console.log("zkApp address:", publicKey.toBase58());
    expect(deployer).toBeDefined();
    expect(sender).toBeDefined();
    if (deployer === undefined || sender === undefined) return;
    await fetchAccount({ publicKey: sender });
    const balance = await accountBalanceMina(sender);
    console.log("balance", balance);
    expect(balance).toBeGreaterThan(0);
    if (balance === 0) return;
    const tx = await Mina.transaction({ sender, fee: await fee() }, () => {
      AccountUpdate.fundNewAccount(sender);
      zkApp.deploy({});
      zkApp.actionState.set(Reducer.initialActionState);
      zkApp.account.zkappUri.set("https://zkCloudWorker.com");
    });
    const txResult = await tx.sign([deployer, privateKey]).send();
    console.log("tx sent:", txResult.hash());
  });
});
