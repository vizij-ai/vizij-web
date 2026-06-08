import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  evaluateAnimationTrackAtTime,
  type AnimationClipIR,
} from "@vizij/studio-support";
import { useAnimationStore } from "../animationStore";

beforeEach(() => {
  useAnimationStore.getState().reset();
});

describe("animationStore deterministic behavior", () => {
  it("assigns deterministic track ids and deterministic colors", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A");
    store.addTrack("input_b", "Input B");

    const state = useAnimationStore.getState();
    expect(state.tracks.map((track) => track.id)).toEqual([
      "track-0001",
      "track-0002",
    ]);
    expect(state.tracks[0]?.color).toBe(
      useAnimationStore.getState().tracks[0]?.color,
    );
    expect(state.tracks[0]?.color).not.toBe(state.tracks[1]?.color);
  });

  it("dedupes same-time keyframes deterministically and keeps deterministic ids", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A");

    store.addKeyframe("track-0001", 0.5, 0.2);
    store.addKeyframe("track-0001", 0.5, 0.9);

    const state = useAnimationStore.getState();
    expect(state.tracks[0]?.keyframes).toHaveLength(1);
    expect(state.tracks[0]?.keyframes[0]).toMatchObject({
      id: "kf-000002",
      time: 0.5,
      value: 0.9,
    });
  });

  it("imports and exports clip ir while advancing ordinals deterministically", () => {
    const clip: AnimationClipIR = {
      schemaVersion: 1,
      id: AUTHORED_TIMELINE_CLIP_ID,
      duration: 2,
      tracks: [
        {
          id: "track-0010",
          variableId: "input_a",
          channel: "controls/a",
          interpolation: "linear",
          keyframes: [
            {
              id: "kf-000099",
              time: 0,
              value: 0,
              interpolation: "linear",
            },
          ],
        },
      ],
    };

    const store = useAnimationStore.getState();
    store.importClipIr(clip);
    store.addTrack("input_b", "Input B");
    store.addKeyframe("track-0010", 1, 0.4);

    const exported = store.exportClipIr();
    expect(exported.id).toBe(AUTHORED_TIMELINE_CLIP_ID);
    expect(exported.tracks.map((track) => track.id)).toEqual([
      "track-0010",
      "track-0011",
    ]);
    expect(exported.tracks[0]?.keyframes[1]?.id).toBe("kf-000100");
  });

  it("keeps track interpolation as default while preserving per-key overrides", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A");
    store.addKeyframe("track-0001", 0, 0);
    store.addKeyframe("track-0001", 1, 1);
    const keyframeId = useAnimationStore.getState().tracks[0]?.keyframes[0]?.id;
    expect(keyframeId).toBeDefined();
    store.updateKeyframe("track-0001", keyframeId!, {
      interpolation: "cubic",
    });

    store.setTrackInterpolation("track-0001", "step");

    const state = useAnimationStore.getState();
    expect(state.tracks[0]?.interpolation).toBe("step");
    expect(state.tracks[0]?.keyframes[0]?.interpolation).toBe("cubic");
    expect(state.tracks[0]?.keyframes[1]?.interpolation).toBeUndefined();
  });

  it("exports cubic tracks with Studio default cubic evaluation", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A", "controls/a");
    store.addKeyframe("track-0001", 0, 0);
    store.addKeyframe("track-0001", 1, 1);
    store.setTrackInterpolation("track-0001", "cubic");
    store.updateKeyframe("track-0001", "kf-000001", {
      interpolation: "cubic",
      outTangent: 2,
      outHandle: { x: 0.1, y: 1 },
    });
    store.updateKeyframe("track-0001", "kf-000002", {
      interpolation: "cubic",
      inTangent: 2,
      inHandle: { x: -0.1, y: -1 },
    });

    const exported = store.exportClipIr();
    const exportedTrack = exported.tracks[0];

    expect(exportedTrack?.interpolation).toBe("cubic");
    expect(exportedTrack?.keyframes[0]).toMatchObject({
      outTangent: 2,
      outHandle: { x: 0.1, y: 1 },
    });
    expect(exportedTrack?.keyframes[1]).toMatchObject({
      inTangent: 2,
      inHandle: { x: -0.1, y: -1 },
    });
    expect(evaluateAnimationTrackAtTime(exportedTrack!, 0.25)).toBeLessThan(
      0.25,
    );
    expect(evaluateAnimationTrackAtTime(exportedTrack!, 0.5)).toBeCloseTo(0.5);
  });

  it("preserves spline handle edits through exported clip IR", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A", "controls/a");
    store.addKeyframe("track-0001", 0, 0);
    store.addKeyframe("track-0001", 1, 1);
    store.updateKeyframe("track-0001", "kf-000001", {
      interpolation: "spline",
      outHandle: { x: 0.65, y: 0 },
    });
    store.updateKeyframe("track-0001", "kf-000002", {
      inHandle: { x: -0.65, y: 0 },
    });

    const exported = store.exportClipIr();
    const exportedTrack = exported.tracks[0];

    expect(exportedTrack?.keyframes[0]).toMatchObject({
      interpolation: "spline",
      outHandle: { x: 0.65, y: 0 },
    });
    expect(exportedTrack?.keyframes[1]).toMatchObject({
      inHandle: { x: -0.65, y: 0 },
    });
    expect(evaluateAnimationTrackAtTime(exportedTrack!, 0.25)).toBeLessThan(
      0.25,
    );
  });

  it("upserts input keyframes by creating a track and updating same-time keys", () => {
    const store = useAnimationStore.getState();

    store.upsertInputKeyframe(
      {
        inputId: "jaw_open",
        value: 0.2,
        label: "Jaw Open",
        channel: "face/mouth/jaw_open",
      },
      0.5,
    );

    let state = useAnimationStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0]?.variableId).toBe("jaw_open");
    expect(state.tracks[0]?.keyframes).toHaveLength(1);
    expect(state.tracks[0]?.keyframes[0]?.value).toBe(0.2);
    const initialKeyframeId = state.tracks[0]?.keyframes[0]?.id;

    store.upsertInputKeyframe(
      {
        inputId: "jaw_open",
        value: 0.8,
        label: "Jaw Open",
        channel: "face/mouth/jaw_open",
      },
      0.5,
    );

    state = useAnimationStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0]?.keyframes).toHaveLength(1);
    expect(state.tracks[0]?.keyframes[0]?.id).toBe(initialKeyframeId);
    expect(state.tracks[0]?.keyframes[0]?.value).toBe(0.8);
  });

  it("upserts nearby-time keyframes within one 32fps frame instead of inserting duplicates", () => {
    const store = useAnimationStore.getState();

    store.upsertInputKeyframe(
      {
        inputId: "jaw_open",
        value: 0.2,
        label: "Jaw Open",
        channel: "face/mouth/jaw_open",
      },
      1,
    );

    const initialState = useAnimationStore.getState();
    const initialKeyframeId = initialState.tracks[0]?.keyframes[0]?.id;
    expect(initialKeyframeId).toBeDefined();

    store.upsertInputKeyframe(
      {
        inputId: "jaw_open",
        value: 0.9,
        label: "Jaw Open",
        channel: "face/mouth/jaw_open",
      },
      1 + 0.02,
    );

    let state = useAnimationStore.getState();
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0]?.keyframes).toHaveLength(1);
    expect(state.tracks[0]?.keyframes[0]?.id).toBe(initialKeyframeId);
    expect(state.tracks[0]?.keyframes[0]?.value).toBe(0.9);

    store.upsertInputKeyframe(
      {
        inputId: "jaw_open",
        value: 0.4,
        label: "Jaw Open",
        channel: "face/mouth/jaw_open",
      },
      1 + 0.04,
    );

    state = useAnimationStore.getState();
    expect(state.tracks[0]?.keyframes).toHaveLength(2);
  });

  it("keeps curve selection explicit across keyframes, segments, and handles", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A", "controls/a");
    store.addKeyframe("track-0001", 0, 0);

    let state = useAnimationStore.getState();
    expect(state.selectedKeyframeId).toBe("kf-000001");
    expect(state.selectedCurveItem).toEqual({
      kind: "keyframe",
      keyframeId: "kf-000001",
    });

    store.selectCurveItem({ kind: "segment", segmentIndex: 0 });
    state = useAnimationStore.getState();
    expect(state.selectedKeyframeId).toBeNull();
    expect(state.selectedCurveItem).toEqual({
      kind: "segment",
      segmentIndex: 0,
    });

    store.selectCurveItem({ kind: "handle", segmentIndex: 0, side: "out" });
    state = useAnimationStore.getState();
    expect(state.selectedKeyframeId).toBeNull();
    expect(state.selectedCurveItem).toEqual({
      kind: "handle",
      segmentIndex: 0,
      side: "out",
    });

    store.selectKeyframe("kf-000001");
    state = useAnimationStore.getState();
    expect(state.selectedKeyframeId).toBe("kf-000001");
    expect(state.selectedCurveItem).toEqual({
      kind: "keyframe",
      keyframeId: "kf-000001",
    });
  });

  it("locks middle keyframe handles as equal and opposite smooth splines", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A", "controls/a");
    store.addKeyframe("track-0001", 0, 0);
    store.addKeyframe("track-0001", 1, 1);
    store.addKeyframe("track-0001", 2, 0);

    store.setKeyframeHandleLock("track-0001", "kf-000002", true);

    let state = useAnimationStore.getState();
    let keyframes = state.tracks[0]!.keyframes;
    expect(keyframes[0]).toMatchObject({ interpolation: "spline" });
    expect(keyframes[1]).toMatchObject({
      handleLock: "smooth",
      interpolation: "spline",
      inHandle: { x: -0.333333, y: 0 },
      outHandle: { x: 0.333333, y: 0 },
    });

    store.updateSegmentHandle("track-0001", 1, "out", {
      x: 0.4,
      y: 0.2,
    });

    state = useAnimationStore.getState();
    keyframes = state.tracks[0]!.keyframes;
    expect(keyframes[0]).toMatchObject({ interpolation: "spline" });
    expect(keyframes[1]).toMatchObject({
      handleLock: "smooth",
      interpolation: "spline",
      inHandle: { x: -0.4, y: -0.2 },
      outHandle: { x: 0.4, y: 0.2 },
      inTangent: undefined,
      outTangent: undefined,
    });

    store.setKeyframeHandleLock("track-0001", "kf-000002", false);
    store.updateSegmentHandle("track-0001", 1, "out", {
      x: 0.25,
      y: 0.6,
    });

    state = useAnimationStore.getState();
    keyframes = state.tracks[0]!.keyframes;
    expect(keyframes[1]?.handleLock).toBeUndefined();
    expect(keyframes[1]?.outHandle).toEqual({ x: 0.25, y: 0.6 });
    expect(keyframes[1]?.inHandle).toEqual({ x: -0.4, y: -0.2 });
  });

  it("clamps locked handle time magnitude to the shorter adjacent segment", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A", "controls/a");
    store.addKeyframe("track-0001", 0, 0);
    store.addKeyframe("track-0001", 0.5, 1);
    store.addKeyframe("track-0001", 2, 0);
    store.setKeyframeHandleLock("track-0001", "kf-000002", true);

    store.updateSegmentHandle("track-0001", 1, "out", {
      x: 1.4,
      y: 0.25,
    });

    const keyframe = useAnimationStore.getState().tracks[0]!.keyframes[1]!;
    expect(keyframe.outHandle?.x).toBeCloseTo(0.499999, 6);
    expect(keyframe.outHandle?.y).toBe(0.25);
    expect(keyframe.inHandle?.x).toBeCloseTo(-0.499999, 6);
    expect(keyframe.inHandle?.y).toBe(-0.25);
  });

  it("keeps locked-adjacent preset changes as custom splines", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A", "controls/a");
    store.addKeyframe("track-0001", 0, 0);
    store.addKeyframe("track-0001", 1, 1);
    store.addKeyframe("track-0001", 2, 0);
    store.setKeyframeHandleLock("track-0001", "kf-000002", true);

    store.setSegmentInterpolation("track-0001", 1, "step", {
      outHandle: { x: 0.9, y: 0.15 },
      inHandle: { x: -0.1, y: 1 },
    });

    const keyframes = useAnimationStore.getState().tracks[0]!.keyframes;
    expect(keyframes[0]).toMatchObject({ interpolation: "spline" });
    expect(keyframes[1]).toMatchObject({
      handleLock: "smooth",
      interpolation: "spline",
      inHandle: { x: -0.9, y: -0.15 },
      outHandle: { x: 0.9, y: 0.15 },
    });
  });

  it("strips keyframe handle lock metadata from exported animation IR", () => {
    const store = useAnimationStore.getState();
    store.addTrack("input_a", "Input A", "controls/a");
    store.addKeyframe("track-0001", 0, 0);
    store.addKeyframe("track-0001", 1, 1);
    store.addKeyframe("track-0001", 2, 0);
    store.setKeyframeHandleLock("track-0001", "kf-000002", true);

    const exported = useAnimationStore.getState().exportClipIr();
    expect("handleLock" in exported.tracks[0]!.keyframes[1]!).toBe(false);
  });

  it("keeps transport active while playback is paused", () => {
    const store = useAnimationStore.getState();

    store.seek(1.25);
    let state = useAnimationStore.getState();
    expect(state.transportActive).toBe(false);
    expect(state.transportPlaybackState).toBe("stopped");

    store.play();
    store.seek(2);
    state = useAnimationStore.getState();
    expect(state.transportActive).toBe(true);
    expect(state.transportPlaybackState).toBe("playing");

    store.pause();
    state = useAnimationStore.getState();
    expect(state.transportActive).toBe(true);
    expect(state.transportPlaybackState).toBe("paused");

    store.stop();
    state = useAnimationStore.getState();
    expect(state.transportActive).toBe(false);
    expect(state.transportPlaybackState).toBe("stopped");
  });
});
