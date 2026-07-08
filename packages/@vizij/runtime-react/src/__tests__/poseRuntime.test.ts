import { describe, expect, it } from "vitest";
import {
  resolvePoseControlInputPath,
  shouldUseLegacyPoseWeightFallback,
} from "../utils/poseRuntime";

describe("poseRuntime", () => {
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
});
