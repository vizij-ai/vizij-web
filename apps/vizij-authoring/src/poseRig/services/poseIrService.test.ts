import { describe, expect, it } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
  type PoseRigIrFile,
} from "../types";
import { PoseIrService } from "./poseIrService";

const createInput = (id: string, path: string): StandardRigInput => ({
  id,
  path,
  sourceId: id,
  label: id,
  group: "test",
  defaultValue: 0,
  range: { min: -1, max: 1 },
});

describe("PoseIrService", () => {
  it("maps legacy config blend modes into v1 pose IR", () => {
    const { ir, warnings, diagnostics } = PoseIrService.fromConfig(
      {
        version: 1,
        faceId: "robot",
        rigKind: "face-specific",
        neutralInputs: {
          smile: 0,
          unknown_input: 0.5,
        },
        crossGroupBlendMode: "additive",
        poseGroups: [
          {
            id: "emotion",
            name: "Emotion",
            path: "emotion",
            blendMode: "additive",
          },
        ],
        poses: [
          {
            id: "pose_smile",
            name: "Smile",
            groupIds: ["emotion"],
            values: {
              smile: 0.8,
              unknown_input: 0.9,
            },
            createdAt: "now",
            updatedAt: "now",
          },
        ],
      },
      [createInput("smile", "/face/smile")],
      "robot",
    );

    expect(ir.contracts).toEqual({
      targetIds: POSE_IR_TARGETING_CONTRACT,
      syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
    });
    expect(ir.crossGroupPolicy.mode).toBe("add");
    expect(ir.groups[0]).toMatchObject({
      id: "emotion",
      intraGroupBlendMode: "add",
      poseIds: ["pose_smile"],
    });
    expect(ir.poses[0]?.targets).toEqual({ smile: 0.8 });
    expect(ir.neutral.values).toEqual({ smile: 0 });
    expect(
      warnings.some((warning) => warning.includes('"unknown_input" ignored')),
    ).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "warning" &&
          diagnostic.code === "non-canonical-input-id",
      ),
    ).toBe(true);
  });

  it("converts pose IR back into legacy pose config payloads", () => {
    const ir: PoseRigIrFile = {
      version: 1,
      faceId: "robot",
      rigKind: "face-specific",
      title: "Robot Rig",
      contracts: {
        targetIds: POSE_IR_TARGETING_CONTRACT,
        syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
      },
      neutral: {
        mode: "explicit",
        values: { smile: 0.1 },
      },
      crossGroupPolicy: { mode: "add" },
      groups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          intraGroupBlendMode: "average",
          poseIds: ["pose_smile"],
        },
      ],
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          targets: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const config = PoseIrService.toConfig(ir);
    expect(config.crossGroupBlendMode).toBe("additive");
    expect(config.poseGroups?.[0]).toMatchObject({
      id: "emotion",
      blendMode: "average",
    });
    expect(config.poses[0]).toMatchObject({
      group: "emotion",
      groupId: "emotion",
      groupIds: ["emotion"],
      values: { smile: 0.8 },
    });
  });

  it("normalizes IR payloads that only provide group poseIds", () => {
    const { ir, warnings, diagnostics } = PoseIrService.normalize(
      {
        version: 1,
        faceId: "robot",
        contracts: {
          targetIds: POSE_IR_TARGETING_CONTRACT,
          syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
        },
        neutral: {
          mode: "explicit",
          values: {
            smile: 0,
            unknown_input: 1,
          },
        },
        crossGroupPolicy: { mode: "average" },
        groups: [
          {
            id: "emotion",
            name: "Emotion",
            path: "emotion",
            intraGroupBlendMode: "average",
            poseIds: ["pose_smile"],
          },
        ],
        poses: [
          {
            id: "pose_smile",
            name: "Smile",
            targets: { smile: 0.8 },
            createdAt: "now",
            updatedAt: "now",
          },
        ],
      },
      [createInput("smile", "/face/smile")],
      "robot",
    );

    expect(ir.poses[0]?.groupIds).toEqual(["emotion"]);
    expect(ir.groups[0]?.poseIds).toEqual(["pose_smile"]);
    expect(ir.neutral.values).toEqual({ smile: 0 });
    expect(
      warnings.some((warning) => warning.includes('"unknown_input" ignored')),
    ).toBe(true);
    expect(
      diagnostics.some(
        (diagnostic) =>
          diagnostic.severity === "warning" &&
          diagnostic.source === "pose-ir" &&
          diagnostic.code === "non-canonical-input-id",
      ),
    ).toBe(true);
  });

  it("preserves legacy additive cross-group mode when normalizing pose IR", () => {
    const { ir } = PoseIrService.normalize(
      {
        version: 1,
        faceId: "robot",
        contracts: {
          targetIds: POSE_IR_TARGETING_CONTRACT,
          syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
        },
        neutral: {
          mode: "explicit",
          values: { smile: 0 },
        },
        crossGroupBlendMode: "additive",
        groups: [
          {
            id: "emotion",
            name: "Emotion",
            path: "emotion",
            intraGroupBlendMode: "average",
            poseIds: ["pose_smile"],
          },
        ],
        poses: [
          {
            id: "pose_smile",
            name: "Smile",
            targets: { smile: 0.8 },
            createdAt: "now",
            updatedAt: "now",
          },
        ],
      },
      [createInput("smile", "/face/smile")],
      "robot",
    );

    expect(ir.crossGroupPolicy.mode).toBe("add");
  });

  it("throws structured diagnostics for invalid payloads", () => {
    try {
      PoseIrService.normalize(null, [], "robot");
      expect.unreachable("expected normalize to throw");
    } catch (error) {
      const typed = error as Error & {
        diagnostics?: Array<{ severity: string; code: string }>;
      };
      expect(typed.message).toContain("Invalid pose IR payload.");
      expect(typed.diagnostics?.[0]).toMatchObject({
        severity: "error",
        code: "invalid-payload",
      });
    }
  });

  it("throws structured diagnostics for unsupported IR versions", () => {
    try {
      PoseIrService.normalize(
        {
          version: 999,
        },
        [],
        "robot",
      );
      expect.unreachable("expected normalize to throw");
    } catch (error) {
      const typed = error as Error & {
        diagnostics?: Array<{ severity: string; code: string }>;
      };
      expect(typed.message).toContain("Unsupported pose rig IR version");
      expect(typed.diagnostics?.[0]).toMatchObject({
        severity: "error",
        code: "unsupported-ir-version",
      });
    }
  });
});
