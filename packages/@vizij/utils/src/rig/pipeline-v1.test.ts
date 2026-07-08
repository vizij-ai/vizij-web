import { describe, expect, it } from "vitest";
import {
  buildRigPipelineV1ParentContributionExpression,
  buildRigPipelineV1ParentExpression,
  buildRigPipelineV1DirectValuePath,
  extractRigPipelineFormulaAssignedVariable,
  buildRigPipelineV1OverrideEnabledPath,
  buildRigPipelineV1OverrideValuePath,
  hasRigPipelineV1InputConfig,
  resolveRigPipelineV1FormulaVariable,
  resolveRigPipelineV1InputConfig,
  type RigPipelineV1Metadata,
} from "./pipeline-v1";

const TEST_INPUT = {
  id: "jaw_open",
  path: "/controls/jaw/open",
  defaultValue: 0.25,
};

describe("pipeline-v1 path helpers", () => {
  it("builds canonical direct and override paths", () => {
    expect(buildRigPipelineV1DirectValuePath("robot", TEST_INPUT.path)).toBe(
      "rig/robot/controls/jaw/open",
    );
    expect(buildRigPipelineV1OverrideEnabledPath("robot", TEST_INPUT.id)).toBe(
      "rig/robot/override/jaw_open/enabled",
    );
    expect(buildRigPipelineV1OverrideValuePath("robot", TEST_INPUT.id)).toBe(
      "rig/robot/override/jaw_open/value",
    );
  });
});

describe("pipeline-v1 formula helpers", () => {
  it("builds default parent and parent-contribution expressions", () => {
    expect(buildRigPipelineV1ParentExpression("P1")).toBe(
      "P1 = parent * scale + offset",
    );
    expect(buildRigPipelineV1ParentContributionExpression(["P1", "P2"])).toBe(
      "parentContribution = normalizedAdditive([P1, P2], baseline=default)",
    );
  });

  it("prefers the assigned variable from custom parent formulas", () => {
    expect(
      extractRigPipelineFormulaAssignedVariable(
        "value = parent * scale + offset",
      ),
    ).toBe("value");
    expect(
      resolveRigPipelineV1FormulaVariable({
        alias: "new_driver",
        expression: "value = parent * scale + offset",
      }),
    ).toBe("value");
    expect(
      buildRigPipelineV1ParentContributionExpression([
        {
          alias: "new_driver",
          expression: "value = parent * scale + offset",
        },
        "jaw",
      ]),
    ).toBe(
      "parentContribution = normalizedAdditive([value, jaw], baseline=default)",
    );
  });
});

describe("resolveRigPipelineV1InputConfig", () => {
  it("uses canonical defaults when staged config is absent", () => {
    const resolved = resolveRigPipelineV1InputConfig({
      faceId: "robot",
      input: TEST_INPUT,
      pipelineV1: undefined,
    });

    expect(resolved.staged).toBe(false);
    expect(resolved.parents).toEqual([]);
    expect(resolved.directInput.enabled).toBe(false);
    expect(resolved.directInput.valuePath).toBe("rig/robot/controls/jaw/open");
    expect(resolved.sourceBlend.mode).toBe("normalized-additive");
    expect(resolved.parentBlend.mode).toBe("normalized-additive");
    expect(resolved.clamp.enabled).toBe(true);
    expect(resolved.override.enabledDefault).toBe(false);
    expect(resolved.override.valueDefault).toBe(TEST_INPUT.defaultValue);
  });

  it("normalizes staged settings and parent defaults", () => {
    const pipelineV1: RigPipelineV1Metadata = {
      version: 1,
      links: {
        "link/brow_raise->jaw_open": {
          linkId: "link/brow_raise->jaw_open",
          parentInputId: "brow_raise",
          childInputId: TEST_INPUT.id,
          scale: -2,
          offset: 0.25,
          enabled: true,
        },
        "custom-link": {
          linkId: "custom-link",
          parentInputId: "blink",
          childInputId: TEST_INPUT.id,
          scale: 0.75,
          offset: -0.2,
          enabled: true,
        },
      },
      byInputId: {
        [TEST_INPUT.id]: {
          inputId: TEST_INPUT.id,
          parents: [
            {
              inputId: "brow_raise",
            },
            {
              inputId: "blink",
              linkId: "custom-link",
              alias: "blinkParent",
              scale: 0.5,
              offset: 0.1,
              enabled: false,
            },
          ],
          poseSource: {
            targetIds: ["pose_a", "pose_b"],
          },
          directInput: {
            enabled: true,
            valuePath: "rig/ignored/for/contracts",
          },
          clamp: {
            enabled: false,
          },
          override: {
            enabledDefault: true,
            valueDefault: 0.9,
            enabledPath: "rig/ignored/enabled",
            valuePath: "rig/ignored/value",
          },
        },
      },
    };

    expect(hasRigPipelineV1InputConfig(pipelineV1, TEST_INPUT.id)).toBe(true);

    const resolved = resolveRigPipelineV1InputConfig({
      faceId: "robot",
      input: TEST_INPUT,
      pipelineV1,
    });

    expect(resolved.staged).toBe(true);
    expect(resolved.parents).toHaveLength(2);
    expect(resolved.parents[0]).toMatchObject({
      inputId: "brow_raise",
      alias: "P1",
      scale: -2,
      offset: 0.25,
      enabled: true,
      expression: "P1 = parent * scale + offset",
    });
    expect(resolved.parents[1]).toMatchObject({
      inputId: "blink",
      linkId: "custom-link",
      alias: "blinkParent",
      scale: 0.75,
      offset: -0.2,
      enabled: true,
      expression: "blinkParent = parent * scale + offset",
    });
    expect(resolved.parentBlend.expression).toBe(
      "parentContribution = normalizedAdditive([P1, blinkParent], baseline=default)",
    );
    expect(resolved.poseSource.targetIds).toEqual(["pose_a", "pose_b"]);
    expect(resolved.directInput.enabled).toBe(true);
    expect(resolved.clamp.enabled).toBe(false);
    expect(resolved.override.enabledDefault).toBe(true);
    expect(resolved.override.valueDefault).toBe(0.9);
    expect(resolved.override.enabledPath).toBe(
      "rig/robot/override/jaw_open/enabled",
    );
    expect(resolved.override.valuePath).toBe(
      "rig/robot/override/jaw_open/value",
    );
  });

  it("uses custom parent-formula assignment variables in parent contribution defaults", () => {
    const pipelineV1: RigPipelineV1Metadata = {
      version: 1,
      links: {
        "link/chin->jaw_open": {
          linkId: "link/chin->jaw_open",
          parentInputId: "chin",
          childInputId: TEST_INPUT.id,
          scale: 1,
          offset: 0,
          enabled: true,
          expression: "value = parent * scale + offset",
        },
      },
      byInputId: {
        [TEST_INPUT.id]: {
          inputId: TEST_INPUT.id,
          parents: [
            {
              inputId: "chin",
              linkId: "link/chin->jaw_open",
              alias: "new_driver",
            },
          ],
        },
      },
    };

    const resolved = resolveRigPipelineV1InputConfig({
      faceId: "robot",
      input: TEST_INPUT,
      pipelineV1,
    });

    expect(resolved.parents).toHaveLength(1);
    expect(resolved.parents[0]).toMatchObject({
      inputId: "chin",
      alias: "value",
      expression: "value = parent * scale + offset",
    });
    expect(resolved.parentBlend.expression).toBe(
      "parentContribution = normalizedAdditive([value], baseline=default)",
    );
  });

  it("normalizes legacy slot-style parent contribution formulas to resolved aliases", () => {
    const pipelineV1: RigPipelineV1Metadata = {
      version: 1,
      links: {
        "link/chin->jaw_open": {
          linkId: "link/chin->jaw_open",
          parentInputId: "chin",
          childInputId: TEST_INPUT.id,
          scale: 1,
          offset: 0,
          enabled: true,
          expression: "value = parent * scale + offset",
        },
        "link/jaw_ud->jaw_open": {
          linkId: "link/jaw_ud->jaw_open",
          parentInputId: "jaw_ud",
          childInputId: TEST_INPUT.id,
          scale: 1,
          offset: 0,
          enabled: true,
        },
      },
      byInputId: {
        [TEST_INPUT.id]: {
          inputId: TEST_INPUT.id,
          parentBlend: {
            expression:
              "parentContribution = normalizedAdditive([s1, s2], baseline=default)",
          },
        },
      },
    };

    const resolved = resolveRigPipelineV1InputConfig({
      faceId: "robot",
      input: TEST_INPUT,
      pipelineV1,
    });

    expect(resolved.parents).toHaveLength(2);
    expect(resolved.parents[0]).toMatchObject({
      inputId: "chin",
      alias: "value",
    });
    expect(resolved.parents[1]).toMatchObject({
      inputId: "jaw_ud",
      alias: "P2",
    });
    expect(resolved.parentBlend.expression).toBe(
      "parentContribution = normalizedAdditive([value, P2], baseline=default)",
    );
  });

  it("normalizes mixed stored aliases to resolved assignment variables", () => {
    const pipelineV1: RigPipelineV1Metadata = {
      version: 1,
      byInputId: {
        [TEST_INPUT.id]: {
          inputId: TEST_INPUT.id,
          parents: [
            {
              inputId: "gaze_left_right",
              alias: "s1",
              expression: "left_right = parent * scale + offset",
            },
            {
              inputId: "gaze_left_right_copy",
              alias: "s2",
              expression: "s3 = parent * scale + offset",
            },
            {
              inputId: "standard_vizij_left_eye_pos_x",
              alias: "x",
              expression: "x = parent * scale + offset",
            },
            {
              inputId: "standard_vizij_right_eye_pos_x",
              alias: "x_2",
              enabled: false,
              expression: "x_2 = parent * scale + offset",
            },
          ],
          parentBlend: {
            expression:
              "parentContribution = normalizedAdditive([s1, s2, x], baseline=default)",
          },
        },
      },
    };

    const resolved = resolveRigPipelineV1InputConfig({
      faceId: "robot",
      input: TEST_INPUT,
      pipelineV1,
    });

    expect(resolved.parents.map((entry) => entry.alias)).toEqual([
      "left_right",
      "s3",
      "x",
      "x_2",
    ]);
    expect(resolved.parentBlend.expression).toBe(
      "parentContribution = normalizedAdditive([left_right, s3, x], baseline=default)",
    );
  });
});
