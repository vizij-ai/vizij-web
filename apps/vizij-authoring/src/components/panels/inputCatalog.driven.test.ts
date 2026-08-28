import { describe, expect, it } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import type { ManagedStandardInput } from "../../types/standardInputs";
import { buildVisibleInputCatalog } from "./inputCatalog";

function managed(
  path: string,
  derivedChildren: string[] | undefined,
): ManagedStandardInput {
  return {
    input: {
      id: path,
      path,
      label: path.split("/").pop() ?? path,
      group: "custom",
      defaultValue: 0,
      range: { min: 0, max: 1 },
      derivedChildren,
    } as StandardRigInput,
    source: "custom",
    disabled: false,
  };
}

function catalog(inputs: ManagedStandardInput[]) {
  return buildVisibleInputCatalog({
    managedStandardInputs: inputs,
    fullyLockedFaceElementIds: new Set(),
    lockedPropsRigComponentIds: new Set(),
    inputValues: {},
    poseNameById: new Map(),
    resolveManagedSource: () => "custom",
    poseGroups: [],
    blendStages: [],
    poseGroupBlendModeFallback: "add",
    poseCountByGroupId: new Map(),
    poseGroupLabelById: new Map(),
  } as Parameters<typeof buildVisibleInputCatalog>[0]);
}

describe("input catalog: driven", () => {
  // A profile's controls arrive with nothing reading them; that is what the
  // disconnect marker in the panel is keyed off.
  it("marks an input nothing derives from as not driven", () => {
    const rows = catalog([
      managed("/standard/vizij/expression/happy", []),
      managed("/standard/vizij/viseme/aa", undefined),
    ]);
    expect(rows.map((r) => r.driven)).toStrictEqual([false, false]);
  });

  it("marks an input with a child as driven", () => {
    const rows = catalog([
      managed("/standard/vizij/expression/happy", ["pose_happy"]),
    ]);
    expect(rows[0]!.driven).toBe(true);
  });

  it("distinguishes the two in one catalog", () => {
    const rows = catalog([
      managed("/standard/vizij/expression/happy", ["pose_happy"]),
      managed("/standard/vizij/expression/sad", []),
    ]);
    const byLabel = new Map(rows.map((r) => [r.label, r.driven]));
    expect(byLabel.get("happy")).toBe(true);
    expect(byLabel.get("sad")).toBe(false);
  });
});
