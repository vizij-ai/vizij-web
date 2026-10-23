import { describe, expect, it } from "vitest";
import { heldOutputChanges } from "./runtimeOutputLocks";

describe("heldOutputChanges", () => {
  it("holds newly locked targets and releases unlocked ones, as named", () => {
    const changes = heldOutputChanges(
      new Set(["eye", "mouth:x"]),
      new Set(["mouth:x", "brow:r", "jaw"]),
    );
    expect(changes.hold.sort()).toEqual(["brow:r", "jaw"]);
    expect(changes.release).toEqual(["eye"]);
  });

  it("changes nothing when the locked set is the held set", () => {
    expect(heldOutputChanges(new Set(["eye"]), new Set(["eye"]))).toEqual({
      hold: [],
      release: [],
    });
  });

  it("ignores an empty target", () => {
    expect(heldOutputChanges(new Set(), new Set([" "]))).toEqual({
      hold: [],
      release: [],
    });
  });
});
