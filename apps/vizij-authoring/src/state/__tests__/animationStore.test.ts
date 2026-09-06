import { beforeEach, describe, expect, it } from "vitest";
import { useAnimationStore } from "../animationStore";
import { createEmptyClip } from "../animationClipsStore";
import type { AnimationClipIR } from "../../types/animationClipIr";
import { AUTHORED_TIMELINE_CLIP_ID } from "../../types/animationClipIr";

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

describe("animationStore reset vs resetAll", () => {
  function clip(clipId: string, name: string) {
    return {
      clipId,
      name,
      source: "authored" as const,
      baseline: null,
      clip: createEmptyClip(clipId, name),
    };
  }

  function seedTwoClips() {
    const store = useAnimationStore.getState();
    store.addClip(clip("clip.1", "First"));
    store.addClip(clip("clip.2", "Second"));
    useAnimationStore
      .getState()
      .addTrack("jaw_open", "Jaw Open", "/propsrig/jaw/open");
    return useAnimationStore.getState();
  }

  it("reset clears the buffer but keeps every clip", () => {
    // App calls reset() while switching targets, failing to resolve one, and
    // deleting one. Wiping the clip set there would destroy the user's work —
    // and `...INITIAL_STATE` carries an empty clip set, so it very nearly did.
    const seeded = seedTwoClips();
    expect(seeded.clipOrder.length).toBe(2);

    useAnimationStore.getState().reset();
    const after = useAnimationStore.getState();

    expect(after.clipOrder.length).toBe(2);
    expect(after.tracks).toEqual([]);
    expect(after.currentTime).toBe(0);
    expect(after.transportPlaybackState).toBe("stopped");
  });

  it("resetAll drops the clip set too, for unloading a face", () => {
    seedTwoClips();

    useAnimationStore.getState().resetAll();
    const after = useAnimationStore.getState();

    expect(after.clipOrder).toEqual([]);
    expect(after.clipEntries).toEqual({});
    expect(after.selectedClipId).toBeNull();
    expect(after.tracks).toEqual([]);
  });
});
