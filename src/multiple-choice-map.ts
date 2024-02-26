export {
  MultipleChoiceMapUpdate,
  MultipleChoiceMapTransition,
  MultipleChoiceMapUpdateProof,
  MultipleChoiceMapUpdateData,
};
import {
  Field,
  SelfProof,
  ZkProgram,
  Struct,
  MerkleMapWitness,
  PublicKey,
  Poseidon,
} from "o1js";

class MultipleChoiceMapUpdateData extends Struct({
  oldRoot: Field,
  newRoot: Field,
  key: Field,
  oldValue: Field,
  newValue: Field,
  witness: MerkleMapWitness,
}) {
  toFields(): Field[] {
    return [
      this.oldRoot,
      this.newRoot,
      this.key,
      this.oldValue,
      this.newValue,
      ...this.witness.toFields(),
    ];
  }

  static fromFields(fields: Field[]): MultipleChoiceMapUpdateData {
    return new MultipleChoiceMapUpdateData({
      oldRoot: fields[0],
      newRoot: fields[1],
      key: fields[2],
      oldValue: fields[3],
      newValue: fields[4],
      witness: MerkleMapWitness.fromFields(fields.slice(5)),
    });
  }
}

class MultipleChoiceMapTransition extends Struct({
  oldRoot: Field,
  newRoot: Field,
  hash: Field, // sum of hashes of all the new keys and values of the Map
  count: Field, // number of new keys in the Map
}) {
  static accept(
    update: MultipleChoiceMapUpdateData,
    address: PublicKey,
    commitment: Field
  ) {
    const [dataWitnessRootBefore, dataWitnessKey] =
      update.witness.computeRootAndKey(update.oldValue);
    update.oldRoot.assertEquals(dataWitnessRootBefore);
    dataWitnessKey.assertEquals(update.key);

    const [dataWitnessRootAfter, _] = update.witness.computeRootAndKey(
      update.newValue
    );
    update.newRoot.assertEquals(dataWitnessRootAfter);
    const addressHash = Poseidon.hash(address.toFields());
    addressHash.assertEquals(update.key);
    commitment.assertEquals(update.newValue);

    return new MultipleChoiceMapTransition({
      oldRoot: update.oldRoot,
      newRoot: update.newRoot,
      hash: Poseidon.hash([update.key, ...address.toFields()]),
      count: Field(1),
    });
  }

  static reject(root: Field, address: PublicKey, commitment: Field) {
    return new MultipleChoiceMapTransition({
      oldRoot: root,
      newRoot: root,
      hash: Poseidon.hash([commitment, ...address.toFields()]),
      count: Field(1),
    });
  }

  static merge(
    transition1: MultipleChoiceMapTransition,
    transition2: MultipleChoiceMapTransition
  ) {
    transition1.newRoot.assertEquals(transition2.oldRoot);
    return new MultipleChoiceMapTransition({
      oldRoot: transition1.oldRoot,
      newRoot: transition2.newRoot,
      hash: transition1.hash.add(transition2.hash),
      count: transition1.count.add(transition2.count),
    });
  }

  static assertEquals(
    transition1: MultipleChoiceMapTransition,
    transition2: MultipleChoiceMapTransition
  ) {
    transition1.oldRoot.assertEquals(transition2.oldRoot);
    transition1.newRoot.assertEquals(transition2.newRoot);
    transition1.hash.assertEquals(transition2.hash);
    transition1.count.assertEquals(transition2.count);
  }

  toFields(): Field[] {
    return [this.oldRoot, this.newRoot, this.hash, this.count];
  }

  static fromFields(fields: Field[]): MultipleChoiceMapTransition {
    return new MultipleChoiceMapTransition({
      oldRoot: fields[0],
      newRoot: fields[1],
      hash: fields[2],
      count: fields[3],
    });
  }
}

const MultipleChoiceMapUpdate = ZkProgram({
  name: "MultipleChoiceMapUpdate",
  publicInput: MultipleChoiceMapTransition,

  methods: {
    accept: {
      privateInputs: [MultipleChoiceMapUpdateData, PublicKey, Field],

      method(
        state: MultipleChoiceMapTransition,
        update: MultipleChoiceMapUpdateData,
        address: PublicKey,
        commitment: Field
      ) {
        const computedState = MultipleChoiceMapTransition.accept(
          update,
          address,
          commitment
        );
        MultipleChoiceMapTransition.assertEquals(computedState, state);
      },
    },

    reject: {
      privateInputs: [Field, PublicKey, Field],

      method(
        state: MultipleChoiceMapTransition,
        root: Field,
        address: PublicKey,
        commitment: Field
      ) {
        const computedState = MultipleChoiceMapTransition.reject(
          root,
          address,
          commitment
        );
        MultipleChoiceMapTransition.assertEquals(computedState, state);
      },
    },

    merge: {
      privateInputs: [SelfProof, SelfProof],

      method(
        newState: MultipleChoiceMapTransition,
        proof1: SelfProof<MultipleChoiceMapTransition, void>,
        proof2: SelfProof<MultipleChoiceMapTransition, void>
      ) {
        proof1.verify();
        proof2.verify();
        const computedState = MultipleChoiceMapTransition.merge(
          proof1.publicInput,
          proof2.publicInput
        );
        MultipleChoiceMapTransition.assertEquals(computedState, newState);
      },
    },
  },
});

class MultipleChoiceMapUpdateProof extends ZkProgram.Proof(
  MultipleChoiceMapUpdate
) {}
