import { describe, it, expect } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
  type PoseRigIrFile,
} from "../types";
import { PoseGraphService } from "./poseGraphService";

const createInput = (
  id: string,
  path: string,
  defaultValue = 0,
): StandardRigInput => ({
  id,
  path,
  sourceId: id,
  label: id,
  group: "test",
  defaultValue,
  range: { min: -1, max: 1 },
});

function findNode(spec: GraphSpec, id: string) {
  return spec.nodes?.find((node: any) => node.id === id);
}

describe("PoseGraphService", () => {
  it("builds pose graphs with canonical per-pose weight paths", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: "Emotions",
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "average",
    });
    const inputNode = findNode(spec, "pose_pose_a") as any;
    expect(inputNode?.type).toBe("input");
    expect(inputNode?.params?.path).toBe("rig/robot/poses/pose_a.weight");
  });

  it("applies additive blend mode when requested", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: null,
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "additive",
    });
    const groupAddNode = spec.nodes?.find(
      (node: any) =>
        node.id?.startsWith("pose_group_add_smile") && node.type === "add",
    );
    expect(groupAddNode?.type).toBe("add");
    expect(
      spec.nodes?.find((node: any) =>
        node.id?.startsWith("pose_group_overlay_smile"),
      ),
    ).toBeUndefined();
  });

  it("builds cross-group additive topology when groups share a target", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      crossGroupBlendMode: "additive",
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: "Emotions",
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
        {
          id: "pose_b",
          name: "Talk",
          group: "Visemes",
          values: { smile: -0.2 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      defaultGroupBlendMode: "average",
      crossGroupBlendMode: "additive",
    });
    expect(findNode(spec, "pose_cross_apply_smile")?.type).toBe("add");
  });

  it("builds deterministic shared-pose graphs for equivalent membership sets", () => {
    const baseConfig = {
      version: 1 as const,
      faceId: "robot",
      rigKind: "face-specific" as const,
      neutralInputs: { smile: 0 },
      crossGroupBlendMode: "additive" as const,
      poseGroups: [
        { id: "emotion_main", name: "Emotion Main", path: "emotion/main" },
        { id: "viseme_main", name: "Viseme Main", path: "viseme/main" },
      ],
      poses: [
        {
          id: "pose_shared",
          name: "Shared",
          group: null,
          groupId: null,
          groupIds: ["viseme_main", "emotion_main"],
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const first = PoseGraphService.buildSpec(baseConfig, inputs, {
      defaultGroupBlendMode: "average",
      crossGroupBlendMode: "additive",
    });
    const second = PoseGraphService.buildSpec(
      {
        ...baseConfig,
        poses: [
          {
            ...baseConfig.poses[0],
            groupIds: ["emotion_main", "viseme_main"],
          },
        ],
      },
      inputs,
      {
        defaultGroupBlendMode: "average",
        crossGroupBlendMode: "additive",
      },
    );

    expect(second.spec).toEqual(first.spec);
    expect(second.summary).toEqual(first.summary);
  });

  it("enforces canonical-id targeting when compiling from pose IR", () => {
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const baseIr: PoseRigIrFile = {
      version: 1,
      faceId: "robot",
      rigKind: "face-specific",
      contracts: {
        targetIds: POSE_IR_TARGETING_CONTRACT,
        syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
      },
      neutral: {
        mode: "explicit",
        values: { smile: 0 },
      },
      groups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          intraGroupBlendMode: "average",
          poseIds: ["pose_smile"],
        },
      ],
      crossGroupPolicy: { mode: "add" },
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

    const compiled = PoseGraphService.buildSpecFromIr(baseIr, inputs);
    expect(findNode(compiled.spec, "out_smile")?.type).toBe("output");

    const invalid = {
      ...baseIr,
      poses: [
        {
          ...baseIr.poses[0],
          targets: {
            smile: 0.8,
            ghost: 1,
          },
        },
      ],
    } satisfies PoseRigIrFile;

    expect(() => PoseGraphService.buildSpecFromIr(invalid, inputs)).toThrow(
      /canonical standard input id/,
    );
  });

  it("uses standard input defaults when neutral values are omitted", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: {},
      poses: [],
    };
    const inputs: StandardRigInput[] = [
      createInput("smile", "/face/smile", 0.25),
    ];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "average",
    });
    const neutralNode = findNode(spec, "pose_neutral_record") as any;
    expect(
      neutralNode?.params?.value?.record?.values?.record?.smile?.float,
    ).toBeCloseTo(0.25, 6);
  });

  it("uses face defaults when IR neutral mode is face-default", () => {
    const inputs: StandardRigInput[] = [
      createInput("smile", "/face/smile", 0.25),
    ];
    const ir: PoseRigIrFile = {
      version: 1,
      faceId: "robot",
      rigKind: "face-specific",
      contracts: {
        targetIds: POSE_IR_TARGETING_CONTRACT,
        syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
      },
      neutral: {
        mode: "face-default",
        values: { smile: 0.9 },
      },
      groups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          intraGroupBlendMode: "average",
          poseIds: ["pose_smile"],
        },
      ],
      crossGroupPolicy: { mode: "add" },
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

    const { spec } = PoseGraphService.buildSpecFromIr(ir, inputs);
    const neutralNode = findNode(spec, "pose_neutral_record") as any;
    expect(
      neutralNode?.params?.value?.record?.values?.record?.smile?.float,
    ).toBeCloseTo(0.25, 6);
  });

  it("consumes explicit blend stages from pose IR", () => {
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const ir: PoseRigIrFile = {
      version: 1,
      faceId: "robot",
      rigKind: "face-specific",
      contracts: {
        targetIds: POSE_IR_TARGETING_CONTRACT,
        syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
      },
      neutral: {
        mode: "explicit",
        values: { smile: 0 },
      },
      groups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          intraGroupBlendMode: "average",
          poseIds: ["pose_smile"],
        },
        {
          id: "viseme",
          name: "Viseme",
          path: "viseme",
          intraGroupBlendMode: "average",
          poseIds: ["pose_talk"],
        },
      ],
      crossGroupPolicy: { mode: "add" },
      blendStages: [
        {
          id: "stage_base",
          mode: "average",
          sources: [
            { kind: "group", id: "emotion" },
            { kind: "group", id: "viseme" },
          ],
        },
        {
          id: "stage_final",
          mode: "add",
          sources: [
            { kind: "stage", id: "stage_base" },
            { kind: "group", id: "emotion" },
          ],
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
        {
          id: "pose_talk",
          name: "Talk",
          groupIds: ["viseme"],
          targets: { smile: -0.2 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { spec } = PoseGraphService.buildSpecFromIr(ir, inputs);
    expect(findNode(spec, "pose_stage_smile_1_stage_base_overlay")?.type).toBe(
      "blendweightedaverageoverlay",
    );
    expect(findNode(spec, "pose_stage_smile_2_stage_final_apply")?.type).toBe(
      "add",
    );
    expect(findNode(spec, "pose_cross_apply_smile")).toBeUndefined();
  });

  it("flags invalid specs", () => {
    const warnings = PoseGraphService.validate({ nodes: [] }, []);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("reports no warnings for parsed spec", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: "Emotions",
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "average",
    });
    const warnings = PoseGraphService.validate(spec, inputs);
    expect(warnings.length).toBe(0);
  });

  it("generates a safe summary for existing specs", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0.1, frown: 0 },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          group: "Emotions",
          values: { smile: 0.8, frown: 0 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [
      createInput("smile", "/face/smile"),
      createInput("frown", "/face/frown"),
    ];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      blendMode: "average",
    });

    const summary = PoseGraphService.generateSummary(spec, inputs);
    expect(summary.inputs).toHaveLength(1);
    expect(summary.inputs[0]).toMatchObject({
      id: "smile",
      path: "/face/smile",
      neutral: 0.1,
    });
    expect(summary.outputs).toEqual(["/face/smile"]);
  });

  it("returns an empty summary when parsing fails", () => {
    const summary = PoseGraphService.generateSummary({ nodes: [] }, []);
    expect(summary).toEqual({ inputs: [], outputs: [] });
  });
});
