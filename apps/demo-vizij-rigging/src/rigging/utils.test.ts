import { describe, expect, it } from "vitest";
import type { StandardRigInput } from "@vizij/utils";
import { captureEmotionPoseSnapshot } from "./utils";

describe("captureEmotionPoseSnapshot", () => {
  it("captures the current rig value clamped to the input range", () => {
    const input: StandardRigInput = {
      id: "demo_input",
      path: "/demo/input",
      label: "Demo Input",
      group: "demo",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };
    const currentValues = { [input.id]: 0.6 };

    const snapshot = captureEmotionPoseSnapshot({
      inputs: [input],
      currentValues,
    });

    expect(snapshot[input.id]).toBeCloseTo(0.6, 6);
  });

  it("omits channels that match the neutral pose", () => {
    const input: StandardRigInput = {
      id: "demo_input",
      path: "/demo/input",
      label: "Demo Input",
      group: "demo",
      defaultValue: 0.2,
      range: { min: -1, max: 1 },
    };
    const currentValues = { [input.id]: input.defaultValue };

    const snapshot = captureEmotionPoseSnapshot({
      inputs: [input],
      currentValues,
    });

    expect(snapshot[input.id]).toBeCloseTo(input.defaultValue, 6);
  });
});
