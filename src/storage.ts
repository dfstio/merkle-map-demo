export { Storage };
import { Struct, Field } from "o1js";

/**
 * Storage is the hash of the IPFS or Arweave storage where the metadata is written
 * format of the IPFS hash string: i:...
 * format of the Arweave hash string: a:...
 * @property hashString The hash string of the storage
 */
class Storage extends Struct({
  hashString: [Field, Field],
}) {
  constructor(value: { hashString: [Field, Field] }) {
    super(value);
  }
  toFields(): Field[] {
    return this.hashString;
  }
}
