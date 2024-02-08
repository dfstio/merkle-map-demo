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
  Poseidon,
} from "o1js";

import { Storage } from "minanft";

export const BATCH_SIZE = 3;

export class MapElement extends Struct({
  name: Field,
  address: PublicKey,
  addressHash: Field, // Poseidon hash of address.toFields()
  hash: Field, // Poseidon hash of [name, ...address.toFields()]
  storage: Storage,
}) {
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
  count: UInt64,
  hash: Field,
}) {
  static assertEquals(a: ReducerState, b: ReducerState) {
    a.count.assertEquals(b.count);
    a.hash.assertEquals(b.hash);
  }
}

export class MapContract extends SmartContract {
  @state(Field) root = State<Field>();
  @state(UInt64) count = State<UInt64>();
  @state(Field) actionState = State<Field>();

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
  };

  @method add(name: Field, address: PublicKey, storage: Storage) {
    const addressHash = Poseidon.hash(address.toFields());
    const hash = Poseidon.hash([name, ...address.toFields()]);
    const element = new MapElement({
      name,
      address,
      addressHash,
      hash,
      storage,
    });
    this.reducer.dispatch(element);
    this.emitEvent("add", element);
  }

  @method update(name: Field, address: PublicKey, storage: Storage) {
    const addressHash = Poseidon.hash(address.toFields());
    const hash = Poseidon.hash([name, ...address.toFields()]);
    const element = new MapElement({
      name,
      address,
      addressHash,
      hash,
      storage,
    });
    this.emitEvent("update", element);
  }

  @method reduce(
    startActionState: Field,
    endActionState: Field,
    reducerState: ReducerState
  ) {
    const actionState = this.actionState.getAndRequireEquals();
    actionState.assertEquals(startActionState);
    const count = this.count.getAndRequireEquals();

    const pendingActions = this.reducer.getActions({
      fromActionState: actionState,
      endActionState,
    });

    let elementsState: ReducerState = new ReducerState({
      count: UInt64.from(0),
      hash: Field(0),
    });

    const { state: newReducerState, actionState: newActionState } =
      this.reducer.reduce(
        pendingActions,
        ReducerState,
        (state: ReducerState, action: MapElement) => {
          return new ReducerState({
            count: state.count.add(UInt64.from(1)),
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
    this.emitEvent("reduce", reducerState);
  }
}
