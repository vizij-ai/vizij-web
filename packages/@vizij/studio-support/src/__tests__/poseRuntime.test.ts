import { describe, expect, it } from "vitest";
import {
  buildLegacyPoseWeightFallbackMap,
  planPoseControlBridgeWrite,
  resolvePoseControlInputPath,
  resolveLegacyPoseWeightControlWrites,
  shouldUseLegacyPoseWeightFallback,
  type PoseControlBridgeState,
} from "../index";

describe("studio support pose runtime", () => {
  it("uses exported pose-driver graphs instead of the legacy pose fallback", () => {
    expect(shouldUseLegacyPoseWeightFallback(true)).toBe(false);
    expect(shouldUseLegacyPoseWeightFallback(false)).toBe(true);
  });

  it("resolves exact rig input ids first", () => {
    expect(
      resolvePoseControlInputPath({
        inputId: "propsrig_mouth_jawud_value",
        basePath: "rig/quori_latest/pose/control/propsrig_mouth_jawud_value",
        rigInputPathMap: {
          propsrig_mouth_jawud_value:
            "rig/quori_latest/propsrig/mouth/jawud/value",
        },
        hasNativePoseControlInput: true,
      }),
    ).toBe("rig/quori_latest/propsrig/mouth/jawud/value");
  });

  it("falls back to pose_control aliases when present", () => {
    expect(
      resolvePoseControlInputPath({
        inputId: "propsrig_mouth_translation_y",
        basePath:
          "rig/hugo_latest_blender_export/pose/control/propsrig_mouth_translation_y",
        rigInputPathMap: {
          pose_control_propsrig_mouth_translation_y:
            "rig/hugo_latest_blender_export/pose/control/propsrig_mouth_translation_y",
        },
        hasNativePoseControlInput: true,
      }),
    ).toBe(
      "rig/hugo_latest_blender_export/pose/control/propsrig_mouth_translation_y",
    );
  });

  it("supports direct-prefixed legacy rig inputs", () => {
    expect(
      resolvePoseControlInputPath({
        inputId: "propsrig_ltlid_translation_y",
        basePath: "rig/quori_latest/pose/control/propsrig_ltlid_translation_y",
        rigInputPathMap: {
          direct_propsrig_ltlid_translation_y:
            "rig/quori_latest/propsrig/ltlid/translation/y",
        },
        hasNativePoseControlInput: false,
      }),
    ).toBe("rig/quori_latest/propsrig/ltlid/translation/y");
  });

  it("uses the native pose-control input as a last resort", () => {
    expect(
      resolvePoseControlInputPath({
        inputId: "propsrig_mouth_translation_y",
        basePath:
          "rig/hugo_latest_blender_export/pose/control/propsrig_mouth_translation_y",
        rigInputPathMap: {},
        hasNativePoseControlInput: true,
      }),
    ).toBe(
      "rig/hugo_latest_blender_export/pose/control/propsrig_mouth_translation_y",
    );
  });

  it("plans pose-control frame output bridge writes through rig aliases", () => {
    const state: PoseControlBridgeState = { previousValues: new Map() };

    expect(
      planPoseControlBridgeWrite({
        basePath: "rig/quori_latest/pose/control/happy",
        rawValue: 0.75,
        namespace: "demo-face",
        rigInputPathMap: {
          happy: "rig/quori_latest/mouth/smile",
        },
        rigPoseControlInputIds: new Set(["happy"]),
        state,
      }),
    ).toEqual({
      path: "rig/quori_latest/mouth/smile",
      value: { float: 0.75 },
    });

    expect(
      planPoseControlBridgeWrite({
        basePath: "rig/quori_latest/pose/control/happy",
        rawValue: 0.75,
        namespace: "demo-face",
        rigInputPathMap: {
          happy: "rig/quori_latest/mouth/smile",
        },
        rigPoseControlInputIds: new Set(["happy"]),
        state,
      }),
    ).toBeNull();
  });

  it("builds legacy pose-weight fallback values from pose config", () => {
    const fallbackMap = buildLegacyPoseWeightFallbackMap({
      poseConfig: {
        faceId: "robot",
        poses: [
          {
            id: "smile",
            values: {
              mouth_smile: 0.8,
              ignored_nan: Number.NaN,
              ignored_missing: undefined,
            },
          },
        ],
      },
    });

    expect(fallbackMap.get("rig/robot/poses/smile.weight")).toEqual({
      mouth_smile: 0.8,
    });
  });

  it("resolves legacy pose-weight writes through rig aliases", () => {
    const fallbackMap = buildLegacyPoseWeightFallbackMap({
      poseConfig: {
        faceId: "robot",
        poses: [
          {
            id: "smile",
            values: {
              mouth_smile: 0.5,
              brow_raise: 0.25,
            },
          },
        ],
      },
    });

    expect(
      resolveLegacyPoseWeightControlWrites({
        enabled: true,
        poseWeightPath: "rig/robot/poses/smile.weight",
        poseWeightValue: 0.6,
        poseWeightFallbackMap: fallbackMap,
        faceId: "robot",
        rigInputPathMap: {
          mouth_smile: "rig/robot/mouth/smile/value",
        },
      }),
    ).toEqual([
      {
        path: "rig/robot/mouth/smile/value",
        value: 0.3,
      },
      {
        path: "rig/robot/pose/control/brow_raise",
        value: 0.15,
      },
    ]);
  });

  it("does not resolve legacy pose-weight writes when fallback is disabled", () => {
    const fallbackMap = buildLegacyPoseWeightFallbackMap({
      poseConfig: {
        faceId: "robot",
        poses: [
          {
            id: "smile",
            values: { mouth_smile: 1 },
          },
        ],
      },
    });

    expect(
      resolveLegacyPoseWeightControlWrites({
        enabled: false,
        poseWeightPath: "rig/robot/poses/smile.weight",
        poseWeightValue: 1,
        poseWeightFallbackMap: fallbackMap,
        faceId: "robot",
        rigInputPathMap: {},
      }),
    ).toEqual([]);
  });
});
