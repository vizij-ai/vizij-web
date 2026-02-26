import type { StandardRigInput } from "@vizij/utils";
import { describe, expect, it } from "vitest";
import type {
  PoseBlendMode,
  PoseDefinition,
  PoseGroupDefinition,
  PoseIrBlendStageDefinition,
} from "../../poseRig/types";
import {
  buildPoseGroupCompositionPreview,
  buildPoseStageCompositionPreview,
  resolveEffectiveNeutralRecord,
} from "./poseCompositionPreview";

const STANDARD_INPUTS: StandardRigInput[] = [
  {
    id: "jaw_open",
    path: "/face/jaw_open",
    label: "Jaw Open",
    group: "face",
    defaultValue: 0,
    range: { min: 0, max: 1 },
  },
  {
    id: "smile",
    path: "/face/smile",
    label: "Smile",
    group: "face",
    defaultValue: 0.2,
    range: { min: 0, max: 1 },
  },
];

function createPose(
  id: string,
  name: string,
  values: Record<string, number>,
  groupIds: string[] = [],
): PoseDefinition {
  return {
    id,
    name,
    values,
    groupIds,
    groupId: groupIds[0] ?? null,
    group: null,
    createdAt: "2026-02-26T00:00:00.000Z",
    updatedAt: "2026-02-26T00:00:00.000Z",
  };
}

describe("poseCompositionPreview", () => {
  it("resolves scoped neutral with clamped values and lower fallback", () => {
    const result = resolveEffectiveNeutralRecord({
      standardInputs: STANDARD_INPUTS,
      lowerRecord: {
        jaw_open: 0.35,
        smile: 0.4,
      },
      lowerDetail: "Lower neutral",
      scopedNeutral: {
        sourceType: "direct-values",
        values: {
          jaw_open: 2,
        },
      },
      poses: [],
    });

    expect(result.summary.sourceType).toBe("direct-values");
    expect(result.values.jaw_open).toBe(1);
    expect(result.channels.jaw_open?.origin).toBe("scoped");
    expect(result.values.smile).toBe(0.4);
    expect(result.channels.smile?.origin).toBe("fallback");
  });

  it("computes group additive and overlay-average outputs from live pose weights", () => {
    const poses = [
      createPose("pose_a", "Pose A", { jaw_open: 1 }),
      createPose("pose_b", "Pose B", { jaw_open: 0.5 }),
    ];
    const poseWeights = {
      pose_a: 0.5,
      pose_b: 0.25,
    };

    const additive = buildPoseGroupCompositionPreview({
      standardInputs: STANDARD_INPUTS,
      neutralInputs: { jaw_open: 0, smile: 0.2 },
      poses,
      poseWeights,
      group: {
        id: "group_add",
        label: "Additive",
        blendMode: "additive",
        poseIds: ["pose_a", "pose_b"],
      },
    });

    const additiveJaw = additive.channels.find(
      (channel) => channel.inputId === "jaw_open",
    );
    expect(additiveJaw?.effectiveValue).toBeCloseTo(0.625, 6);

    const average = buildPoseGroupCompositionPreview({
      standardInputs: STANDARD_INPUTS,
      neutralInputs: { jaw_open: 0, smile: 0.2 },
      poses,
      poseWeights,
      group: {
        id: "group_avg",
        label: "Average",
        blendMode: "average",
        poseIds: ["pose_a", "pose_b"],
      },
    });

    const averageJaw = average.channels.find(
      (channel) => channel.inputId === "jaw_open",
    );
    expect(averageJaw?.effectiveValue).toBeCloseTo(0.4166666667, 6);
  });

  it("resolves stage neutral precedence from first source and composes add mode", () => {
    const poses = [
      createPose("pose_a", "Pose A", { jaw_open: 1 }, ["group_a"]),
      createPose("pose_b", "Pose B", { jaw_open: 0.4 }, ["group_b"]),
    ];

    const poseGroups: PoseGroupDefinition[] = [
      {
        id: "group_a",
        name: "Group A",
        path: "groups/group_a",
        blendMode: "additive",
        neutral: {
          sourceType: "direct-values",
          values: { jaw_open: 0.2 },
        },
      },
      {
        id: "group_b",
        name: "Group B",
        path: "groups/group_b",
        blendMode: "additive",
      },
    ];

    const stages: PoseIrBlendStageDefinition[] = [
      {
        id: "stage_base",
        name: "Stage Base",
        mode: "add",
        sources: [{ kind: "group", id: "group_a" }],
      },
      {
        id: "stage_inherit",
        name: "Stage Inherit",
        mode: "add",
        neutral: { sourceType: "inherit" },
        sources: [
          { kind: "group", id: "group_b" },
          { kind: "stage", id: "stage_base" },
        ],
      },
    ];

    const preview = buildPoseStageCompositionPreview({
      standardInputs: STANDARD_INPUTS,
      neutralInputs: { jaw_open: 0.1, smile: 0.2 },
      poses,
      poseWeights: {
        pose_a: 1,
        pose_b: 0.5,
      },
      poseGroups,
      blendStages: stages,
      defaultGroupBlendMode: "average" as PoseBlendMode,
      stageId: "stage_inherit",
    });

    expect(preview).not.toBeNull();
    const jaw = preview?.channels.find(
      (channel) => channel.inputId === "jaw_open",
    );
    expect(jaw?.neutral.value).toBeCloseTo(0.1, 6);
    expect(jaw?.effectiveValue).toBeCloseTo(1.15, 6);
    expect(jaw?.contributions).toHaveLength(2);
  });

  it("uses direct stage neutral override with overlay-average stage composition", () => {
    const poses = [
      createPose("pose_a", "Pose A", { jaw_open: 1 }, ["group_a"]),
      createPose("pose_b", "Pose B", { jaw_open: 0.4 }, ["group_b"]),
    ];

    const poseGroups: PoseGroupDefinition[] = [
      {
        id: "group_a",
        name: "Group A",
        path: "groups/group_a",
        blendMode: "additive",
        neutral: {
          sourceType: "direct-values",
          values: { jaw_open: 0.2 },
        },
      },
      {
        id: "group_b",
        name: "Group B",
        path: "groups/group_b",
        blendMode: "additive",
      },
    ];

    const stages: PoseIrBlendStageDefinition[] = [
      {
        id: "stage_base",
        name: "Stage Base",
        mode: "add",
        sources: [{ kind: "group", id: "group_a" }],
      },
      {
        id: "stage_overlay",
        name: "Stage Overlay",
        mode: "average",
        neutral: {
          sourceType: "direct-values",
          values: { jaw_open: 0.4 },
        },
        sources: [
          { kind: "group", id: "group_b" },
          { kind: "stage", id: "stage_base" },
        ],
      },
    ];

    const preview = buildPoseStageCompositionPreview({
      standardInputs: STANDARD_INPUTS,
      neutralInputs: { jaw_open: 0.1, smile: 0.2 },
      poses,
      poseWeights: {
        pose_a: 1,
        pose_b: 0.5,
      },
      poseGroups,
      blendStages: stages,
      defaultGroupBlendMode: "average",
      stageId: "stage_overlay",
    });

    expect(preview).not.toBeNull();
    const jaw = preview?.channels.find(
      (channel) => channel.inputId === "jaw_open",
    );
    expect(jaw?.neutral.value).toBeCloseTo(0.4, 6);
    expect(jaw?.effectiveValue).toBeCloseTo(0.75, 6);
    expect(jaw?.activity).toBeCloseTo(1, 6);
  });
});
