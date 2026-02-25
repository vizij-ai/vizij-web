import { describe, expect, it } from "vitest";
import {
  buildPoseControlRelativePath,
  buildPoseWeightInputSourceId,
  buildPoseWeightRelativePath,
  buildRigInputPath,
  buildPoseWeightPathMap,
  isPoseControlInputPath,
  isPoseWeightInputPath,
  parsePoseControlInputIdFromPath,
  parsePoseWeightInputSourceId,
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

  it("uses canonical /poses/{poseId}.weight paths", () => {
    const map = buildPoseWeightPathMap([basePose], "robot");
    const info = map.get(basePose.id);
    expect(info?.relativePath).toBe("/poses/pose_one.weight");
    expect(info?.absolutePath).toBe("rig/robot/poses/pose_one.weight");
  });

  it("is independent of group path metadata", () => {
    const groupedPose = { ...basePose, group: "happy vibes" };
    const map = buildPoseWeightPathMap([groupedPose], "robot");
    const info = map.get(basePose.id);
    expect(info?.relativePath).toBe("/poses/pose_one.weight");
    expect(info?.absolutePath).toBe("rig/robot/poses/pose_one.weight");
  });

  it("keys path segments by pose id and keeps ids distinct across groups", () => {
    const poseA: PoseDefinition = {
      ...basePose,
      id: "pose-a",
      name: "Smile",
      group: "emotions",
    };
    const poseB: PoseDefinition = {
      ...basePose,
      id: "pose_a",
      name: "Smile",
      group: "accents",
    };
    const map = buildPoseWeightPathMap([poseA, poseB], "face");
    expect(map.get("pose-a")?.relativePath).toBe("/poses/pose-a.weight");
    expect(map.get("pose_a")?.relativePath).toBe("/poses/pose_a.weight");
  });
});

describe("pose weight input helpers", () => {
  it("builds canonical relative path and detects pose-weight inputs", () => {
    const relativePath = buildPoseWeightRelativePath("pose_smile");
    expect(relativePath).toBe("/poses/pose_smile.weight");
    expect(isPoseWeightInputPath(relativePath)).toBe(true);
    expect(isPoseWeightInputPath("rig/robot/poses/pose_smile.weight")).toBe(
      true,
    );
    expect(isPoseWeightInputPath("/propsrig/mouth/smile")).toBe(false);
  });

  it("round-trips pose ids through source ids", () => {
    const sourceId = buildPoseWeightInputSourceId("pose_smile");
    expect(sourceId).toBe("pose-weight:pose_smile");
    expect(parsePoseWeightInputSourceId(sourceId)).toBe("pose_smile");
    expect(parsePoseWeightInputSourceId("custom:pose_smile")).toBeNull();
  });
});

describe("pose control input helpers", () => {
  it("builds canonical relative paths keyed by input id", () => {
    expect(buildPoseControlRelativePath("jaw_open")).toBe(
      "/pose/control/jaw_open",
    );
    expect(isPoseControlInputPath("/pose/control/jaw_open")).toBe(true);
    expect(isPoseControlInputPath("rig/face/pose/control/jaw_open")).toBe(true);
    expect(isPoseControlInputPath("/propsrig/jaw/open")).toBe(false);
  });

  it("parses input ids from pose control paths", () => {
    expect(parsePoseControlInputIdFromPath("/pose/control/jaw_open")).toBe(
      "jaw_open",
    );
    expect(
      parsePoseControlInputIdFromPath("rig/face/pose/control/jaw_open"),
    ).toBe("jaw_open");
    expect(parsePoseControlInputIdFromPath("/propsrig/jaw/open")).toBeNull();
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

  it("generates name-based ids when preferred id is invalid", () => {
    expect(
      resolveDeterministicPoseId({
        preferredId: "invalid id",
        name: "Wide Smile",
        group: "emotion",
      }),
    ).toBe("pose_wide_smile");
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
      "pose_smile",
      "pose_smile_2",
    ]);
  });
});
