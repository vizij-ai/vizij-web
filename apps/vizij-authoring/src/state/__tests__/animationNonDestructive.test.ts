import { beforeEach, describe, expect, it } from "vitest";
import { useAnimationStore } from "../animationStore";

/**
 * There is no undo anywhere in the app, so edits that destroy keyframes are
 * unrecoverable. These pin the two paths that used to destroy them silently:
 *
 * 1. dragging a keyframe onto a time another keyframe already occupies — the
 *    normalizer de-duped by exact time, last write wins, so one key vanished;
 * 2. shortening the clip duration — every later key was clamped to the new
 *    end and then collapsed into a single key.
 *
 * Both are fixed by refusing the destructive part rather than by warning
 * about it: a guard the user cannot dismiss beats a dialog they will.
 */

function seedTrack() {
  const store = useAnimationStore.getState();
  store.reset();
  store.setDuration(10);
  store.addTrack({
    variableId: "propsrig_l_lid_translation_y",
    channel: "propsrig/l_lid/translation/y",
  } as never);
  const trackId = useAnimationStore.getState().tracks[0]!.id;
  return trackId;
}

function keyTimes(trackId: string): number[] {
  return (
    useAnimationStore
      .getState()
      .tracks.find((track) => track.id === trackId)
      ?.keyframes.map((keyframe) => keyframe.time) ?? []
  );
}

describe("keyframe time collisions", () => {
  let trackId = "";

  beforeEach(() => {
    trackId = seedTrack();
  });

  it("refuses to drag a keyframe onto an occupied time", () => {
    const store = useAnimationStore.getState();
    store.addKeyframe(trackId, 1, 0);
    store.addKeyframe(trackId, 2, 1);
    expect(keyTimes(trackId)).toEqual([1, 2]);

    const first = useAnimationStore.getState().tracks[0]!.keyframes[0]!;
    useAnimationStore.getState().updateKeyframe(trackId, first.id, { time: 2 });

    // Both keyframes survive, and the dragged one stays where it was.
    expect(keyTimes(trackId)).toEqual([1, 2]);
    expect(
      useAnimationStore.getState().tracks[0]!.keyframes,
    ).toHaveLength(2);
  });

  it("still allows a drag to an unoccupied time", () => {
    const store = useAnimationStore.getState();
    store.addKeyframe(trackId, 1, 0);
    store.addKeyframe(trackId, 5, 1);

    const first = useAnimationStore.getState().tracks[0]!.keyframes[0]!;
    useAnimationStore.getState().updateKeyframe(trackId, first.id, { time: 3 });

    expect(keyTimes(trackId)).toEqual([3, 5]);
  });

  it("allows a value-only update at an unchanged time", () => {
    const store = useAnimationStore.getState();
    store.addKeyframe(trackId, 1, 0.25);
    const key = useAnimationStore.getState().tracks[0]!.keyframes[0]!;

    useAnimationStore.getState().updateKeyframe(trackId, key.id, { value: 0.9 });

    expect(keyTimes(trackId)).toEqual([1]);
    expect(useAnimationStore.getState().tracks[0]!.keyframes[0]!.value).toBe(
      0.9,
    );
  });
});

describe("shortening clip duration", () => {
  let trackId = "";

  beforeEach(() => {
    trackId = seedTrack();
  });

  it("will not shorten past the last keyframe", () => {
    const store = useAnimationStore.getState();
    store.addKeyframe(trackId, 1, 0);
    store.addKeyframe(trackId, 5, 1);
    store.addKeyframe(trackId, 9, 0);

    useAnimationStore.getState().setDuration(3);

    // Every key survives, and duration stops at the content.
    expect(keyTimes(trackId)).toEqual([1, 5, 9]);
    expect(useAnimationStore.getState().duration).toBe(9);
  });

  it("shortens freely when no keyframe is in the way", () => {
    const store = useAnimationStore.getState();
    store.addKeyframe(trackId, 1, 0);

    useAnimationStore.getState().setDuration(4);

    expect(useAnimationStore.getState().duration).toBe(4);
    expect(keyTimes(trackId)).toEqual([1]);
  });

  it("lengthens without touching keyframes", () => {
    const store = useAnimationStore.getState();
    store.addKeyframe(trackId, 2, 0);

    useAnimationStore.getState().setDuration(30);

    expect(useAnimationStore.getState().duration).toBe(30);
    expect(keyTimes(trackId)).toEqual([2]);
  });
});
