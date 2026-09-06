import { describe, expect, it } from "vitest";
import {
  ANIMATION_TIMELINE_FPS,
  formatKeyframeTime,
  parseTimeInput,
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

describe("parseTimeInput", () => {
  it("reads a bare number in the mode's own unit", () => {
    expect(parseTimeInput("1.5", "seconds")).toBeCloseTo(1.5, 10);
    expect(parseTimeInput("48", "frames")).toBeCloseTo(48 * FRAME, 10);
  });

  it("round-trips a value the readout printed", () => {
    // `formatKeyframeTime` prints "1.500s" and "48f"; typing either back has
    // to mean the same instant, or the field cannot be used to copy a time.
    expect(
      parseTimeInput(formatKeyframeTime(1.5, "seconds"), "seconds"),
    ).toBeCloseTo(1.5, 10);
    expect(
      parseTimeInput(formatKeyframeTime(48 * FRAME, "frames"), "frames"),
    ).toBeCloseTo(48 * FRAME, 10);
  });

  it("lets an explicit suffix override the current mode", () => {
    expect(parseTimeInput("48f", "seconds")).toBeCloseTo(48 * FRAME, 10);
    expect(parseTimeInput("2s", "frames")).toBeCloseTo(2, 10);
  });

  it("clamps a negative time to zero rather than rejecting it", () => {
    expect(parseTimeInput("-3", "seconds")).toBe(0);
  });

  it("returns null for input it cannot read, leaving the field alone", () => {
    // Snapping the playhead to zero on a typo is worse than ignoring it.
    for (const bad of ["", "  ", "abc", "1.2.3", "1s2", "--4", "NaN", "1e3"]) {
      expect(parseTimeInput(bad, "seconds"), `"${bad}"`).toBeNull();
    }
  });

  it("accepts whitespace around the value and the suffix", () => {
    expect(parseTimeInput("  2.25 s ", "frames")).toBeCloseTo(2.25, 10);
  });
});
