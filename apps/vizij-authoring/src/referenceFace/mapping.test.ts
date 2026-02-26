import { describe, expect, it } from "vitest";
import type { VizijBundleExtension } from "@vizij/render";
import type { RigPipelineV1Metadata } from "@vizij/utils";
import { extractReferenceCatalog } from "./referenceCatalog";
import {
  buildPoseCopyProposal,
  buildVariableCopyProposal,
  validatePoseCopyProposalPreflight,
  validateVariableCopyProposalPreflight,
} from "./mapping";

interface BundleInputFixture {
  id: string;
  path: string;
  label: string;
  defaultValue?: number;
  range?: {
    min: number;
    max: number;
  };
}

interface BundlePoseFixture {
  id: string;
  name: string;
  values: Record<string, number>;
}

interface BundleBindingFixture {
  targetId: string;
  animatableId?: string;
  slotId?: string;
  slotAlias?: string;
  inputId: string | null;
  expression?: string;
  valueType?: "scalar" | "vector";
  nodeId?: string;
  expressionNodeId?: string;
}

function makeBundle(params: {
  inputs: BundleInputFixture[];
  pipelineV1?: RigPipelineV1Metadata;
  bindings?: BundleBindingFixture[];
  poses?: BundlePoseFixture[];
}): VizijBundleExtension {
  return {
    version: 1,
    graphs: [
      {
        id: "rig_graph",
        kind: "rig",
        spec: {
          metadata: {
            vizij: {
              faceId: "face",
              inputs: params.inputs.map((input) => ({
                id: input.id,
                path: input.path,
                label: input.label,
                defaultValue: input.defaultValue ?? 0,
                range: input.range ?? { min: -1, max: 1 },
              })),
              ...(params.bindings
                ? {
                    bindings: params.bindings.map((binding, index) => ({
                      targetId: binding.targetId,
                      animatableId: binding.animatableId ?? binding.targetId,
                      slotId: binding.slotId ?? `slot_${index + 1}`,
                      slotAlias: binding.slotAlias ?? "slot",
                      inputId: binding.inputId,
                      expression: binding.expression ?? "slot",
                      valueType: binding.valueType ?? "scalar",
                      nodeId: binding.nodeId ?? `node_${index + 1}`,
                      expressionNodeId:
                        binding.expressionNodeId ?? `expr_${index + 1}`,
                    })),
                  }
                : {}),
              ...(params.pipelineV1 ? { pipelineV1: params.pipelineV1 } : {}),
            },
          },
        },
      },
    ],
    poses: params.poses
      ? {
          config: {
            version: 1,
            neutralInputs: {},
            poses: params.poses,
          },
        }
      : null,
  };
}

describe("referenceFace catalog + mapping", () => {
  it("extracts inputs, merged parent links, derived children, and pose targets", () => {
    const bundle = makeBundle({
      inputs: [
        { id: "src_mouth", path: "/controls/mouth/open", label: "Mouth Open" },
        { id: "src_jaw", path: "/controls/jaw/open", label: "Jaw Open" },
        {
          id: "src_cheek",
          path: "/controls/cheek/raise",
          label: "Cheek Raise",
        },
      ],
      pipelineV1: {
        links: {
          link_jaw_mouth: {
            linkId: "link_jaw_mouth",
            parentInputId: "src_jaw",
            childInputId: "src_mouth",
            scale: 0.8,
            offset: 0.1,
          },
        },
        byInputId: {
          src_mouth: {
            inputId: "src_mouth",
            parents: [
              {
                linkId: "link_jaw_mouth",
                inputId: "src_jaw",
                scale: 0.9,
              },
            ],
          },
          src_jaw: {
            inputId: "src_jaw",
            parents: [
              {
                inputId: "src_cheek",
                scale: 0.5,
                offset: 0.2,
              },
            ],
          },
        },
      },
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          values: {
            src_mouth: 1,
            src_jaw: 0.4,
          },
        },
      ],
    });

    const catalog = extractReferenceCatalog(bundle);
    const mouth = catalog.inputsById.get("src_mouth");
    const jaw = catalog.inputsById.get("src_jaw");
    const cheek = catalog.inputsById.get("src_cheek");

    expect(mouth?.parents).toEqual([
      {
        linkId: "link_jaw_mouth",
        parentInputId: "src_jaw",
        scale: 0.9,
        offset: 0.1,
        enabled: true,
      },
    ]);
    expect(jaw?.children).toContainEqual({
      linkId: "link_jaw_mouth",
      childInputId: "src_mouth",
      scale: 0.9,
      offset: 0.1,
      enabled: true,
    });
    expect(cheek?.children).toContainEqual(
      expect.objectContaining({
        childInputId: "src_jaw",
        scale: 0.5,
        offset: 0.2,
      }),
    );

    expect(catalog.posesById.get("pose_smile")).toEqual({
      id: "pose_smile",
      name: "Smile",
      targets: [
        { inputId: "src_jaw", value: 0.4 },
        { inputId: "src_mouth", value: 1 },
      ],
    });
  });

  it("derives parent-child links from binding summaries when pipeline metadata is missing", () => {
    const bundle = makeBundle({
      inputs: [
        { id: "src_blink", path: "/controls/eyes/blink", label: "Blink" },
        {
          id: "src_lid_squint",
          path: "/controls/eyes/lid_squint",
          label: "Lid Squint",
        },
      ],
      bindings: [
        {
          targetId: "src_blink",
          inputId: "src_lid_squint",
        },
        {
          targetId: "src_blink",
          inputId: "__self__",
        },
      ],
    });

    const catalog = extractReferenceCatalog(bundle);
    const blink = catalog.inputsById.get("src_blink");
    const squint = catalog.inputsById.get("src_lid_squint");

    expect(blink?.parents).toEqual([
      {
        linkId: "link/src_lid_squint->src_blink",
        parentInputId: "src_lid_squint",
        scale: 1,
        offset: 0,
        enabled: true,
      },
    ]);
    expect(squint?.children).toEqual([
      {
        linkId: "link/src_lid_squint->src_blink",
        childInputId: "src_blink",
        scale: 1,
        offset: 0,
        enabled: true,
      },
    ]);
    expect(catalog.pipelineLinks).toHaveLength(1);
    expect(catalog.pipelineLinks[0]?.source).toBe("by-input-parent");
  });

  it("maps variable destination by path before label fallback", () => {
    const sourceCatalog = extractReferenceCatalog(
      makeBundle({
        inputs: [
          {
            id: "src_mouth",
            path: "/controls/mouth/open",
            label: "Mouth Open",
          },
        ],
      }),
    );
    const destinationCatalog = extractReferenceCatalog(
      makeBundle({
        inputs: [
          {
            id: "main_open_path_match",
            path: "/controls/mouth/open",
            label: "Not The Same Label",
          },
          {
            id: "main_open_label_match",
            path: "/controls/other/path",
            label: "Mouth Open",
          },
        ],
      }),
    );

    const proposal = buildVariableCopyProposal({
      sourceCatalog,
      destinationCatalog,
      sourceInputId: "src_mouth",
    });

    expect(proposal.destinationRow.status).toBe("resolved");
    expect(proposal.destinationRow.confidence).toBe("high");
    expect(proposal.destinationRow.destinationInputId).toBe(
      "main_open_path_match",
    );
    expect(proposal.destinationRow.rationale).toEqual([
      "Resolved by exact normalized path match",
    ]);
    expect(validateVariableCopyProposalPreflight(proposal).ok).toBe(true);
  });

  it("emits explicit unresolved rows and blocks unresolved critical variable mappings", () => {
    const sourceCatalog = extractReferenceCatalog(
      makeBundle({
        inputs: [
          { id: "src_brow", path: "/controls/brow/raise", label: "Brow Raise" },
        ],
        pipelineV1: {
          byInputId: {
            src_brow: {
              inputId: "src_brow",
              parents: [
                {
                  inputId: "missing_parent",
                },
              ],
            },
          },
        },
      }),
    );
    const destinationCatalog = extractReferenceCatalog(
      makeBundle({
        inputs: [
          {
            id: "main_brow_inner",
            path: "/controls/brow/inner",
            label: "Brow Raise",
          },
          {
            id: "main_brow_outer",
            path: "/controls/brow/outer",
            label: "Brow Raise",
          },
        ],
      }),
    );

    const proposal = buildVariableCopyProposal({
      sourceCatalog,
      destinationCatalog,
      sourceInputId: "src_brow",
    });

    expect(proposal.destinationRow.status).toBe("ambiguous");
    expect(proposal.destinationRow.candidateDestinationInputIds).toEqual([
      "main_brow_inner",
      "main_brow_outer",
    ]);
    expect(proposal.parentRows[0]?.status).toBe("unmapped");
    expect(proposal.unresolvedRows.map((row) => row.status)).toEqual([
      "ambiguous",
      "unmapped",
    ]);

    const preflight = validateVariableCopyProposalPreflight(proposal);
    expect(preflight.ok).toBe(false);
    expect(preflight.blockingErrors).toHaveLength(2);
  });

  it("maps pose targets by source input path and blocks unresolved targets", () => {
    const sourceCatalog = extractReferenceCatalog(
      makeBundle({
        inputs: [
          { id: "src_smile", path: "/controls/mouth/smile", label: "Smile" },
          { id: "src_jaw", path: "/controls/jaw/open", label: "Jaw Open" },
        ],
        poses: [
          {
            id: "pose_happy",
            name: "Happy",
            values: {
              src_smile: 0.8,
              src_jaw: 0.25,
            },
          },
        ],
      }),
    );
    const destinationCatalog = extractReferenceCatalog(
      makeBundle({
        inputs: [
          {
            id: "main_smile",
            path: "/controls/mouth/smile",
            label: "Smile",
          },
          {
            id: "main_jaw_label_only",
            path: "/controls/other/jaw",
            label: "Jaw Open",
          },
        ],
      }),
    );

    const proposal = buildPoseCopyProposal({
      sourceCatalog,
      destinationCatalog,
      sourcePoseId: "pose_happy",
    });

    const bySourceInputId = new Map(
      proposal.targetRows.map((row) => [row.sourceInputId, row]),
    );
    expect(bySourceInputId.get("src_smile")?.status).toBe("resolved");
    expect(bySourceInputId.get("src_smile")?.destinationInputId).toBe(
      "main_smile",
    );
    expect(bySourceInputId.get("src_jaw")?.status).toBe("unmapped");
    expect(proposal.unresolvedRows.map((row) => row.sourceInputId)).toEqual([
      "src_jaw",
    ]);

    const preflight = validatePoseCopyProposalPreflight(proposal);
    expect(preflight.ok).toBe(false);
    expect(preflight.blockingErrors).toEqual([
      {
        proposalKind: "pose",
        rowId: expect.stringContaining("src_jaw"),
        status: "unmapped",
        message: expect.stringContaining("Blocking unresolved mapping"),
      },
    ]);
  });
});
