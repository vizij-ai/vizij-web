import { describe, expect, it } from "vitest";
import { ANIMATION_STEP_SECONDS, nextStepTime } from "../animationStepMath";
import {
  ANIMATION_TIMELINE_FPS,
  secondsToFrames,
} from "../../utils/animationTimeDisplay";

describe("ANIMATION_STEP_SECONDS", () => {
  it("is exactly one frame of the timeline's own frame rate", () => {
    // The transport defaulted to 1/30 while the ruler is 32fps, so a step
    // never advanced one frame of what the clock displayed.
    expect(ANIMATION_STEP_SECONDS).toBe(1 / ANIMATION_TIMELINE_FPS);
    expect(secondsToFrames(ANIMATION_STEP_SECONDS)).toBe(1);
  });

  it("advances the displayed frame by exactly one, repeatedly", () => {
    let time = 0;
    for (let frame = 1; frame <= 10; frame += 1) {
      time = nextStepTime({
        baseTime: time,
        deltaSeconds: ANIMATION_STEP_SECONDS,
        durationSeconds: 10,
      });
      expect(secondsToFrames(time)).toBe(frame);
    }
  });
});

describe("nextStepTime", () => {
  it("steps backward when given a negative delta", () => {
    // The old implementation clamped the delta with Math.max(0, …), turning
    // every backward step into a forward one — which is why the control was
    // forward-only.
    expect(
      nextStepTime({
        baseTime: 1,
        deltaSeconds: -ANIMATION_STEP_SECONDS,
        durationSeconds: 10,
      }),
    ).toBeCloseTo(1 - ANIMATION_STEP_SECONDS, 10);
  });

  it("clamps to the start rather than going negative", () => {
    expect(
      nextStepTime({ baseTime: 0, deltaSeconds: -1, durationSeconds: 10 }),
    ).toBe(0);
  });

  it("clamps to the clip end", () => {
    expect(
      nextStepTime({ baseTime: 9.9, deltaSeconds: 1, durationSeconds: 10 }),
    ).toBe(10);
  });

  it("treats a non-positive duration as unbounded", () => {
    expect(
      nextStepTime({ baseTime: 5, deltaSeconds: 100, durationSeconds: 0 }),
    ).toBe(105);
  });

  it("survives non-finite input", () => {
    expect(
      nextStepTime({
        baseTime: Number.NaN,
        deltaSeconds: Number.NaN,
        durationSeconds: 10,
      }),
    ).toBe(0);
  });
});
