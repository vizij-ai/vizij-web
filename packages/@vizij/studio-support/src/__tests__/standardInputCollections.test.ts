import { describe, expect, it } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import { buildStandardInputCollectionIndex } from "../index";

function input(
  id: string,
  path: string,
  group = "/standard",
): StandardRigInput {
  return {
    id,
    path,
    label: id,
    group,
    defaultValue: 0,
    range: { min: 0, max: 1 },
  };
}

describe("buildStandardInputCollectionIndex", () => {
  it("builds id/path/metadata indices from active managed inputs", () => {
    const jaw = input("jaw_open", "/standard/jaw/open", "/jaw");
    const brow = input("brow_up", "/rig/element/brow/up", "/brow");
    const disabled = input("disabled", "/standard/disabled");

    const index = buildStandardInputCollectionIndex({
      groupFallback: "/fallback",
      entries: [
        {
          input: jaw,
          source: "auto",
          metadata: {
            elementId: "jaw",
            elementType: "standard",
            root: "/face",
          },
        },
        {
          input: brow,
          source: "custom",
          metadata: {
            elementId: "brow",
            root: "/brow-root",
          },
        },
        {
          input: disabled,
          source: "auto",
          disabled: true,
        },
      ],
    });

    expect(index.standardInputs.map((entry) => entry.id)).toEqual([
      "jaw_open",
      "brow_up",
    ]);
    expect(index.standardInputsById.get("jaw_open")).toBe(jaw);
    expect(index.standardInputsByPath.get("/standard/jaw/open")).toBe(jaw);
    expect(index.standardInputsByPath.get("/rig/element/brow/up")).toBe(brow);
    expect(index.standardInputMetadataById.get("jaw_open")).toEqual({
      source: "preset",
      root: "/face",
    });
    expect(index.standardInputMetadataById.get("brow_up")).toEqual({
      source: "custom",
      root: "/brow-root",
    });
    expect(index.elementRootLookup.get("jaw")).toEqual(["/face"]);
    expect(index.allStandardInputSubgroups.has("open")).toBe(true);
    expect(index.standardInputsById.has("disabled")).toBe(false);
  });
});
