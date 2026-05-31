import { describe, it, expect } from "vitest";
import { PoseSnapshotService } from "../utils/poseRigSnapshotService";

describe("PoseSnapshotService", () => {
  it("creates deterministic pose ids with stable suffixes", () => {
    const pose = PoseSnapshotService.createPoseDefinition("Smile", "emotion", {
      existingIds: ["pose_smile"],
    });
    expect(pose.id).toBe("pose_smile_2");
  });

  it("captures pose correctly", () => {
    const current = { a: 1, b: 0.5 };
    const neutral = { a: 0, b: 0 };
    const pose = PoseSnapshotService.capture(current, neutral, {
      name: "Test",
    });
    expect(pose.values).toEqual({ a: 1, b: 0.5 });
    expect(pose.name).toBe("Test");
  });

  it("ignores neutral values within epsilon", () => {
    const current = { a: 1e-9, b: 0.5 };
    const neutral = { a: 0, b: 0 };
    const pose = PoseSnapshotService.capture(current, neutral);
    expect(pose.values).toEqual({ b: 0.5 }); // a is effectively 0
  });

  it("applies pose correctly", () => {
    const pose: any = { values: { a: 1 } };
    const neutral = { a: 0, b: 0 };
    const result = PoseSnapshotService.apply(pose, neutral);
    expect(result).toEqual({ a: 1, b: 0 });
  });
});
