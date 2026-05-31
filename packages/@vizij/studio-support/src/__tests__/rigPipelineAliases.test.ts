import {
  bindingTargetFromInput,
  createDefaultParentBinding,
  type AnimatableBinding,
} from "@vizij/node-graph-authoring";
import {
  buildRigPipelineV1LinkId,
  createStandardRigInputFromPath,
  type StandardRigInput,
} from "@vizij/utils";
import { describe, expect, it } from "vitest";
import { mergePipelineMetadata } from "../utils/pipelineStages";
import {
  resolveAuthoringParentExpressionVariable,
  syncBindingParentAliasReferences,
} from "../utils/rigPipelineAliases";

function makeInput(path: string): StandardRigInput {
  return createStandardRigInputFromPath(path);
}

function readParentBlendExpression(binding: AnimatableBinding): string | null {
  const metadata = binding.metadata as
    | {
        vizij?: {
          pipelineV1?: {
            parentBlend?: {
              expression?: string;
            };
          };
        };
      }
    | undefined;
  return metadata?.vizij?.pipelineV1?.parentBlend?.expression ?? null;
}

function readLinkExpression(
  binding: AnimatableBinding,
  linkId: string,
): string | null {
  const metadata = binding.metadata as
    | {
        vizij?: {
          pipelineV1?: {
            links?: Record<
              string,
              {
                expression?: string;
              }
            >;
          };
        };
      }
    | undefined;
  return metadata?.vizij?.pipelineV1?.links?.[linkId]?.expression ?? null;
}

describe("rigPipelineAliases", () => {
  it("prefers the readable parent alias over pipeline fallback tokens", () => {
    const parentInput = makeInput("/custom/new_driver");

    expect(
      resolveAuthoringParentExpressionVariable({
        input: parentInput,
        slot: {
          id: "s1",
          alias: "new_driver",
        },
        slotIndex: 0,
        linkExpression: null,
        fallbackAlias: "P1",
      }),
    ).toBe("new_driver");
  });

  it("rewrites auto parent formulas when a linked driver is renamed", () => {
    const childInput = makeInput("/custom/child_driver");
    const parentBefore = makeInput("/custom/old_driver");
    const parentAfter = makeInput("/custom/new_driver");
    const linkId = buildRigPipelineV1LinkId(parentAfter.id, childInput.id);

    const binding = createDefaultParentBinding(
      bindingTargetFromInput(childInput),
    );
    binding.slots = [
      {
        id: "s1",
        alias: "old_driver",
        inputId: parentAfter.id,
      },
    ];
    binding.metadata = mergePipelineMetadata(undefined, {
      parentBlendExpression:
        "parentContribution = normalizedAdditive([old_driver], baseline=default)",
      linkUpserts: {
        [linkId]: {
          parentInputId: parentAfter.id,
          childInputId: childInput.id,
          expression: "old_driver = parent * scale + offset",
        },
      },
    });

    const updated = syncBindingParentAliasReferences({
      binding,
      childInput,
      standardInputsById: new Map([
        [childInput.id, childInput],
        [parentAfter.id, parentAfter],
      ]),
      parentInputBefore: parentBefore,
      parentInputAfter: parentAfter,
    });

    expect(updated.slots[0]?.alias).toBe("new_driver");
    expect(readLinkExpression(updated, linkId)).toBe(
      "new_driver = parent * scale + offset",
    );
    expect(readParentBlendExpression(updated)).toBe(
      "parentContribution = normalizedAdditive([new_driver], baseline=default)",
    );
  });

  it("preserves custom parent formulas while still refreshing the slot alias", () => {
    const childInput = makeInput("/custom/child_driver");
    const parentBefore = makeInput("/custom/old_driver");
    const parentAfter = makeInput("/custom/new_driver");
    const linkId = buildRigPipelineV1LinkId(parentAfter.id, childInput.id);

    const binding = createDefaultParentBinding(
      bindingTargetFromInput(childInput),
    );
    binding.slots = [
      {
        id: "s1",
        alias: "old_driver",
        inputId: parentAfter.id,
      },
    ];
    binding.metadata = mergePipelineMetadata(undefined, {
      parentBlendExpression:
        "parentContribution = normalizedAdditive([value], baseline=default)",
      linkUpserts: {
        [linkId]: {
          parentInputId: parentAfter.id,
          childInputId: childInput.id,
          expression: "value = parent * scale + offset * 2",
        },
      },
    });

    const updated = syncBindingParentAliasReferences({
      binding,
      childInput,
      standardInputsById: new Map([
        [childInput.id, childInput],
        [parentAfter.id, parentAfter],
      ]),
      parentInputBefore: parentBefore,
      parentInputAfter: parentAfter,
    });

    expect(updated.slots[0]?.alias).toBe("new_driver");
    expect(readLinkExpression(updated, linkId)).toBe(
      "value = parent * scale + offset * 2",
    );
    expect(readParentBlendExpression(updated)).toBe(
      "parentContribution = normalizedAdditive([value], baseline=default)",
    );
  });
});
