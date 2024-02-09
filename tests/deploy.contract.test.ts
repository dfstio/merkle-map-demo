import { describe, expect, it } from "@jest/globals";
import {
  Field,
  PrivateKey,
  PublicKey,
  Mina,
  Reducer,
  AccountUpdate,
  fetchAccount,
  MerkleMap,
  UInt64,
} from "o1js";
import { initBlockchain, fee, accountBalanceMina } from "zkcloudworker";
import { MapContract } from "../src/mapcontract";
import { MapUpdate } from "../src/update";

const useLocalBlockchain = false;
const ownerPrivateKey = PrivateKey.fromBase58(
  "EKFRg9MugtXvFPe4N6Au28kQyYx9txt4CVPgBPRYdv4wvbKBJpEy"
); // owner of the contract
const ownerPublicKey = ownerPrivateKey.toPublicKey();

describe("Contract", () => {
  it(`should compile contract`, async () => {
    console.time("compiled");
    await MapUpdate.compile();
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
        "EKEM8aqm9HNJjnpPjgZELpDR8XnPAD3qX2sQEnZEV1JoYKdhBkFY"
      );
    }
    const sender = deployer.toPublicKey();
    const privateKey = PrivateKey.fromBase58(
      "EKFS3ASxumPaqSj8jbToypjoraXGb4ZRV6kYUxjms3mwkFzU4qoZ"
    );
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
    const map = new MerkleMap();
    const root = map.getRoot();
    const tx = await Mina.transaction({ sender, fee: await fee() }, () => {
      AccountUpdate.fundNewAccount(sender);
      zkApp.deploy({});
      zkApp.account.zkappUri.set("https://MinaNameService.zkCloudWorker.com");
      zkApp.domain.set(Field(0));
      zkApp.root.set(root);
      zkApp.actionState.set(Reducer.initialActionState);
      zkApp.count.set(UInt64.from(0));
      zkApp.owner.set(ownerPublicKey);
    });
    const txResult = await tx.sign([deployer, privateKey]).send();
    console.log("tx sent:", txResult.hash());
  });
});
