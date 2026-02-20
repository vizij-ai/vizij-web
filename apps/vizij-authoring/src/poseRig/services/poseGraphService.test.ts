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

interface OverlapSource {
  id: string;
  output: number;
  activity: number;
}

interface OverlapScenario {
  neutral: number;
  sources: OverlapSource[];
  priorityOrder: string[];
  expected: {
    additive: number;
    weightedAverage: number;
    priority: number;
    heuristicWeightedAverage: number;
  };
}

function evaluateAdditiveOutput(scenario: OverlapScenario): number {
  const contribution = scenario.sources.reduce(
    (sum, source) => sum + (source.output - scenario.neutral),
    0,
  );
  return Math.max(0, Math.min(1, scenario.neutral + contribution));
}

function evaluateWeightedAverageOutput(
  scenario: OverlapScenario,
  options?: { heuristic?: boolean },
): number {
  const weights = scenario.sources.map((source) => {
    if (!options?.heuristic) {
      return source.activity;
    }
    if (source.activity < 0.1) {
      return 0;
    }
    const compressed = Math.sqrt((source.activity - 0.1) / 0.9);
    return Math.max(compressed, 0.25);
  });

  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalWeight <= 1e-6) {
    return scenario.neutral;
  }

  const weightedSum = scenario.sources.reduce(
    (sum, source, index) => sum + source.output * (weights[index] ?? 0),
    0,
  );
  return weightedSum / totalWeight;
}

function evaluatePriorityOutput(
  scenario: OverlapScenario,
  activeThreshold = 0.1,
): number {
  for (const sourceId of scenario.priorityOrder) {
    const source = scenario.sources.find(
      (candidate) => candidate.id === sourceId,
    );
    if (!source) {
      continue;
    }
    if (source.activity >= activeThreshold) {
      return source.output;
    }
  }
  return scenario.neutral;
}

describe("PoseGraphService", () => {
  it("does not accept the removed poseGroupSegment option", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: {},
      poses: [],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];

    // @ts-expect-error poseGroupSegment contract removed from public API
    PoseGraphService.buildSpec(config, inputs, { poseGroupSegment: "legacy" });
  });

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

  it("applies per-channel priority override topology from config", () => {
    const config: any = {
      faceId: "robot",
      rigKind: "face-specific",
      neutralInputs: { smile: 0 },
      crossGroupBlendMode: "average",
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
      crossGroupChannelOverrides: {
        smile: {
          mode: "priority",
          priorityOrder: ["viseme", "emotion"],
          tieBreak: "group-order",
        },
      },
      poses: [
        {
          id: "pose_a",
          name: "Smile",
          groupIds: ["emotion"],
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
        {
          id: "pose_b",
          name: "Talk",
          groupIds: ["viseme"],
          values: { smile: -0.2 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };
    const inputs: StandardRigInput[] = [createInput("smile", "/face/smile")];
    const { spec } = PoseGraphService.buildSpec(config, inputs, {
      defaultGroupBlendMode: "average",
      crossGroupBlendMode: "average",
    });
    const priorityOverlays = (spec.nodes ?? []).filter(
      (node: any) =>
        node.type === "blendweightedaverageoverlay" &&
        typeof node.id === "string" &&
        node.id.includes("priority") &&
        node.id.includes("smile"),
    );
    expect(priorityOverlays.length).toBeGreaterThan(0);
    const crossOverlaysForSmile = (spec.nodes ?? []).filter(
      (node: any) =>
        typeof node.id === "string" &&
        node.id.startsWith("pose_cross_overlay_smile"),
    );
    expect(crossOverlaysForSmile).toHaveLength(0);
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
    const stageBaseOverlays = (spec.nodes ?? []).filter(
      (node: any) =>
        node.type === "blendweightedaverageoverlay" &&
        typeof node.id === "string" &&
        node.id.includes("stage_base") &&
        node.id.includes("smile"),
    );
    const stageFinalAdds = (spec.nodes ?? []).filter(
      (node: any) =>
        node.type === "add" &&
        typeof node.id === "string" &&
        node.id.includes("stage_final") &&
        node.id.includes("smile"),
    );
    expect(stageBaseOverlays.length).toBeGreaterThan(0);
    expect(stageFinalAdds.length).toBeGreaterThan(0);
    const crossAppliesForSmile = (spec.nodes ?? []).filter(
      (node: any) =>
        typeof node.id === "string" &&
        node.id.startsWith("pose_cross_apply_smile"),
    );
    expect(crossAppliesForSmile).toHaveLength(0);
  });

  it("applies per-channel priority override topology from IR", () => {
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
      crossGroupPolicy: {
        mode: "average",
        overrides: {
          smile: {
            mode: "priority",
            priorityOrder: ["viseme", "emotion"],
            tieBreak: "group-order",
          },
        },
      },
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
    const priorityOverlays = (spec.nodes ?? []).filter(
      (node: any) =>
        node.type === "blendweightedaverageoverlay" &&
        typeof node.id === "string" &&
        node.id.includes("priority") &&
        node.id.includes("smile"),
    );
    expect(priorityOverlays.length).toBeGreaterThan(0);
    const crossOverlaysForSmile = (spec.nodes ?? []).filter(
      (node: any) =>
        typeof node.id === "string" &&
        node.id.startsWith("pose_cross_overlay_smile"),
    );
    expect(crossOverlaysForSmile).toHaveLength(0);
  });

  it("matches documented E4 overlap scenario outputs (S1-S4)", () => {
    const scenarios: OverlapScenario[] = [
      {
        neutral: 0.5,
        sources: [
          { id: "emotion", output: 0.9, activity: 0.8 },
          { id: "viseme", output: 0.2, activity: 0.7 },
        ],
        priorityOrder: ["viseme", "emotion"],
        expected: {
          additive: 0.6,
          weightedAverage: 0.573,
          priority: 0.2,
          heuristicWeightedAverage: 0.563,
        },
      },
      {
        neutral: 0.4,
        sources: [
          { id: "emotion", output: 0.85, activity: 0.95 },
          { id: "viseme", output: 0.1, activity: 0.35 },
        ],
        priorityOrder: ["viseme", "emotion"],
        expected: {
          additive: 0.55,
          weightedAverage: 0.648,
          priority: 0.1,
          heuristicWeightedAverage: 0.586,
        },
      },
      {
        neutral: 0.4,
        sources: [
          { id: "emotion", output: 0.9, activity: 0.05 },
          { id: "viseme", output: 0.3, activity: 0.8 },
        ],
        priorityOrder: ["viseme", "emotion"],
        expected: {
          additive: 0.8,
          weightedAverage: 0.335,
          priority: 0.3,
          heuristicWeightedAverage: 0.3,
        },
      },
      {
        neutral: 0.2,
        sources: [
          { id: "smile", output: 0.6, activity: 0.75 },
          { id: "jaw", output: 0.55, activity: 0.7 },
        ],
        priorityOrder: ["smile", "jaw"],
        expected: {
          additive: 0.95,
          weightedAverage: 0.576,
          priority: 0.6,
          heuristicWeightedAverage: 0.575,
        },
      },
    ];

    scenarios.forEach((scenario) => {
      expect(evaluateAdditiveOutput(scenario)).toBeCloseTo(
        scenario.expected.additive,
        3,
      );
      expect(evaluateWeightedAverageOutput(scenario)).toBeCloseTo(
        scenario.expected.weightedAverage,
        3,
      );
      expect(evaluatePriorityOutput(scenario)).toBeCloseTo(
        scenario.expected.priority,
        3,
      );
      expect(
        evaluateWeightedAverageOutput(scenario, { heuristic: true }),
      ).toBeCloseTo(scenario.expected.heuristicWeightedAverage, 2);
    });
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
