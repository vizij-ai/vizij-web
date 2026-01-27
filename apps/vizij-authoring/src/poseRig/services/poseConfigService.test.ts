import { describe, it, expect } from "vitest";
import { POSE_RIG_CONFIG_VERSION } from "../types";
import { PoseConfigService } from "./poseConfigService";

describe("PoseConfigService", () => {
  it("normalizes a valid config", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { a: 0 },
      poses: [],
    };
    const { config } = PoseConfigService.normalize(input);
    expect(config.version).toBe(POSE_RIG_CONFIG_VERSION);
    expect(config.neutralInputs).toEqual({ a: 0 });
    expect(config.poses).toEqual([]);
  });

  it("throws on invalid version", () => {
    const input = {
      version: 999,
      neutralInputs: {},
      poses: [],
    };
    expect(() => PoseConfigService.normalize(input)).toThrow(
      /Unsupported pose rig config version/,
    );
  });

  it("throws on missing poses", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: {},
    };
    expect(() => PoseConfigService.normalize(input)).toThrow(
      /missing pose definitions/,
    );
  });

  it("serializes config correctly", () => {
    const config: any = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { a: 1 },
      poses: [],
      faceId: "test-face",
    };
    const json = PoseConfigService.serialize(config);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(config);
  });

  it("diffs configs correctly", () => {
    const a: any = { version: 1, poses: [] };
    const b: any = { version: 1, poses: [] };
    expect(PoseConfigService.diff(a, b)).toBe(false); // Assuming JSON stringify equality

    const c: any = { version: 1, poses: [{ id: "1" }] };
    expect(PoseConfigService.diff(a, c)).toBe(true);
  });
});
