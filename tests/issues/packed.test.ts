/*
See
https://github.com/o1-labs/o1js/issues/1463
https://github.com/o1-labs/o1js/blob/main/src/lib/provable-types/packed.ts#L33
*/

import { describe, expect, it } from "@jest/globals";
import { Bool, Packed } from "o1js";

describe("Packed", () => {
  it("should pack the array of Bool", async () => {
    const unpacked: Bool[] = [Bool(true), Bool(false), Bool(true), Bool(false)];
    let PackedType = Packed.create(Bool);
    let packed = PackedType.pack(unpacked);
  });
});
