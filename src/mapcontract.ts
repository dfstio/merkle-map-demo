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
  UInt64,
  UInt32,
  Poseidon,
  Signature,
} from "o1js";

import { Storage } from "./storage";
import { MapUpdateProof } from "./update";

export const BATCH_SIZE = 256;

export class MapElement extends Struct({
  name: Field,
  address: PublicKey,
  addressHash: Field, // Poseidon hash of address.toFields()
  hash: Field, // Poseidon hash of [name, ...address.toFields()]
  storage: Storage,
}) {
  toFields(): Field[] {
    return [
      this.name,
      ...this.address.toFields(),
      this.addressHash,
      this.hash,
      ...this.storage.toFields(),
    ];
  }

  static fromFields(fields: Field[]): MapElement {
    return new MapElement({
      name: fields[0],
      address: PublicKey.fromFields(fields.slice(1, 3)),
      addressHash: fields[3],
      hash: fields[4],
      storage: new Storage({ hashString: [fields[5], fields[6]] }),
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

export class MapContract extends SmartContract {
  @state(Field) domain = State<Field>();
  @state(Field) root = State<Field>();
  @state(Field) count = State<Field>();
  @state(Field) actionState = State<Field>();
  @state(PublicKey) owner = State<PublicKey>();

  deploy(args: DeployArgs) {
    super.deploy(args);
    this.account.permissions.set({
      ...Permissions.default(),
      editState: Permissions.proof(),
    });
  }

  reducer = Reducer({
    actionType: MapElement,
  });

  events = {
    add: MapElement,
    update: MapElement,
    reduce: ReducerState,
    bulkUpdate: Field,
  };

  @method add(
    name: Field,
    address: PublicKey,
    storage: Storage,
    signature: Signature
  ) {
    const addressHash = Poseidon.hash(address.toFields());
    const hash = Poseidon.hash([name, ...address.toFields()]);
    const element = new MapElement({
      name,
      address,
      addressHash,
      hash,
      storage,
    });
    signature.verify(address, element.toFields()).assertEquals(true);
    this.reducer.dispatch(element);
    this.emitEvent("add", element);
  }

  @method update(
    name: Field,
    address: PublicKey,
    storage: Storage,
    signature: Signature
  ) {
    const addressHash = Poseidon.hash(address.toFields());
    const hash = Poseidon.hash([name, ...address.toFields()]);
    const element = new MapElement({
      name,
      address,
      addressHash,
      hash,
      storage,
    });
    signature.verify(address, element.toFields()).assertEquals(true);
    this.emitEvent("update", element);
  }

  @method reduce(
    startActionState: Field,
    endActionState: Field,
    reducerState: ReducerState,
    proof: MapUpdateProof,
    signature: Signature
  ) {
    const owner = this.owner.getAndRequireEquals();
    signature.verify(owner, proof.publicInput.toFields()).assertEquals(true);
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
        (state: ReducerState, action: MapElement) => {
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
    this.count.set(count.add(newReducerState.count));
    this.actionState.set(newActionState);
    this.root.set(proof.publicInput.newRoot);
    this.emitEvent("reduce", reducerState);
  }

  @method bulkUpdate(proof: MapUpdateProof, signature: Signature) {
    const owner = this.owner.getAndRequireEquals();
    signature.verify(owner, proof.publicInput.toFields()).assertEquals(true);
    proof.verify();
    proof.publicInput.oldRoot.assertEquals(this.root.getAndRequireEquals());

    const count = this.count.getAndRequireEquals();
    this.count.set(count.add(proof.publicInput.count));
    this.root.set(proof.publicInput.newRoot);
    this.emitEvent("bulkUpdate", proof.publicInput.count);
  }

  @method setOwner(newOwner: PublicKey, signature: Signature) {
    const owner = this.owner.getAndRequireEquals();
    signature.verify(owner, newOwner.toFields()).assertEquals(true);
    this.owner.set(newOwner);
  }

  // TODO: remove after debugging
  @method setRoot(root: Field, count: Field, signature: Signature) {
    const owner = this.owner.getAndRequireEquals();
    signature.verify(owner, [root, count]).assertEquals(true);
    this.root.set(root);
    this.count.set(count);
  }
}
