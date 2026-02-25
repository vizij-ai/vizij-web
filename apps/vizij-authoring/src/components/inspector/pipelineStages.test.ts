import { SELF_BINDING_ID } from "@vizij/utils";
import { describe, expect, it } from "vitest";
import type { AnimatableBinding } from "@vizij/node-graph-authoring";
import {
  assessLegacyBindingMigration,
  computePipelineDiagnostics,
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
});
