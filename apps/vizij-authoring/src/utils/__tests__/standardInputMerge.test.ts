import { createStandardRigInput, type StandardRigInput } from "@vizij/utils";
import { describe, expect, it } from "vitest";
import {
  buildNormalizedPathSet,
  buildStandardInputMapByNormalizedPath,
  mergeReferenceAndMainStandardInputs,
} from "../standardInputMerge";

function makeInput(id: string, path: string): StandardRigInput {
  return createStandardRigInput({
    id,
    path,
    label: id,
    group: "face",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  });
}

describe("buildStandardInputMapByNormalizedPath", () => {
  it("deduplicates by normalized path and ignores non-standard inputs", () => {
    const inputs = [
      makeInput("ref-eye", "/standard/face/left_eye/pos/x"),
      makeInput("duplicate-eye", "/standard/face/left_eye/pos//x"),
      makeInput("custom", "/custom/left_eye/pos/x"),
    ];

    const byPath = buildStandardInputMapByNormalizedPath(inputs);

    expect(byPath.size).toBe(1);
    expect(byPath.get("/standard/face/left_eye/pos/x")?.id).toBe("ref-eye");
  });
});

describe("mergeReferenceAndMainStandardInputs", () => {
  it("merges both faces and keeps first-seen entry on normalized collisions", () => {
    const reference = [
      makeInput("ref-eye", "/standard/face/left_eye/pos/x"),
      makeInput("ref-jaw", "/standard/face/jaw/open/value"),
    ];
    const main = [
      makeInput("main-eye", "/standard/face/left_eye/pos/x"),
      makeInput("main-brow", "/standard/face/brow/up/value"),
    ];

    const merged = mergeReferenceAndMainStandardInputs(reference, main);
    const ordered = Array.from(merged.values()).map((input) => input.id);

    expect(merged.size).toBe(3);
    expect(ordered).toEqual(["ref-eye", "ref-jaw", "main-brow"]);
  });
});

describe("buildNormalizedPathSet", () => {
  it("returns unique normalized paths", () => {
    const set = buildNormalizedPathSet([
      makeInput("one", "/standard/face/left_eye/pos/x"),
      makeInput("two", "/standard/face/left_eye/pos//x"),
      makeInput("three", "/standard/face/right_eye/pos/x"),
    ]);

    expect(set.size).toBe(2);
    expect(set.has("/standard/face/left_eye/pos/x")).toBe(true);
    expect(set.has("/standard/face/right_eye/pos/x")).toBe(true);
  });
});
