import { describe, expect, it } from "vitest";
import type {
  AnimationClipIR,
  AnimationTrackIR,
} from "../../types/animationClipIr";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  LEGACY_AUTHORED_TIMELINE_CLIP_ID,
} from "../../types/animationClipIr";
import {
  bundleAnimationEntryToClipIr,
  clipIrToBundleAnimationEntry,
  compileAnimationClipIr,
  evaluateAnimationTrackAtTime,
  findCanonicalAuthoredTimelineConflict,
  findAuthoredTimelineBundleAnimation,
} from "../animationClipCompiler";

describe("compileAnimationClipIr", () => {
  it("sorts tracks by channel then track id and dedupes keyframes by time", () => {
    const clip: AnimationClipIR = {
      schemaVersion: 1,
      id: "clip-1",
      duration: 1.23456789,
      tracks: [
        {
          id: "track-b",
          variableId: "input_b",
          channel: "/controls/b",
          interpolation: "linear",
          keyframes: [
            { id: "b-kf-1", time: 0.5, value: 0.1, interpolation: "linear" },
            { id: "b-kf-2", time: 0.5, value: 0.9, interpolation: "step" },
          ],
        },
        {
          id: "track-a",
          variableId: "input_a",
          channel: "controls/a",
          interpolation: "step",
          keyframes: [
            { id: "a-kf-1", time: -1, value: -1, interpolation: "step" },
            { id: "a-kf-2", time: 99, value: 2, interpolation: "step" },
          ],
        },
      ],
    };

    const compiled = compileAnimationClipIr({ clip });
    const compiledReordered = compileAnimationClipIr({
      clip: {
        ...clip,
        tracks: [...clip.tracks].reverse(),
      },
    });

    expect(compiled).toEqual(compiledReordered);
    expect(compiled.duration).toBe(1.234568);
    expect(compiled.tracks.map((track) => track.channel)).toEqual([
      "controls/a",
      "controls/b",
    ]);
    expect(compiled.tracks[1]?.keyframes).toEqual([
      {
        id: "b-kf-2",
        time: 0.5,
        value: 0.9,
        interpolation: "step",
        inTangent: undefined,
        outTangent: undefined,
      },
    ]);
  });

  it("treats track interpolation as default and keeps only per-key overrides", () => {
    const clip: AnimationClipIR = {
      schemaVersion: 1,
      id: "clip-defaults",
      duration: 2,
      tracks: [
        {
          id: "track-1",
          variableId: "input_a",
          channel: "controls/a",
          interpolation: "step",
          keyframes: [
            { id: "kf-1", time: 0, value: 0, interpolation: "step" },
            { id: "kf-2", time: 1, value: 1, interpolation: "linear" },
          ],
        },
      ],
    };

    const compiled = compileAnimationClipIr({ clip });
    expect(compiled.tracks[0]?.interpolation).toBe("step");
    expect(compiled.tracks[0]?.keyframes[0]?.interpolation).toBeUndefined();
    expect(compiled.tracks[0]?.keyframes[1]?.interpolation).toBe("linear");

    const bundleEntry = clipIrToBundleAnimationEntry(compiled);
    expect(bundleEntry.clip?.tracks?.[0]?.keyframes?.[0]?.interpolation).toBe(
      "step",
    );
    expect(bundleEntry.clip?.tracks?.[0]?.keyframes?.[1]?.interpolation).toBe(
      "linear",
    );
  });
});

describe("bundle conversion", () => {
  it("round-trips authored clip ir to bundle entry deterministically", () => {
    const clip: AnimationClipIR = {
      schemaVersion: 1,
      id: AUTHORED_TIMELINE_CLIP_ID,
      name: "Authoring Timeline",
      duration: 2,
      tracks: [
        {
          id: "track-1",
          variableId: "jaw_open",
          channel: "/controls/jaw/open",
          interpolation: "cubic",
          keyframes: [
            {
              id: "kf-1",
              time: 0,
              value: 0,
              interpolation: "cubic",
              outTangent: 0.2,
            },
            {
              id: "kf-2",
              time: 2,
              value: 1,
              interpolation: "cubic",
              inTangent: 0.1,
            },
          ],
        },
      ],
    };

    const entry = clipIrToBundleAnimationEntry(clip);
    expect(entry).toMatchInlineSnapshot(`
      {
        "clip": {
          "duration": 2,
          "id": "authoring.timeline.main",
          "metadata": {
            "origin": "authoring.timeline",
            "schemaVersion": 1,
          },
          "name": "Authoring Timeline",
          "tracks": [
            {
              "channel": "controls/jaw/open",
              "interpolation": "cubic",
              "keyframes": [
                {
                  "inTangent": undefined,
                  "interpolation": "cubic",
                  "outTangent": 0.2,
                  "time": 0,
                  "value": 0,
                },
                {
                  "inTangent": 0.1,
                  "interpolation": "cubic",
                  "outTangent": undefined,
                  "time": 2,
                  "value": 1,
                },
              ],
              "targetInputId": "jaw_open",
            },
          ],
        },
        "id": "authoring.timeline.main",
        "metadata": {
          "clipSchemaVersion": 1,
          "origin": "authoring.timeline",
          "schemaVersion": 1,
        },
      }
    `);

    const hydrated = bundleAnimationEntryToClipIr(entry);
    expect(hydrated).not.toBeNull();
    expect(hydrated?.tracks[0]).toMatchObject({
      variableId: "jaw_open",
      channel: "controls/jaw/open",
      interpolation: "cubic",
    });
  });
});

describe("evaluateAnimationTrackAtTime", () => {
  it("supports linear, step, and cubic semantics", () => {
    const linearTrack: AnimationTrackIR = {
      id: "linear-track",
      variableId: "linear",
      channel: "controls/linear",
      interpolation: "linear",
      keyframes: [
        { id: "kf-1", time: 0, value: 0, interpolation: "linear" },
        { id: "kf-2", time: 1, value: 1, interpolation: "linear" },
      ],
    };
    const stepTrack: AnimationTrackIR = {
      id: "step-track",
      variableId: "step",
      channel: "controls/step",
      interpolation: "step",
      keyframes: [
        { id: "kf-1", time: 0, value: 0, interpolation: "step" },
        { id: "kf-2", time: 1, value: 1, interpolation: "step" },
      ],
    };
    const cubicTrack: AnimationTrackIR = {
      id: "cubic-track",
      variableId: "cubic",
      channel: "controls/cubic",
      interpolation: "cubic",
      keyframes: [
        {
          id: "kf-1",
          time: 0,
          value: 0,
          interpolation: "cubic",
          outTangent: 0,
        },
        {
          id: "kf-2",
          time: 1,
          value: 1,
          interpolation: "cubic",
          inTangent: 0,
        },
      ],
    };

    expect(evaluateAnimationTrackAtTime(linearTrack, 0.5)).toBeCloseTo(0.5, 6);
    expect(evaluateAnimationTrackAtTime(stepTrack, 0.75)).toBe(0);
    expect(evaluateAnimationTrackAtTime(cubicTrack, 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe("findAuthoredTimelineBundleAnimation", () => {
  it("accepts legacy timeline-main only when metadata.origin marks authored timeline", () => {
    const invalidLegacy = {
      id: LEGACY_AUTHORED_TIMELINE_CLIP_ID,
      clip: { id: LEGACY_AUTHORED_TIMELINE_CLIP_ID, tracks: [] },
      metadata: {},
    } as any;
    const validLegacy = {
      id: LEGACY_AUTHORED_TIMELINE_CLIP_ID,
      clip: { id: LEGACY_AUTHORED_TIMELINE_CLIP_ID, tracks: [] },
      metadata: { origin: AUTHORED_TIMELINE_METADATA_ORIGIN },
    } as any;

    expect(findAuthoredTimelineBundleAnimation([invalidLegacy])).toBeNull();
    expect(findAuthoredTimelineBundleAnimation([validLegacy])).toBe(
      validLegacy,
    );
  });
});

describe("findCanonicalAuthoredTimelineConflict", () => {
  it("flags canonical authored timeline id entries that are missing authored origin markers", () => {
    const conflict = findCanonicalAuthoredTimelineConflict([
      {
        id: AUTHORED_TIMELINE_CLIP_ID,
        clip: { id: AUTHORED_TIMELINE_CLIP_ID, tracks: [] },
        metadata: {},
      } as any,
    ]);
    expect(conflict?.id).toBe(AUTHORED_TIMELINE_CLIP_ID);

    const noConflict = findCanonicalAuthoredTimelineConflict([
      {
        id: AUTHORED_TIMELINE_CLIP_ID,
        clip: {
          id: AUTHORED_TIMELINE_CLIP_ID,
          tracks: [],
          metadata: { origin: AUTHORED_TIMELINE_METADATA_ORIGIN },
        },
      } as any,
    ]);
    expect(noConflict).toBeNull();
  });
});
