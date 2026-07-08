import { describe, expect, it } from "vitest";
import type { AnimationClipLike, AnimationTrackLike } from "../types";
import {
  advanceClipTime,
  clampAnimationTime,
  resolveClipDurationSeconds,
  sampleClipAtTime,
  sampleTrackAtTime,
} from "../utils/clipPlayback";

describe("clip playback sampling", () => {
  it("supports step interpolation", () => {
    const track: AnimationTrackLike = {
      channel: "jaw",
      interpolation: "step",
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ],
    };

    expect(sampleTrackAtTime(track, 0.25)).toBe(0);
    expect(sampleTrackAtTime(track, 0.999)).toBe(0);
    expect(sampleTrackAtTime(track, 1)).toBe(1);
  });

  it("supports cubic interpolation with explicit tangents", () => {
    const track: AnimationTrackLike = {
      channel: "jaw",
      interpolation: "cubic",
      keyframes: [
        { time: 0, value: 0, outTangent: 2 },
        { time: 1, value: 1, inTangent: 0 },
      ],
    };

    expect(sampleTrackAtTime(track, 0.5)).toBeCloseTo(0.75, 6);
  });

  it("falls back to slope tangents for cubic interpolation", () => {
    const track: AnimationTrackLike = {
      channel: "jaw",
      interpolation: "cubic",
      keyframes: [
        { time: 0, value: 0 },
        { time: 2, value: 10 },
      ],
    };

    expect(sampleTrackAtTime(track, 1)).toBeCloseTo(5, 6);
  });

  it("seeks deterministically at exact times", () => {
    const clip: AnimationClipLike = {
      id: "clip",
      duration: 2,
      tracks: [
        {
          channel: "jaw",
          interpolation: "step",
          keyframes: [
            { time: 0, value: 0.2 },
            { time: 1, value: 0.8 },
            { time: 2, value: 1.2 },
          ],
        },
      ],
    };

    const duration = resolveClipDurationSeconds(clip);
    const midSeek = clampAnimationTime(1, duration);
    const upperSeek = clampAnimationTime(99, duration);
    const lowerSeek = clampAnimationTime(-4, duration);

    const firstMidSample = sampleClipAtTime("clip", clip, midSeek);
    const secondMidSample = sampleClipAtTime("clip", clip, midSeek);
    const upperSample = sampleClipAtTime("clip", clip, upperSeek);
    const lowerSample = sampleClipAtTime("clip", clip, lowerSeek);

    expect(firstMidSample).toEqual(secondMidSample);
    expect(firstMidSample[0]).toEqual({
      path: "animation/clip/jaw",
      value: 0.8,
    });
    expect(upperSample[0]).toEqual({ path: "animation/clip/jaw", value: 1.2 });
    expect(lowerSample[0]).toEqual({ path: "animation/clip/jaw", value: 0.2 });
  });

  it("preserves paused time and wraps looped playback", () => {
    expect(
      advanceClipTime(
        {
          time: 0.35,
          duration: 1,
          speed: 1,
          loop: false,
          playing: false,
        },
        0.5,
      ),
    ).toEqual({ time: 0.35, completed: false });

    const looped = advanceClipTime(
      {
        time: 0.9,
        duration: 1,
        speed: 1,
        loop: true,
        playing: true,
      },
      0.35,
    );
    expect(looped.completed).toBe(false);
    expect(looped.time).toBeCloseTo(0.25, 6);
  });
});
