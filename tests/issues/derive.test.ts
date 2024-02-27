import { describe, expect, it } from "@jest/globals";
import { Field, PublicKey, Mina } from "o1js";

describe("Actions", () => {
  const contractAddress =
    "B62qmWinDr5Z6mNTLhrmYJaVpT5VkAvzPj2yNMpgvZW2tG7ecVcNAME";
  const publicKey = PublicKey.fromBase58(contractAddress);
  const startActionsState = Field.fromJSON(
    "15883099431178491989573353483798785787585407519424468142944726203792446252042"
  );
  const endActionState = Field.fromJSON(
    "5766519161874551854426173362531259652853737507928229135738402350087629707642"
  );
  let lastActionState: Field | undefined = undefined;

  beforeAll(() => {
    const network = Mina.Network({
      mina: [
        "https://api.minascan.io/node/berkeley/v1/graphql",
        "https://proxy.berkeley.minaexplorer.com/graphql",
      ],
      archive: [
        "https://api.minascan.io/archive/berkeley/v1/graphql",
        "https://archive.berkeley.minaexplorer.com",
      ],
    });
    Mina.setActiveInstance(network);
  });

  it("should get all actions", async () => {
    let actions = await Mina.fetchActions(publicKey);
    if (Array.isArray(actions)) {
      console.log("number of all actions:", actions.length);
      expect(actions.length).toBeGreaterThan(0);
      lastActionState = Field.fromJSON(actions[actions.length - 1].hash);
      console.log("lastActionState:", lastActionState.toJSON());
    } else throw new Error("actions is not an array");
  });

  it("should get actions starting from startActionsState", async () => {
    let actions = await Mina.fetchActions(publicKey, {
      fromActionState: startActionsState,
      endActionState: undefined,
    });
    if (Array.isArray(actions)) {
      console.log(
        "number of actions starting at startActionsState:",
        actions.length
      );
      expect(actions.length).toBeGreaterThan(0);
      console.log("actions starting at startActionsState:", actions);
      expect(actions[2].hash).toEqual(endActionState.toJSON());
      expect(actions[actions.length - 1].hash).toEqual(
        lastActionState?.toJSON()
      );
    } else throw new Error("actions is not an array");
  });

  it("should get actions starting from startActionsState and ending on lastActionState", async () => {
    let actions = await Mina.fetchActions(publicKey, {
      fromActionState: startActionsState,
      endActionState: endActionState,
    });
    if (Array.isArray(actions)) {
      console.log(
        "number of actions starting from startActionsState and ending on lastActionState:",
        actions.length
      );
      expect(actions.length).toBeGreaterThan(0);
    } else throw new Error("actions is not an array");
  });

  it("should get actions starting from startActionsState and ending on endActionState", async () => {
    let actions = await Mina.fetchActions(publicKey, {
      fromActionState: startActionsState,
      endActionState: endActionState,
    });
    if (Array.isArray(actions)) {
      console.log(
        "number of actions starting from startActionsState and ending on endActionState:",
        actions.length
      );
      expect(actions.length).toBeGreaterThan(0);
    } else throw new Error("actions is not an array");
  });
});
