import { describe, expect, it } from "vitest";
import {
  cloneCrossGroupChannelOverrides,
  clonePoseComposeModes,
  nextBlendStageId,
  projectPoseComposeModesForValues,
  validateBlendStageTopology,
} from "./poseRigProjectionService";

describe("poseRigProjectionService", () => {
  it("creates deterministic unique blend stage ids", () => {
    const existing = new Set(["stage", "stage_2", "my_stage"]);
    expect(nextBlendStageId("  my stage  ", existing)).toBe("my_stage_2");
    expect(nextBlendStageId("", existing)).toBe("stage_3");
  });

  it("clones and sorts cross-group channel overrides", () => {
    const source = {
      zeta: { mode: "additive" as const, priorityOrder: ["a", "b"] },
      alpha: { mode: "average" as const, tieBreak: "group-id" as const },
    };

    const cloned = cloneCrossGroupChannelOverrides(source);

    expect(cloned).toEqual({
      alpha: { mode: "average", tieBreak: "group-id" },
      zeta: { mode: "additive", priorityOrder: ["a", "b"] },
    });

    source.zeta.priorityOrder?.push("c");
    expect(cloned?.zeta?.priorityOrder).toEqual(["a", "b"]);
  });

  it("projects compose modes to existing input values", () => {
    expect(
      clonePoseComposeModes({
        beta: "average",
        alpha: "add",
      }),
    ).toEqual({
      alpha: "add",
      beta: "average",
    });

    expect(
      projectPoseComposeModesForValues(
        {
          alpha: "add",
          beta: "average",
        },
        { beta: 0.4 },
      ),
    ).toEqual({ beta: "average" });
  });

  it("reports blend-stage topology issues", () => {
    const issues = validateBlendStageTopology(
      [
        {
          id: "stage_a",
          name: "A",
          mode: "average",
          sources: [{ kind: "stage", id: "stage_b" }],
        },
        {
          id: "stage_b",
          name: "B",
          mode: "average",
          sources: [{ kind: "group", id: "missing_group" }],
        },
      ],
      ["eyes"],
    );

    expect(issues.map((issue) => issue.code)).toContain("forward-stage-source");
    expect(issues.map((issue) => issue.code)).toContain("unknown-group-source");
  });
});
