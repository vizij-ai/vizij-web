import { describe, expect, it } from "vitest";
import type { BindingMap } from "@vizij/node-graph-authoring";
import { createStandardRigInputFromPath } from "@vizij/utils";
import type { GraphDiffResult } from "../../types/discrepancy";
import {
  canonicalizeImportedPipelineMetadataV1,
  deriveLockedInspectorTargetsFromPipeline,
  filterBenignGeneratedNodeIdDiffs,
  isBenignGeneratedNodeIdDiff,
} from "../useRigGraphImport";

describe("deriveLockedInspectorTargetsFromPipeline", () => {
  it("locks targets whose preferred propsrig direct input is disabled", () => {
    const jawOpen = createStandardRigInputFromPath("/propsrig/jaw_open");
    const browRaise = createStandardRigInputFromPath("/propsrig/brow_raise");

    const bindings = {
      target_jaw: {
        inputId: jawOpen.id,
        slots: [{ id: "s1", inputId: jawOpen.id }],
      },
      target_brow: {
        inputId: browRaise.id,
        slots: [{ id: "s1", inputId: browRaise.id }],
      },
    } as unknown as BindingMap;

    const lockedTargets = deriveLockedInspectorTargetsFromPipeline({
      bindings,
      standardInputs: [jawOpen, browRaise],
      pipelineConfigByInputId: {
        [jawOpen.id]: { directInput: { enabled: false } },
        [browRaise.id]: { directInput: { enabled: true } },
      },
    });

    expect(Array.from(lockedTargets).sort()).toEqual(["target_jaw"]);
  });

  it("prefers canonical propsrig input ids when target bindings include multiple sources", () => {
    const legacyInput = createStandardRigInputFromPath(
      "/standard/semio/jaw/open",
    );
    const propsRigInput = createStandardRigInputFromPath("/propsrig/jaw_open");

    const bindings = {
      target_jaw: {
        inputId: legacyInput.id,
        slots: [
          { id: "s1", inputId: legacyInput.id },
          { id: "s2", inputId: propsRigInput.id },
        ],
      },
    } as unknown as BindingMap;

    const lockedTargets = deriveLockedInspectorTargetsFromPipeline({
      bindings,
      standardInputs: [legacyInput, propsRigInput],
      pipelineConfigByInputId: {
        [propsRigInput.id]: { directInput: { enabled: false } },
      },
    });

    expect(Array.from(lockedTargets).sort()).toEqual(["target_jaw"]);
  });

  it("returns no locked targets when pipeline has no disabled direct input entries", () => {
    const jawOpen = createStandardRigInputFromPath("/propsrig/jaw_open");
    const bindings = {
      target_jaw: {
        inputId: jawOpen.id,
        slots: [{ id: "s1", inputId: jawOpen.id }],
      },
    } as unknown as BindingMap;

    const lockedTargets = deriveLockedInspectorTargetsFromPipeline({
      bindings,
      standardInputs: [jawOpen],
      pipelineConfigByInputId: {
        [jawOpen.id]: { directInput: { enabled: true } },
      },
    });

    expect(lockedTargets.size).toBe(0);
  });
});

describe("generated node-id diff filtering", () => {
  it("treats generated edge node_id mismatches as benign", () => {
    expect(
      isBenignGeneratedNodeIdDiff({
        id: "mismatch:1:spec.edges[0].to.node_id",
        kind: "mismatch",
        path: "spec.edges[0].to.node_id",
        category: "structure",
        importedValue: "join_04d3d1cf_246e_4081_a342_057feefce38d",
        rebuiltValue: "join_dea0d202_dd6f_4554_8992_2196ad0aec91",
      }),
    ).toBe(true);
  });

  it("does not ignore mismatches where one side is not generated", () => {
    expect(
      isBenignGeneratedNodeIdDiff({
        id: "mismatch:1:spec.edges[0].to.node_id",
        kind: "mismatch",
        path: "spec.edges[0].to.node_id",
        category: "structure",
        importedValue: "join_04d3d1cf_246e_4081_a342_057feefce38d",
        rebuiltValue: "custom_manual_node",
      }),
    ).toBe(false);
  });

  it("removes only benign generated node-id mismatches", () => {
    const diff: GraphDiffResult = {
      entries: [
        {
          id: "mismatch:1:spec.edges[0].to.node_id",
          kind: "mismatch",
          path: "spec.edges[0].to.node_id",
          category: "structure",
          importedValue: "join_04d3d1cf_246e_4081_a342_057feefce38d",
          rebuiltValue: "join_dea0d202_dd6f_4554_8992_2196ad0aec91",
        },
        {
          id: "mismatch:2:spec.nodes[n1].params.path",
          kind: "mismatch",
          path: "spec.nodes[n1].params.path",
          category: "structure",
          importedValue: "/propsrig/jaw_open",
          rebuiltValue: "/propsrig/jaw_close",
        },
      ],
      limitReached: false,
    };

    const { filteredDiff, ignoredCount } =
      filterBenignGeneratedNodeIdDiffs(diff);
    expect(ignoredCount).toBe(1);
    expect(filteredDiff.entries).toHaveLength(1);
    expect(filteredDiff.entries[0]?.id).toBe(
      "mismatch:2:spec.nodes[n1].params.path",
    );
  });
});

describe("canonicalizeImportedPipelineMetadataV1", () => {
  it("normalizes legacy slot aliases to resolved parent variables", () => {
    const childInput = createStandardRigInputFromPath("/propsrig/jaw_open");
    const chinInput = createStandardRigInputFromPath("/custom/chin");
    const jawUdInput = createStandardRigInputFromPath("/custom/jaw_ud");

    const canonical = canonicalizeImportedPipelineMetadataV1({
      faceId: "robot",
      standardInputs: [childInput, chinInput, jawUdInput],
      pipelineMetadataV1: {
        links: {
          [`link/${chinInput.id}->${childInput.id}`]: {
            linkId: `link/${chinInput.id}->${childInput.id}`,
            parentInputId: chinInput.id,
            childInputId: childInput.id,
            scale: 1,
            offset: 0,
            enabled: true,
            expression: "value = parent * scale + offset",
          },
          [`link/${jawUdInput.id}->${childInput.id}`]: {
            linkId: `link/${jawUdInput.id}->${childInput.id}`,
            parentInputId: jawUdInput.id,
            childInputId: childInput.id,
            scale: 1,
            offset: 0,
            enabled: true,
          },
        },
        byInputId: {
          [childInput.id]: {
            inputId: childInput.id,
            parentBlend: {
              expression:
                "parentContribution = normalizedAdditive([s1, s2], baseline=default)",
            },
          },
        },
      },
    });

    const childConfig = canonical?.byInputId?.[childInput.id] as
      | {
          parents?: Array<{ alias?: string }>;
          parentBlend?: { expression?: string };
        }
      | undefined;
    expect(childConfig?.parents?.map((parent) => parent.alias)).toEqual([
      "value",
      "P2",
    ]);
    expect(childConfig?.parentBlend?.expression).toBe(
      "parentContribution = normalizedAdditive([value, P2], baseline=default)",
    );
  });
});
