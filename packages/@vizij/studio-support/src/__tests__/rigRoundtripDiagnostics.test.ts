import { describe, expect, it } from "vitest";
import type { BindingMap, InputBindingMap } from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";
import {
  applyRuntimeOverridesToAnimatables,
  buildAuthoringRigGraphArtifacts,
  compareImportedRigGraph,
  countGraphDiffsByCategory,
  normalizeRehydratedInputMetadata,
  runRigRoundtripAudit,
  summarizeGraphEdgeDiffRisk,
  type GraphDiffEntry,
} from "../index";

describe("rig roundtrip diagnostics", () => {
  const standardInput: StandardRigInput = {
    id: "jaw_open",
    path: "/controls/jaw/open",
    label: "Jaw Open",
    group: "controls",
    defaultValue: 0,
    range: { min: 0, max: 1 },
  };

  it("applies runtime value overrides to export animatable defaults", () => {
    const sourceDefault = { float: 0.1 };
    const result = applyRuntimeOverridesToAnimatables({
      faceId: "face",
      animatables: {
        smile: {
          type: "number",
          default: sourceDefault,
        } as any,
        blink: {
          type: "number",
          default: { float: 0 },
        } as any,
      },
      values: new Map([["face.smile", 0.75]]),
    });

    expect(result.smile?.default).toBe(0.75);
    expect(result.smile?.default).not.toBe(sourceDefault);
    expect(result.blink?.default).toEqual({ float: 0 });
  });

  it("normalizes rehydrated input metadata source values", () => {
    const normalized = normalizeRehydratedInputMetadata(
      new Map([
        ["auto_input", { source: "auto", root: "/auto" }],
        ["bad_input", { source: "legacy", root: "/legacy" }],
      ]),
    );

    expect(normalized.get("auto_input")).toEqual({
      source: "auto",
      root: "/auto",
    });
    expect(normalized.get("bad_input")).toEqual({
      source: undefined,
      root: "/legacy",
    });
  });

  it("counts graph diff categories and summarizes edge risk", () => {
    const entries: GraphDiffEntry[] = [
      {
        id: "inputs",
        kind: "mismatch",
        path: "spec.nodes[0].params.path",
        category: "inputs",
        importedValue: "a",
        rebuiltValue: "b",
      },
      {
        id: "edge-risk",
        kind: "mismatch",
        path: "spec.edges[0].to.input",
        category: "structure",
        importedValue: "a",
        rebuiltValue: "b",
        context: {
          entityType: "edge",
          scopePath: "spec.edges",
          fieldPath: "to.input",
          fieldName: "input",
          importedType: "string",
          rebuiltType: "string",
          connection: {
            imported: { fromNodeId: "a", toNodeId: "b" },
            rebuilt: { fromNodeId: "a", toNodeId: "c" },
            sameNodePair: false,
            slotOnlyChange: false,
            commutativeTarget: false,
            likelyNormalizationOnly: false,
            likelySemanticRisk: true,
            guidance: "edge endpoint changed",
          },
        },
      },
    ];

    expect(countGraphDiffsByCategory(entries)).toMatchObject({
      inputs: 1,
      structure: 1,
    });
    expect(summarizeGraphEdgeDiffRisk(entries)).toEqual({
      total: 1,
      likelyNormalization: 0,
      likelySemanticRisk: 1,
    });
  });

  it("compares an imported rig graph against the support-owned rebuild path", async () => {
    const artifacts = buildAuthoringRigGraphArtifacts({
      faceId: "face",
      animatablesForExport: {},
      animatableComponents: [],
      bindings: {} as BindingMap,
      inputBindings: {} as InputBindingMap,
      standardInputsById: new Map([[standardInput.id, standardInput]]),
      inputMetadata: new Map([[standardInput.id, { source: "custom" }]]),
      pipelineMetadataV1: null,
      pipelineConfigByInputId: {},
      poseConfigForCompose: null,
    });

    const comparison = await compareImportedRigGraph({
      importedSpec: artifacts.graphResult.spec,
      faceId: "face",
      animatables: {},
      animatableComponents: [],
      bindings: {} as BindingMap,
      inputBindings: {} as InputBindingMap,
      standardInputs: [standardInput],
      inputMetadata: new Map([[standardInput.id, { source: "custom" }]]),
      pipelineMetadataV1: null,
      pipelineConfigByInputId: {},
      poseConfig: null,
    });

    expect(comparison.importedSignature).toBe(comparison.rebuiltSignature);
    expect(comparison.diff.entries).toEqual([]);
    expect(comparison.issueCount).toBe(0);
  });

  it("runs the support-owned round-trip audit transaction", async () => {
    const result = await runRigRoundtripAudit({
      faceId: "face",
      world: {} as any,
      animatables: {},
      values: new Map(),
      animatableComponents: [],
      managedStandardInputs: [
        {
          input: standardInput,
          source: "custom",
          metadata: { root: "controls" },
        },
      ],
      bindings: {} as BindingMap,
      inputBindings: {} as InputBindingMap,
      pipelineMetadataV1: null,
      pipelineConfigByInputId: {},
      featureLabelOverrides: {},
      poseConfig: null,
    });

    expect(result.status).toBe("match");
    expect(result.exportedSpec).toBeTruthy();
    expect(result.importPreparedSpec).toBeTruthy();
    expect(result.rebuiltSpec).toBeTruthy();
    expect(result.diff.entries).toEqual([]);
    expect(result.exportImportDiff.entries).toEqual([]);
  });
});
