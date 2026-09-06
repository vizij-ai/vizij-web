import { describe, expect, it } from "vitest";
import {
  ANIMATION_TIMELINE_FPS,
  formatKeyframeTime,
  snapTimeToFrame,
} from "../animationTimeDisplay";

const FRAME = 1 / ANIMATION_TIMELINE_FPS;

describe("snapTimeToFrame", () => {
  it("leaves time continuous in seconds mode", () => {
    expect(snapTimeToFrame(2.568475, "seconds")).toBe(2.568475);
  });

  it("lands a scrubbed time exactly on a frame in frames mode", () => {
    // The bug this closes: scrubbing stored 2.568475s, which is frame 82.19,
    // while the ruler read "82f".
    const snapped = snapTimeToFrame(2.568475, "frames");
    expect(snapped).toBeCloseTo(82 * FRAME, 10);
    expect(Math.abs(snapped * ANIMATION_TIMELINE_FPS - 82)).toBeLessThan(1e-9);
  });

  it("stops two times that share a label from holding different values", () => {
    // 3.9940s is frame 127.8 and 4.0100s is frame 128.3; both displayed as
    // "128f" while sitting 0.016s apart, so a lid and its eye could silently
    // desync while the UI insisted they were on the same frame.
    expect(formatKeyframeTime(3.994, "frames")).toBe("128f");
    expect(formatKeyframeTime(4.01, "frames")).toBe("128f");

    const a = snapTimeToFrame(3.994, "frames");
    const b = snapTimeToFrame(4.01, "frames");
    expect(a).toBe(b);
    expect(a).toBeCloseTo(128 * FRAME, 10);
  });

  it("never returns a negative time", () => {
    expect(snapTimeToFrame(-1, "frames")).toBe(0);
  });

  it("treats a non-finite time as zero rather than propagating NaN", () => {
    expect(snapTimeToFrame(Number.NaN, "frames")).toBe(0);
    expect(snapTimeToFrame(Number.POSITIVE_INFINITY, "frames")).toBe(0);
  });

  it("is idempotent, so re-snapping never drifts", () => {
    const once = snapTimeToFrame(1.2345, "frames");
    expect(snapTimeToFrame(once, "frames")).toBe(once);
  });
});
