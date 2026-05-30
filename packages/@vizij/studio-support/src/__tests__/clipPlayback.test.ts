import { describe, expect, it } from "vitest";
import {
  advanceClipTime,
  clampAnimationTime,
  resolveClipDurationSeconds,
  sampleClipAtTime,
  sampleTrackAtTime,
} from "../index";

describe("Studio clip playback helpers", () => {
  it("samples linear, step, and cubic tracks with Studio-compatible timing", () => {
    expect(
      sampleTrackAtTime(
        {
          channel: "jaw/open",
          interpolation: "linear",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 10 },
          ],
        },
        0.25,
      ),
    ).toBeCloseTo(2.5, 6);

    expect(
      sampleTrackAtTime(
        {
          channel: "jaw/open",
          interpolation: "step",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 10 },
          ],
        },
        0.75,
      ),
    ).toBe(0);

    expect(
      sampleTrackAtTime(
        {
          channel: "jaw/open",
          interpolation: "cubic",
          keyframes: [
            { time: 0, value: 0, outTangent: 2 },
            { time: 1, value: 1, inTangent: 0 },
          ],
        },
        0.5,
      ),
    ).toBeCloseTo(0.75, 6);
  });

  it("samples clips onto animation input paths with weight applied", () => {
    expect(
      sampleClipAtTime(
        "authoring.timeline.main",
        {
          tracks: [
            {
              channel: "/controls/jaw/open",
              keyframes: [
                { time: 0, value: 0 },
                { time: 1, value: 4 },
              ],
            },
          ],
        },
        0.5,
        0.25,
      ),
    ).toEqual([
      {
        path: "animation/authoring.timeline.main/controls/jaw/open",
        value: 0.5,
      },
    ]);
  });

  it("clamps and samples deterministic seek times", () => {
    const clip = {
      id: "clip",
      duration: 2,
      tracks: [
        {
          channel: "jaw",
          interpolation: "step" as const,
          keyframes: [
            { time: 0, value: 0.2 },
            { time: 1, value: 0.8 },
            { time: 2, value: 1.2 },
          ],
        },
      ],
    };

    const duration = resolveClipDurationSeconds(clip);
    const firstMidSample = sampleClipAtTime(
      "clip",
      clip,
      clampAnimationTime(1, duration),
    );
    const secondMidSample = sampleClipAtTime(
      "clip",
      clip,
      clampAnimationTime(1, duration),
    );

    expect(firstMidSample).toEqual(secondMidSample);
    expect(firstMidSample[0]).toEqual({
      path: "animation/clip/jaw",
      value: 0.8,
    });
    expect(
      sampleClipAtTime("clip", clip, clampAnimationTime(99, duration))[0],
    ).toEqual({ path: "animation/clip/jaw", value: 1.2 });
    expect(
      sampleClipAtTime("clip", clip, clampAnimationTime(-4, duration))[0],
    ).toEqual({ path: "animation/clip/jaw", value: 0.2 });
  });

  it("derives duration and transport time consistently", () => {
    const duration = resolveClipDurationSeconds({
      tracks: [
        {
          channel: "a",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1.25, value: 1 },
          ],
        },
      ],
    });

    expect(duration).toBe(1.25);
    expect(
      advanceClipTime(
        { time: 1, duration, speed: 1, loop: false, playing: true },
        0.5,
      ),
    ).toEqual({ time: 1.25, completed: true });
    expect(
      advanceClipTime(
        { time: 1, duration, speed: 1, loop: true, playing: true },
        0.5,
      ),
    ).toEqual({ time: 0.25, completed: false });
  });
});
