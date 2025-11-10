import { describe, expect, it } from "vitest";
import { buildRigInputPath } from "./utils";

describe("buildRigInputPath", () => {
  it("does not double-prefix already qualified paths", () => {
    expect(buildRigInputPath("robot", "rig/robot/brow/pos")).toBe(
      "rig/robot/brow/pos",
    );
  });

  it("re-homes mismatched or repeated prefixes to the active face id", () => {
    expect(buildRigInputPath("robot", "rig/alien/rig/alien/mouth/pos")).toBe(
      "rig/robot/mouth/pos",
    );
  });
});
