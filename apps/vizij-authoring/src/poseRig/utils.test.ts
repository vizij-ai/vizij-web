import { describe, expect, it } from "vitest";
import {
  buildRigInputPath,
  buildPoseWeightPathMap,
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
});
