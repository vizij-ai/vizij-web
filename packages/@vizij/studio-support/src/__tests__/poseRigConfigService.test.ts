import { describe, it, expect } from "vitest";
import { createStandardRigInput } from "@vizij/utils";
import { POSE_RIG_CONFIG_VERSION } from "../types/poseRig";
import { PoseConfigService } from "../utils/poseRigConfigService";

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

  it("accepts face-default neutral mode without explicit neutral inputs", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralMode: "face-default" as const,
      poses: [],
    };
    const { config } = PoseConfigService.normalize(input);
    expect(config.neutralMode).toBe("face-default");
    expect(config.neutralInputs).toEqual({});
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

  it("persists explicit neutral mode through create and normalize", () => {
    const created = PoseConfigService.create(
      [],
      { a: 0.25 },
      "Test Rig",
      "face_a",
      "generic",
      undefined,
      {
        neutralMode: "explicit",
      },
    );
    expect(created.neutralMode).toBe("explicit");
    const { config } = PoseConfigService.normalize(created);
    expect(config.neutralMode).toBe("explicit");
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

  it("normalizes pose compose modes and prunes entries without matching targets", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { smile: 0, brow_raise: 0 },
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          values: { smile: 0.8 },
          composeModes: {
            smile: "bad_mode",
            brow_raise: "average",
          },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config, warnings } = PoseConfigService.normalize(input);
    expect(config.poses[0]?.values).toEqual({ smile: 0.8 });
    expect(config.poses[0]?.composeModes).toEqual({ smile: "add" });
    expect(
      warnings.some((warning) =>
        warning.includes(
          'Pose "Smile" compose mode for "smile" value "bad_mode" is invalid; using "add".',
        ),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes(
          'Pose "Smile" compose mode for "brow_raise" was ignored because the pose does not target that channel.',
        ),
      ),
    ).toBe(true);
  });

  it("preserves pose compose modes through create -> normalize", () => {
    const created = PoseConfigService.create(
      [
        {
          id: "pose_smile",
          name: "Smile",
          values: { smile: 0.8, brow_raise: 0.25 },
          composeModes: { brow_raise: "add", smile: "average" },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      { smile: 0, brow_raise: 0 },
      "Test",
      "face",
      "face-specific",
    );

    expect(created.poses[0]?.composeModes).toEqual({
      brow_raise: "add",
      smile: "average",
    });

    const { config } = PoseConfigService.normalize(created);
    expect(config.poses[0]?.composeModes).toEqual({
      brow_raise: "add",
      smile: "average",
    });
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
      groupIds: ["emotion"],
    });
  });

  it("normalizes blend stages and warns on malformed sources", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { smile: 0 },
      crossGroupBlendMode: "additive" as const,
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
      blendStages: [
        {
          id: "stage_base",
          mode: "average" as const,
          sources: [
            { kind: "group" as const, id: "emotion" },
            { kind: "group" as const, id: "viseme" },
          ],
        },
        {
          id: "stage_final",
          mode: "invalid_mode",
          sources: [
            { kind: "group", id: "unknown_group" },
            { kind: "stage", id: "stage_base" },
            { kind: "stage", id: "stage_base" },
          ],
        },
      ],
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          values: { smile: 0.5 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config, warnings } = PoseConfigService.normalize(input);
    expect(config.blendStages).toEqual([
      {
        id: "stage_base",
        name: undefined,
        mode: "average",
        sources: [
          { kind: "group", id: "emotion" },
          { kind: "group", id: "viseme" },
        ],
      },
      {
        id: "stage_final",
        name: undefined,
        mode: "add",
        sources: [{ kind: "stage", id: "stage_base" }],
      },
    ]);
    expect(
      warnings.some((warning) =>
        warning.includes('Blend stage "stage_final" mode "invalid_mode"'),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes('source group "unknown_group"'),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes('source "stage:stage_base" is duplicated'),
      ),
    ).toBe(true);
  });

  it("retains scoped neutral definitions for groups and blend stages", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { smile: 0, brow: 0 },
      crossGroupBlendMode: "average" as const,
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          neutral: {
            sourceType: "pose-reference" as const,
            poseId: "pose_smile",
          },
        },
        {
          id: "viseme",
          name: "Viseme",
          path: "viseme",
          neutral: {
            sourceType: "direct-values" as const,
            values: { smile: 0.25, brow: -0.1 },
          },
        },
      ],
      blendStages: [
        {
          id: "stage_base",
          mode: "average" as const,
          neutral: {
            sourceType: "inherit" as const,
          },
          sources: [
            { kind: "group" as const, id: "emotion" },
            { kind: "group" as const, id: "viseme" },
          ],
        },
      ],
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config } = PoseConfigService.normalize(input);
    expect(config.poseGroups).toEqual([
      {
        id: "emotion",
        name: "Emotion",
        path: "emotion",
        blendMode: "average",
        neutral: {
          sourceType: "pose-reference",
          poseId: "pose_smile",
        },
      },
      {
        id: "viseme",
        name: "Viseme",
        path: "viseme",
        blendMode: "average",
        neutral: {
          sourceType: "direct-values",
          values: { smile: 0.25, brow: -0.1 },
        },
      },
    ]);
    expect(config.blendStages).toEqual([
      {
        id: "stage_base",
        name: undefined,
        mode: "average",
        neutral: {
          sourceType: "inherit",
        },
        sources: [
          { kind: "group", id: "emotion" },
          { kind: "group", id: "viseme" },
        ],
      },
    ]);
  });

  it("warns and drops malformed scoped neutral payloads", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { smile: 0 },
      poseGroups: [
        {
          id: "emotion",
          name: "Emotion",
          path: "emotion",
          neutral: {
            sourceType: "pose-reference",
            poseId: "unknown_pose",
          },
        },
        {
          id: "viseme",
          name: "Viseme",
          path: "viseme",
          neutral: {
            sourceType: "direct-values",
            values: "not-a-map",
          },
        },
      ],
      blendStages: [
        {
          id: "stage_base",
          mode: "average",
          neutral: {
            sourceType: "bogus",
          },
          sources: [{ kind: "group", id: "emotion" }],
        },
      ],
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          values: { smile: 0.7 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    } as any;

    const { config, warnings } = PoseConfigService.normalize(input);
    expect(config.poseGroups).toEqual([
      {
        id: "emotion",
        name: "Emotion",
        path: "emotion",
        blendMode: "average",
      },
      {
        id: "viseme",
        name: "Viseme",
        path: "viseme",
        blendMode: "average",
      },
    ]);
    expect(config.blendStages).toEqual([
      {
        id: "stage_base",
        name: undefined,
        mode: "average",
        sources: [{ kind: "group", id: "emotion" }],
      },
    ]);
    expect(
      warnings.some((warning) =>
        warning.includes(
          'neutral at "poseGroups[0].neutral" references unknown pose',
        ),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes(
          'neutral at "poseGroups[1].neutral" direct values are invalid',
        ),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes(
          'neutral at "blendStages[0].neutral" has invalid source type',
        ),
      ),
    ).toBe(true);
  });

  it("normalizes cross-group channel overrides and preserves deterministic ordering", () => {
    const standardInputs = [
      createStandardRigInput({
        id: "mouth_open",
        path: "/mouth/open",
        sourceId: "legacy_mouth_open",
        label: "Mouth Open",
        group: "mouth",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      }),
      createStandardRigInput({
        id: "brow_raise",
        path: "/brow/raise",
        sourceId: "legacy_brow_raise",
        label: "Brow Raise",
        group: "brow",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      }),
    ];
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      crossGroupBlendMode: "average" as const,
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
      crossGroupChannelOverrides: {
        "/mouth/open": {
          mode: "priority" as const,
          priorityOrder: ["viseme", "emotion"],
          tieBreak: "group-id" as const,
        },
        brow_raise: {
          mode: "additive" as const,
        },
      },
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          values: { mouth_open: 0.5, brow_raise: 0.2 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config, warnings } = PoseConfigService.normalize(
      input,
      standardInputs,
    );
    expect(config.crossGroupChannelOverrides).toEqual({
      brow_raise: {
        mode: "additive",
        tieBreak: "group-order",
      },
      mouth_open: {
        mode: "priority",
        priorityOrder: ["viseme", "emotion"],
        tieBreak: "group-id",
      },
    });
    expect(
      warnings.some((warning) =>
        warning.includes('Cross-group channel override "/mouth/open" remapped'),
      ),
    ).toBe(true);
  });

  it("drops invalid cross-group channel overrides with warnings", () => {
    const standardInputs = [
      createStandardRigInput({
        id: "mouth_open",
        path: "/mouth/open",
        sourceId: "legacy_mouth_open",
        label: "Mouth Open",
        group: "mouth",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      }),
      createStandardRigInput({
        id: "brow_raise",
        path: "/brow/raise",
        sourceId: "legacy_brow_raise",
        label: "Brow Raise",
        group: "brow",
        defaultValue: 0,
        range: { min: -1, max: 1 },
      }),
    ];
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { mouth_open: 0, brow_raise: 0 },
      crossGroupBlendMode: "additive" as const,
      poseGroups: [
        { id: "emotion", name: "Emotion", path: "emotion" },
        { id: "viseme", name: "Viseme", path: "viseme" },
      ],
      crossGroupChannelOverrides: {
        mouth_open: {
          mode: "priority" as const,
          priorityOrder: ["unknown_group", "emotion", "emotion"],
          tieBreak: "bad-tie-break",
        },
        brow_raise: {
          mode: "invalid_mode",
          priorityOrder: ["emotion"],
        },
        unknown_input: {
          mode: "priority" as const,
        },
        malformed_entry: "bad",
      },
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          groupIds: ["emotion"],
          values: { mouth_open: 0.5, brow_raise: 0.2 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config, warnings } = PoseConfigService.normalize(
      input,
      standardInputs,
    );
    expect(config.crossGroupChannelOverrides).toEqual({
      brow_raise: {
        mode: "additive",
        tieBreak: "group-order",
      },
      mouth_open: {
        mode: "priority",
        priorityOrder: ["emotion"],
        tieBreak: "group-order",
      },
    });
    expect(
      warnings.some((warning) =>
        warning.includes(
          'Cross-group channel override "unknown_input" references missing input',
        ),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes('Cross-group channel override "brow_raise" mode'),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes('priority group "unknown_group"'),
      ),
    ).toBe(true);
    expect(
      warnings.some((warning) =>
        warning.includes('mode "additive" does not use it'),
      ),
    ).toBe(true);
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
      groupIds: ["emotion"],
    });
  });

  it("normalizes shared pose memberships to deterministic configured-group order", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { smile: 0 },
      poseGroups: [
        { id: "emotion_main", name: "Emotion Main", path: "emotion/main" },
        { id: "viseme_main", name: "Viseme Main", path: "viseme/main" },
      ],
      poses: [
        {
          id: "pose_shared",
          name: "Shared",
          group: "viseme/main",
          groupId: "viseme_main",
          groupIds: ["viseme_main", "emotion_main"],
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config } = PoseConfigService.normalize(input);
    expect(config.poses[0]).toMatchObject({
      group: "emotion/main",
      groupId: "emotion_main",
      groupIds: ["emotion_main", "viseme_main"],
    });
  });

  it("round-trips many-to-many memberships through serialize/normalize deterministically", () => {
    const initialConfig = {
      version: POSE_RIG_CONFIG_VERSION,
      faceId: "face_a",
      rigKind: "face-specific" as const,
      neutralInputs: { smile: 0 },
      poseGroups: [
        { id: "emotion_main", name: "Emotion Main", path: "emotion/main" },
        { id: "viseme_main", name: "Viseme Main", path: "viseme/main" },
      ],
      crossGroupBlendMode: "additive" as const,
      poses: [
        {
          id: "pose_shared",
          name: "Shared",
          group: "viseme/main",
          groupId: "viseme_main",
          groupIds: ["viseme_main", "emotion_main"],
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
      metadata: {
        createdAt: "now",
        updatedAt: "now",
      },
    };

    const first = PoseConfigService.normalize(initialConfig).config;
    const firstSerialized = PoseConfigService.serialize(first);
    const second = PoseConfigService.normalize(
      JSON.parse(firstSerialized),
    ).config;
    const secondSerialized = PoseConfigService.serialize(second);

    expect(second.poses[0]).toMatchObject({
      group: "emotion/main",
      groupId: "emotion_main",
      groupIds: ["emotion_main", "viseme_main"],
    });
    expect(JSON.parse(secondSerialized)).toEqual(JSON.parse(firstSerialized));
  });

  it("migrates legacy single-group pose fields into canonical groupIds", () => {
    const input = {
      version: POSE_RIG_CONFIG_VERSION,
      neutralInputs: { smile: 0 },
      poseGroups: [{ id: "emotion", name: "Emotion", path: "emotion" }],
      poses: [
        {
          id: "pose_smile",
          name: "Smile",
          group: "emotion",
          values: { smile: 0.8 },
          createdAt: "now",
          updatedAt: "now",
        },
      ],
    };

    const { config } = PoseConfigService.normalize(input);
    expect(config.poses[0]).toMatchObject({
      id: "pose_smile",
      group: "emotion",
      groupId: "emotion",
      groupIds: ["emotion"],
      values: { smile: 0.8 },
    });
  });
});
