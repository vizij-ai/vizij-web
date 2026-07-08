import type { StandardRigInput } from "@vizij/utils";
import { describe, expect, it } from "vitest";
import type { VariableSelection } from "./VariableSelector";
import { resolvePosePropertySelectionInputIds } from "./poseTargetSelection";

function createInput(id: string, path: string): StandardRigInput {
  return {
    id,
    path,
    label: id,
    group: "propsrig",
    defaultValue: 0,
    range: {
      min: -1,
      max: 1,
    },
  };
}

describe("resolvePosePropertySelectionInputIds", () => {
  const canonicalInput = createInput(
    "propsrig_head_jaw_x",
    "/propsrig/head/jaw/x",
  );
  const standardInputsById = new Map<string, StandardRigInput>([
    [canonicalInput.id, canonicalInput],
  ]);

  it("resolves alias property input ids to existing canonical input ids", () => {
    const selection: Extract<VariableSelection, { type: "property" }> = {
      type: "property",
      objectId: "head",
      featureId: "jaw",
      label: "Head Jaw X",
      inputId: "/rig/element/head/jaw/x",
      inputIds: [canonicalInput.id],
    };

    const resolved = resolvePosePropertySelectionInputIds({
      selection,
      standardInputsById,
      fallbackTargetIds: [],
      propsrigInputIdByComponentId: new Map(),
    });

    expect(resolved).toEqual([canonicalInput.id]);
  });

  it("falls back to propsrig target mapping when selection carries no input ids", () => {
    const selection: Extract<VariableSelection, { type: "property" }> = {
      type: "property",
      objectId: "head",
      featureId: "jaw",
      label: "Head Jaw X",
      targetId: "component.head.jaw.x",
    };

    const resolved = resolvePosePropertySelectionInputIds({
      selection,
      standardInputsById,
      fallbackTargetIds: ["component.head.jaw.x"],
      propsrigInputIdByComponentId: new Map([
        ["component.head.jaw.x", "/rig/element/head/jaw/x"],
      ]),
    });

    expect(resolved).toEqual([canonicalInput.id]);
  });

  it("returns no ids when no canonical input mapping exists", () => {
    const selection: Extract<VariableSelection, { type: "property" }> = {
      type: "property",
      objectId: "head",
      featureId: "jaw",
      label: "Unknown",
      inputId: "/rig/element/unknown/path",
      inputIds: ["/propsrig/unknown/path"],
    };

    const resolved = resolvePosePropertySelectionInputIds({
      selection,
      standardInputsById,
      fallbackTargetIds: ["component.missing"],
      propsrigInputIdByComponentId: new Map([
        ["component.missing", "/propsrig/unknown/path"],
      ]),
    });

    expect(resolved).toEqual([]);
  });
});
