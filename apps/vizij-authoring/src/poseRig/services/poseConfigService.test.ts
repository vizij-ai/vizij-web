import { describe, it, expect } from "vitest";
import { createStandardRigInput } from "@vizij/utils";
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

  it("preserves rigKind during normalize", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      rigKind: "generic" as const,
      neutralInputs: { a: 0 },
      poses: [],
    };
    const { config } = PoseConfigService.normalize(input);
    expect(config.rigKind).toBe("generic");
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

  it("roundtrips rigKind through create -> serialize -> normalize", () => {
    const created = PoseConfigService.create(
      [],
      { a: 0.25 },
      "Test Rig",
      "face_a",
      "generic",
    );
    const serialized = PoseConfigService.serialize(created);
    const parsed = JSON.parse(serialized);
    const { config } = PoseConfigService.normalize(parsed);
    expect(config.rigKind).toBe("generic");
    expect(config.faceId).toBe("face_a");
  });

  it("remaps legacy pose inputs by path/source-id before pruning", () => {
    const standardInputs = [
      createStandardRigInput({
        id: "l_eye_translation_x",
        path: "/l_eye/translation/x",
        sourceId: "legacy_source_eye_x",
        label: "L Eye Translation X",
        group: "l_eye",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      }),
    ];
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: {
        "/l_eye/translation/x": 0.15,
        missing_neutral: 0.25,
      },
      poses: [
        {
          id: "pose_1",
          name: "Legacy Pose",
          values: {
            legacy_source_eye_x: 0.8,
            missing_input: 0.3,
          },
        },
      ],
    };

    const { config, warnings } = PoseConfigService.normalize(
      input,
      standardInputs,
      null,
    );

    expect(config.neutralInputs).toEqual({ l_eye_translation_x: 0.15 });
    expect(config.poses[0]?.values).toEqual({ l_eye_translation_x: 0.8 });
    expect(
      warnings.some((warning) =>
        warning.includes('Neutral input "/l_eye/translation/x" remapped'),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes(
          'Pose "Legacy Pose" input "legacy_source_eye_x" remapped',
        ),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes(
          'Pose "Legacy Pose" references missing input "missing_input" and was pruned.',
        ),
      ),
    ).toBe(true);
  });
});
