import { describe, expect, it } from "vitest";
import { collectInputPathMap } from "../index";

describe("graph input path maps", () => {
  it("aliases pose-control inputs by bare channel id", () => {
    const inputPathMap = collectInputPathMap({
      nodes: [
        {
          id: "input_pose_control_brow_lbrow_inud_value",
          type: "input",
          params: {
            path: "rig/quori_latest/pose/control/brow_lbrow_inud_value",
          },
        },
      ],
    });

    expect(inputPathMap.pose_control_brow_lbrow_inud_value).toBe(
      "rig/quori_latest/pose/control/brow_lbrow_inud_value",
    );
    expect(inputPathMap.brow_lbrow_inud_value).toBe(
      "rig/quori_latest/pose/control/brow_lbrow_inud_value",
    );
  });

  it("prefers direct rig inputs for bare authored channel ids", () => {
    const inputPathMap = collectInputPathMap({
      nodes: [
        {
          id: "input_pose_control_propsrig_mouth_jawud_value",
          type: "input",
          params: {
            path: "rig/quori_latest/pose/control/propsrig_mouth_jawud_value",
          },
        },
        {
          id: "input_direct_propsrig_mouth_jawud_value",
          type: "input",
          params: {
            path: "rig/quori_latest/propsrig/mouth/jawud/value",
          },
        },
      ],
    });

    expect(inputPathMap.pose_control_propsrig_mouth_jawud_value).toBe(
      "rig/quori_latest/pose/control/propsrig_mouth_jawud_value",
    );
    expect(inputPathMap.direct_propsrig_mouth_jawud_value).toBe(
      "rig/quori_latest/propsrig/mouth/jawud/value",
    );
    expect(inputPathMap.propsrig_mouth_jawud_value).toBe(
      "rig/quori_latest/propsrig/mouth/jawud/value",
    );
  });

  it("aliases direct-prefixed inputs by bare channel id", () => {
    const inputPathMap = collectInputPathMap({
      nodes: [
        {
          id: "input_direct_propsrig_ltlid_translation_y",
          type: "input",
          params: {
            path: "rig/quori_latest/propsrig/ltlid/translation/y",
          },
        },
      ],
    });

    expect(inputPathMap.direct_propsrig_ltlid_translation_y).toBe(
      "rig/quori_latest/propsrig/ltlid/translation/y",
    );
    expect(inputPathMap.propsrig_ltlid_translation_y).toBe(
      "rig/quori_latest/propsrig/ltlid/translation/y",
    );
  });
});
