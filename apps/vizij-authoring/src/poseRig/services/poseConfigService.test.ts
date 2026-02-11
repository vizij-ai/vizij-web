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

  it("warns when multiple legacy keys remap to the same input", () => {
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
        "/l_eye/translation/x": 0.2,
        legacy_source_eye_x: 0.6,
      },
      poses: [
        {
          id: "pose_collision",
          name: "Collision Pose",
          values: {
            "/l_eye/translation/x": 0.4,
            legacy_source_eye_x: 0.9,
          },
        },
      ],
    };

    const { config, warnings } = PoseConfigService.normalize(
      input,
      standardInputs,
      null,
    );

    expect(config.neutralInputs).toEqual({ l_eye_translation_x: 0.6 });
    expect(config.poses[0]?.values).toEqual({ l_eye_translation_x: 0.9 });
    expect(
      warnings.some((warning) =>
        warning.includes(
          'Neutral inputs "/l_eye/translation/x" and "legacy_source_eye_x" both remap to "l_eye_translation_x"',
        ),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes(
          'Pose "Collision Pose" inputs "/l_eye/translation/x" and "legacy_source_eye_x" both remap to "l_eye_translation_x"',
        ),
      ),
    ).toBe(true);
  });

  it("normalizes pose groups and cross-group blend mode", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { smile: 0 },
      poseGroups: [{ id: "emotion", name: "Emotion", path: "emotion" }],
      crossGroupBlendMode: "average" as const,
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          group: "emotion",
          values: { smile: 0.5 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config } = PoseConfigService.normalize(input);
    expect(config.crossGroupBlendMode).toBe("average");
    expect(config.poseGroups).toEqual([
      {
        id: "emotion",
        name: "Emotion",
        path: "emotion",
        blendMode: "average",
      },
    ]);
    expect(config.poses[0]).toMatchObject({
      group: "emotion",
      groupId: "emotion",
    });
  });

  it("creates grouped config defaults with explicit strategies", () => {
    const created = PoseConfigService.create(
      [
        {
          id: "pose_smile",
          name: "Smile",
          group: "emotion",
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      { smile: 0 },
      "Pose Rig",
      "face_a",
      "face-specific",
      undefined,
      {
        defaultGroupBlendMode: "additive",
        crossGroupBlendMode: "average",
      },
    );

    expect(created.poseGroups).toEqual([
      {
        id: "emotion",
        name: "Emotion",
        path: "emotion",
        blendMode: "additive",
      },
    ]);
    expect(created.crossGroupBlendMode).toBe("average");
    expect(created.poses[0]).toMatchObject({
      group: "emotion",
      groupId: "emotion",
    });
  });
});
