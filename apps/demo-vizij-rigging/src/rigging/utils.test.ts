import { describe, expect, it } from "vitest";
import {
  STANDARD_RIG_INPUTS_BY_ID,
  type StandardRigInput,
} from "../low-level/standardRigInputs";
import { captureEmotionPoseSnapshot } from "./utils";

function getInput(id: string): StandardRigInput {
  const input = STANDARD_RIG_INPUTS_BY_ID.get(id);
  if (!input) {
    throw new Error(`Missing standard rig input ${id}`);
  }
  return input;
}

describe("captureEmotionPoseSnapshot", () => {
  it("captures the current rig value clamped to the input range", () => {
    const input = getInput("mouth_pos_x");
    const currentValues = { [input.id]: 0.6 };

    const snapshot = captureEmotionPoseSnapshot({
      inputs: [input],
      currentValues,
    });

    expect(snapshot[input.id]).toBeCloseTo(input.range.max, 6);
  });

  it("omits channels that match the neutral pose", () => {
    const input = getInput("left_eye_pos_y");
    const neutral = input.defaultValue;
    const currentValues = { [input.id]: neutral };

    const snapshot = captureEmotionPoseSnapshot({
      inputs: [input],
      currentValues,
    });

    expect(snapshot[input.id]).toBeCloseTo(neutral, 6);
  });
});
