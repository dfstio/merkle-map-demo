import {
  Field,
  state,
  State,
  method,
  SmartContract,
  DeployArgs,
  Reducer,
  Permissions,
  Struct,
  PublicKey,
  Bool,
  Poseidon,
  Signature,
} from "o1js";

import { MultipleChoiceMapUpdateProof } from "./map";
import { Storage } from "../lib/storage";

export const BATCH_SIZE = 3;

export class Answer extends Struct({
  commitment: Field,
  address: PublicKey,
  addressHash: Field, // Poseidon hash of address.toFields()
  hash: Field, // Poseidon hash of [commitment, ...address.toFields()]
}) {
  toFields(): Field[] {
    return [
      this.commitment,
      ...this.address.toFields(),
      this.addressHash,
      this.hash,
    ];
  }

  static fromFields(fields: Field[]): Answer {
    return new Answer({
      commitment: fields[0],
      address: PublicKey.fromFields(fields.slice(1, 3)),
      addressHash: fields[3],
      hash: fields[4],
    });
  }
}

export class AnswerData extends Struct({
  commitment: Field,
  address: PublicKey,
  signature: Signature,
}) {
  toFields(): Field[] {
    return [
      this.commitment,
      ...this.address.toFields(),
      ...this.signature.toFields(),
    ];
  }
  static fromFields(fields: Field[]): AnswerData {
    return new AnswerData({
      commitment: fields[0],
      address: PublicKey.fromFields(fields.slice(1, 3)),
      signature: Signature.fromFields(fields.slice(3)),
    });
  }
}

export class ReducerState extends Struct({
  count: Field,
  hash: Field,
}) {
  static assertEquals(a: ReducerState, b: ReducerState) {
    a.count.assertEquals(b.count);
    a.hash.assertEquals(b.hash);
  }
}

export class MultipleChoiceQuestionsContract extends SmartContract {
  @state(Field) questionsCommitment = State<Field>();
  @state(Field) root = State<Field>();
  @state(Field) count = State<Field>();
  @state(Field) actionState = State<Field>();
  @state(Field) owner = State<Field>();
  @state(Storage) storage = State<Storage>();
  @state(Bool) isSynced = State<Bool>();

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proof(),
    });
  }

  reducer = Reducer({
    actionType: Answer,
  });

  events = {
    add: Answer,
    reduce: ReducerState,
    bulkUpdate: Field,
    storage: Storage,
  };

  @method add(answerData: AnswerData) {
    const { commitment, address, signature } = answerData;
    const addressHash = Poseidon.hash(address.toFields());
    const hash = Poseidon.hash([commitment, ...address.toFields()]);
    const answer = new Answer({
      commitment,
      address,
      addressHash,
      hash,
    });
    signature.verify(address, answer.toFields()).assertEquals(true);
    this.reducer.dispatch(answer);
    this.emitEvent("add", answer);
  }

  @method reduce(
    startActionState: Field,
    endActionState: Field,
    reducerState: ReducerState,
    proof: MultipleChoiceMapUpdateProof,
    signature: Signature,
    ownerPublicKey: PublicKey,
    storage: Storage
  ) {
    const owner = this.owner.getAndRequireEquals();
    Poseidon.hash(ownerPublicKey.toFields()).assertEquals(owner);
    signature
      .verify(ownerPublicKey, proof.publicInput.toFields())
      .assertEquals(true);
    proof.verify();
    proof.publicInput.oldRoot.assertEquals(this.root.getAndRequireEquals());
    proof.publicInput.hash.assertEquals(reducerState.hash);
    proof.publicInput.count.assertEquals(reducerState.count.toFields()[0]);

    const actionState = this.actionState.getAndRequireEquals();
    actionState.assertEquals(startActionState);
    const count = this.count.getAndRequireEquals();

    const pendingActions = this.reducer.getActions({
      fromActionState: actionState,
      endActionState,
    });

    let elementsState: ReducerState = new ReducerState({
      count: Field(0),
      hash: Field(0),
    });

    const { state: newReducerState, actionState: newActionState } =
      this.reducer.reduce(
        pendingActions,
        ReducerState,
        (state: ReducerState, action: Answer) => {
          return new ReducerState({
            count: state.count.add(Field(1)),
            hash: state.hash.add(action.hash),
          });
        },
        {
          state: elementsState,
          actionState: actionState,
        },
        {
          maxTransactionsWithActions: BATCH_SIZE,
          skipActionStatePrecondition: true,
        }
      );
    ReducerState.assertEquals(newReducerState, reducerState);
    const accountActionState = this.account.actionState.getAndRequireEquals();
    const isSynced = newActionState.equals(accountActionState);
    this.isSynced.set(isSynced);
    this.count.set(count.add(newReducerState.count));
    this.actionState.set(newActionState);
    this.root.set(proof.publicInput.newRoot);
    this.storage.set(storage);
    this.emitEvent("storage", storage);
    this.emitEvent("reduce", reducerState);
  }

  @method bulkUpdate(
    proof: MultipleChoiceMapUpdateProof,
    signature: Signature,
    ownerPublicKey: PublicKey,
    storage: Storage
  ) {
    const owner = this.owner.getAndRequireEquals();
    Poseidon.hash(ownerPublicKey.toFields()).assertEquals(owner);
    signature
      .verify(ownerPublicKey, proof.publicInput.toFields())
      .assertEquals(true);
    proof.verify();
    proof.publicInput.oldRoot.assertEquals(this.root.getAndRequireEquals());

    const count = this.count.getAndRequireEquals();
    this.count.set(count.add(proof.publicInput.count));
    this.root.set(proof.publicInput.newRoot);
    this.storage.set(storage);
    this.emitEvent("storage", storage);
    this.emitEvent("bulkUpdate", proof.publicInput.count);
  }

  @method setOwner(
    newOwner: PublicKey,
    signature: Signature,
    ownerPublicKey: PublicKey
  ) {
    const owner = this.owner.getAndRequireEquals();
    Poseidon.hash(ownerPublicKey.toFields()).assertEquals(owner);
    signature.verify(ownerPublicKey, newOwner.toFields()).assertEquals(true);
    this.owner.set(Poseidon.hash(newOwner.toFields()));
  }

  // TODO: remove after debugging
  @method setRoot(
    root: Field,
    count: Field,
    signature: Signature,
    ownerPublicKey: PublicKey
  ) {
    const owner = this.owner.getAndRequireEquals();
    Poseidon.hash(ownerPublicKey.toFields()).assertEquals(owner);
    signature.verify(ownerPublicKey, [root, count]).assertEquals(true);
    this.root.set(root);
    this.count.set(count);
  }
}
