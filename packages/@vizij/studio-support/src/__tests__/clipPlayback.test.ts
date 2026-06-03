import { describe, expect, it } from "vitest";
import {
  advanceClipTime,
  clampAnimationTime,
  resolveClipDurationSeconds,
  sampleClipAtTime,
  sampleTrackAtTime,
} from "../index";

describe("Studio clip playback helpers", () => {
  it("samples linear, step, cubic, and spline tracks with Studio-compatible timing", () => {
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

    const stepSample = sampleTrackAtTime(
      {
        channel: "jaw/open",
        interpolation: "step",
        keyframes: [
          {
            time: 0,
            value: 0,
            outHandle: { x: 0.65, y: 4 },
            outTangent: 9,
          },
          {
            time: 1,
            value: 10,
            inHandle: { x: -0.65, y: -4 },
            inTangent: 9,
          },
        ],
      },
      0.75,
    );
    expect(stepSample).toBeGreaterThan(0);
    expect(stepSample).toBeLessThan(1);

    const cubicQuarter = sampleTrackAtTime(
      {
        channel: "jaw/open",
        interpolation: "cubic",
        keyframes: [
          {
            time: 0,
            value: 0,
            outHandle: { x: 0.1, y: 1 },
            outTangent: 12,
          },
          {
            time: 1,
            value: 1,
            inHandle: { x: -0.1, y: -1 },
            inTangent: 12,
          },
        ],
      },
      0.25,
    );
    expect(cubicQuarter).toBeGreaterThan(0);
    expect(cubicQuarter).toBeLessThan(0.25);
    expect(
      sampleTrackAtTime(
        {
          channel: "jaw/open",
          interpolation: "cubic",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
        },
        0.5,
      ),
    ).toBeCloseTo(0.5, 6);

    const splineQuarter = sampleTrackAtTime(
      {
        channel: "jaw/open",
        interpolation: "spline",
        keyframes: [
          { time: 0, value: 0, outHandle: { x: 0.65, y: 0 } },
          { time: 1, value: 1, inHandle: { x: -0.65, y: 0 } },
        ],
      },
      0.25,
    );
    expect(splineQuarter).toBeGreaterThan(0);
    expect(splineQuarter).toBeLessThan(0.25);

    const overriddenSplineQuarter = sampleTrackAtTime(
      {
        channel: "jaw/open",
        interpolation: "linear",
        keyframes: [
          {
            time: 0,
            value: 0,
            interpolation: "spline",
            outHandle: { x: 0.65, y: 0 },
          },
          { time: 1, value: 1, inHandle: { x: -0.65, y: 0 } },
        ],
      },
      0.25,
    );
    expect(overriddenSplineQuarter).toBeCloseTo(splineQuarter, 6);
  });

  it("samples clips onto animation input paths with weight applied", () => {
    const samples = sampleClipAtTime(
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
    );

    expect(samples[0]?.path).toBe(
      "animation/authoring.timeline.main/controls/jaw/open",
    );
    expect(samples[0]?.value).toBeCloseTo(0.5, 6);
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
