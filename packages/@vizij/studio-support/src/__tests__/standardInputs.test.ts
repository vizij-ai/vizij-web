import { describe, expect, it } from "vitest";
import { extractStandardInputSubgroups } from "../utils/standardInputs";

describe("extractStandardInputSubgroups", () => {
  it("returns nested subgroup segments under the requested root", () => {
    expect(
      extractStandardInputSubgroups("/standard/face/eyes/blink/left", "face"),
    ).toEqual(["eyes", "blink"]);
  });

  it("drops the leaf segment when no explicit root matches", () => {
    expect(
      extractStandardInputSubgroups("/standard/eyes/blink/left", "face"),
    ).toEqual(["blink"]);
  });

  it("returns no subgroups for empty or root-only paths", () => {
    expect(extractStandardInputSubgroups("", "face")).toEqual([]);
    expect(extractStandardInputSubgroups("/standard/face", "face")).toEqual([]);
  });
});
