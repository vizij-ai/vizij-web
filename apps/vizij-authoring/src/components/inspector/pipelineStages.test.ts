import { SELF_BINDING_ID } from "@vizij/utils";
import { describe, expect, it } from "vitest";
import type { AnimatableBinding } from "@vizij/node-graph-authoring";
import {
  assessLegacyBindingMigration,
  buildDefaultParentContributionFormula,
  buildDefaultParentVariableFormula,
  buildLegacyMigrationLinkUpserts,
  buildParentContributionDisplayExpression,
  computePipelineDiagnostics,
  mergePipelineMetadata,
  resolvePipelineStageSettings,
} from "./pipelineStages";

function createBinding(
  overrides: Partial<AnimatableBinding> = {},
): AnimatableBinding {
  return {
    targetId: "rig/test/mouth_open",
    inputId: SELF_BINDING_ID,
    expression: "self + jaw",
    slots: [
      { id: "s1", alias: "self", inputId: SELF_BINDING_ID },
      { id: "s2", alias: "jaw", inputId: "rig/jaw/open" },
    ],
    ...overrides,
  };
}

describe("pipelineStages", () => {
  it("detects canonical self+parent expressions as convertible", () => {
    const assessment = assessLegacyBindingMigration(createBinding());
    expect(assessment.kind).toBe("convertible");
    expect(assessment.reason).toBeNull();
    expect(assessment.parentFactorsByInputId).toEqual({
      "rig/jaw/open": 1,
    });
  });

  it("supports additive parent factors like self - parent*2", () => {
    const assessment = assessLegacyBindingMigration(
      createBinding({
        expression: "self - jaw*2",
      }),
    );
    expect(assessment.kind).toBe("convertible");
    expect(assessment.parentFactorsByInputId).toEqual({
      "rig/jaw/open": -2,
    });
  });

  it("flags non-convertible legacy expressions as read-only fallback", () => {
    const assessment = assessLegacyBindingMigration(
      createBinding({
        expression: "max(self, jaw * 0.5)",
      }),
    );
    expect(assessment.kind).toBe("non-convertible");
    expect(assessment.reason).toMatch(/canonical additive self\+parent/i);
  });

  it("prefers migrated metadata status when present", () => {
    const assessment = assessLegacyBindingMigration(
      createBinding({
        metadata: {
          vizij: {
            pipelineV1: {
              migration: {
                status: "migrated",
              },
            },
          },
        },
      }),
    );
    expect(assessment.kind).toBe("migrated");
  });

  it("resolves stage defaults and computes diagnostics from available values", () => {
    const binding = createBinding();
    const settings = resolvePipelineStageSettings(binding, {
      defaultValue: 0,
      fallbackDirectEnabled: true,
    });
    expect(settings.directInputEnabled).toBe(true);
    expect(settings.overrideEnabled).toBe(false);
    expect(settings.clampEnabled).toBe(true);

    const diagnostics = computePipelineDiagnostics({
      baseline: 0,
      min: -1,
      max: 1,
      parentValues: [0.5, 0.25],
      poseContribution: 0.1,
      directValue: 0.2,
      directEnabled: settings.directInputEnabled,
      overrideEnabled: settings.overrideEnabled,
      overrideValue: settings.overrideValue,
      clampEnabled: settings.clampEnabled,
    });
    expect(diagnostics.parentContribution).toBeCloseTo(0.75, 6);
    expect(diagnostics.blendedResult).toBeCloseTo(1.05, 6);
    expect(diagnostics.effectiveResult).toBeCloseTo(1, 6);
  });

  it("builds staged parent contribution expression after migration", () => {
    const expression = buildParentContributionDisplayExpression({
      baseline: 0.25,
      parents: [
        { label: "Jaw", scale: 1, offset: 0.25, enabled: true },
        { label: "Blink", scale: -2, offset: 0.25, enabled: true },
        { label: "Disabled", scale: 1, offset: 0, enabled: false },
      ],
    });
    expect(expression).toContain('parent("Jaw") * 1 + 0.25');
    expect(expression).toContain('parent("Blink") * -2 + 0.25');
    expect(expression).toContain("baseline=0.25");
    expect(expression).not.toContain('parent("Disabled")');
  });

  it("builds default staged formula strings", () => {
    expect(buildDefaultParentVariableFormula("P1")).toBe(
      "P1 = parent * scale + offset",
    );
    expect(buildDefaultParentContributionFormula(["P1", "P2"])).toBe(
      "parentContribution = normalizedAdditive([P1, P2], baseline=default)",
    );
  });

  it("merges parent formulas into pipeline metadata", () => {
    const merged = mergePipelineMetadata(undefined, {
      parentBlendExpression: "parentContribution = P1 * 0.5 + default",
      linkUpserts: {
        "link/p1": {
          parentInputId: "parent",
          childInputId: "child",
          expression: "P1 = parent * scale + offset * 2",
        },
      },
    });

    const pipeline = (merged.vizij as { pipelineV1?: unknown }).pipelineV1 as {
      parentBlend?: { expression?: string };
      links?: Record<string, { expression?: string }>;
    };
    expect(pipeline.parentBlend?.expression).toBe(
      "parentContribution = P1 * 0.5 + default",
    );
    expect(pipeline.links?.["link/p1"]?.expression).toBe(
      "P1 = parent * scale + offset * 2",
    );
  });

  it("uses variable default as migrated parent-link offset", () => {
    const upserts = buildLegacyMigrationLinkUpserts({
      binding: createBinding({
        expression: "self - jaw*2",
        slots: [
          { id: "s1", alias: "self", inputId: SELF_BINDING_ID },
          { id: "s2", alias: "jaw", inputId: "rig/jaw/open" },
        ],
      }),
      childInputId: "rig/mouth/open",
      factorsByInputId: {
        "rig/jaw/open": -2,
      },
      defaultOffset: 0.4,
      resolveInputId: (inputId) => inputId,
    });

    const entries = Object.values(upserts);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      parentInputId: "rig/jaw/open",
      childInputId: "rig/mouth/open",
      scale: -2,
      offset: 0.4,
      enabled: true,
    });
  });
});
