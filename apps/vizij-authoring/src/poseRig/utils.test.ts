import { describe, expect, it } from "vitest";
import {
  buildRigInputPath,
  buildPoseWeightPathMap,
  normalizePoseDefinitionIds,
  resolveDeterministicPoseId,
  slugifyLabel,
} from "./utils";
import type { PoseDefinition } from "./types";

describe("buildRigInputPath", () => {
  it("does not double-prefix already qualified paths", () => {
    expect(buildRigInputPath("robot", "rig/robot/brow/pos")).toBe(
      "rig/robot/brow/pos",
    );
  });

  it("re-homes mismatched or repeated prefixes to the active face id", () => {
    expect(buildRigInputPath("robot", "rig/alien/rig/alien/mouth/pos")).toBe(
      "rig/robot/mouth/pos",
    );
  });
});

describe("slugifyLabel", () => {
  it("normalizes whitespace and capitalization", () => {
    expect(slugifyLabel("Happy Smile", "fallback")).toBe("happy_smile");
  });

  it("falls back when value is empty", () => {
    expect(slugifyLabel("   ", "fallback")).toBe("fallback");
  });
});

describe("buildPoseWeightPathMap", () => {
  const basePose: PoseDefinition = {
    id: "pose_one",
    name: "Pose One",
    description: "",
    group: null,
    values: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("defaults to /poses when no base segment specified", () => {
    const map = buildPoseWeightPathMap([basePose], "robot");
    const info = map.get(basePose.id);
    expect(info?.relativePath.startsWith("/poses/")).toBe(true);
  });

  it("uses custom base segment for relative and absolute paths", () => {
    const map = buildPoseWeightPathMap([basePose], "robot", {
      baseSegment: "emotions",
    });
    const info = map.get(basePose.id);
    expect(info?.relativePath).toBe("/emotions/pose_one.weight");
    expect(info?.absolutePath).toBe("rig/robot/emotions/pose_one.weight");
  });

  it("includes pose group label when assigned", () => {
    const groupedPose = { ...basePose, group: "happy vibes" };
    const map = buildPoseWeightPathMap([groupedPose], "robot");
    const info = map.get(groupedPose.id);
    expect(info?.relativePath).toBe("/happy_vibes/pose_one.weight");
    expect(info?.absolutePath).toBe("rig/robot/happy_vibes/pose_one.weight");
  });

  it("only deduplicates pose names within the same group", () => {
    const poseA: PoseDefinition = {
      ...basePose,
      id: "pose_a",
      name: "Smile",
      group: "emotions",
    };
    const poseB: PoseDefinition = {
      ...basePose,
      id: "pose_b",
      name: "Smile",
      group: "accents",
    };
    const poseC: PoseDefinition = {
      ...basePose,
      id: "pose_c",
      name: "Smile",
      group: "emotions",
    };
    const map = buildPoseWeightPathMap([poseA, poseB, poseC], "face");
    expect(map.get("pose_a")?.relativePath).toBe("/emotions/smile.weight");
    expect(map.get("pose_b")?.relativePath).toBe("/accents/smile.weight");
    expect(map.get("pose_c")?.relativePath).toBe("/emotions/smile_2.weight");
  });
});

describe("resolveDeterministicPoseId", () => {
  it("preserves valid preferred ids and suffixes collisions deterministically", () => {
    expect(
      resolveDeterministicPoseId({
        preferredId: "pose_keep",
        existingIds: [],
      }),
    ).toBe("pose_keep");
    expect(
      resolveDeterministicPoseId({
        preferredId: "pose_keep",
        existingIds: ["pose_keep"],
      }),
    ).toBe("pose_keep_2");
  });

  it("generates name/group based ids when preferred id is invalid", () => {
    expect(
      resolveDeterministicPoseId({
        preferredId: "invalid id",
        name: "Wide Smile",
        group: "emotion",
      }),
    ).toBe("pose_emotion_wide_smile");
  });
});

describe("normalizePoseDefinitionIds", () => {
  it("normalizes collisions in import order with stable suffixes", () => {
    const basePose: PoseDefinition = {
      id: "pose_base",
      name: "Base Pose",
      description: "",
      group: null,
      values: {},
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const poses: PoseDefinition[] = [
      { ...basePose, id: "pose_keep", name: "Keep" },
      { ...basePose, id: "pose_keep", name: "Keep Again" },
      { ...basePose, id: "bad id", name: "Smile", group: "emotion" },
      { ...basePose, id: "", name: "Smile", group: "emotion" },
    ];

    expect(normalizePoseDefinitionIds(poses).map((pose) => pose.id)).toEqual([
      "pose_keep",
      "pose_keep_2",
      "pose_emotion_smile",
      "pose_emotion_smile_2",
    ]);
  });
});
