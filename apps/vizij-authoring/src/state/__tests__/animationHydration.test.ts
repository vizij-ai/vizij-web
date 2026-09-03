import { beforeEach, describe, expect, it } from "vitest";
import { useAnimationStore } from "../animationStore";
import { shouldPersistAnimationEdit } from "../animationHydration";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
} from "../../types/animationClipIr";

/**
 * Guards the autosave hazard that lost authored clips.
 *
 * Clip edits are committed by one effect keyed on the store's contents, which
 * cannot tell an edit from a reset. Any reset that leaves a target selected
 * would make the next run persist an empty clip over that target's saved work.
 *
 * The fix is a hydration marker: the store records which clip it was loaded
 * for, and a write is refused unless the marker still matches the target being
 * written. These tests pin that, not the effect's plumbing.
 */

function clip(id: string, value: number): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id,
    name: id,
    duration: 1,
    tracks: [
      {
        id: "t0",
        variableId: "propsrig_l_lid_translation_y",
        channel: "propsrig/l_lid/translation/y",
        interpolation: "linear",
        keyframes: [{ id: "k0", time: 0, value }],
      },
    ],
  };
}

describe("animation store hydration marker", () => {
  beforeEach(() => {
    useAnimationStore.getState().reset();
  });

  it("records the clip it was hydrated from", () => {
    useAnimationStore.getState().importClipIr(clip("clip.a", 1));
    expect(useAnimationStore.getState().hydratedClipId).toBe("clip.a");
  });

  it("clears the marker on reset", () => {
    // This is the whole bug: after a reset the store is empty, and without a
    // marker that emptiness is indistinguishable from the user clearing the
    // clip themselves.
    useAnimationStore.getState().importClipIr(clip("clip.a", 1));
    useAnimationStore.getState().reset();

    expect(useAnimationStore.getState().hydratedClipId).toBeNull();
    expect(useAnimationStore.getState().tracks).toEqual([]);
  });

  it("starts with no marker", () => {
    expect(useAnimationStore.getState().hydratedClipId).toBeNull();
  });
});

describe("shouldPersistAnimationEdit", () => {
  it("persists when the store holds the target being written", () => {
    expect(
      shouldPersistAnimationEdit({
        hydratedClipId: "clip.a",
        targetClipId: "clip.a",
      }),
    ).toBe(true);
  });

  it("refuses after a reset", () => {
    // The reported failure: edits appeared to not save. In fact a reset while
    // a target was selected let an empty clip be written over saved work.
    expect(
      shouldPersistAnimationEdit({
        hydratedClipId: null,
        targetClipId: "clip.a",
      }),
    ).toBe(false);
  });

  it("refuses when the store holds a different clip", () => {
    // The other half of the seam: creating a target selects it without
    // loading, so the store still holds the previous clip. Writing then would
    // copy the old clip's tracks into the new target.
    expect(
      shouldPersistAnimationEdit({
        hydratedClipId: "clip.a",
        targetClipId: "clip.b",
      }),
    ).toBe(false);
  });

  it("refuses when there is no target", () => {
    expect(
      shouldPersistAnimationEdit({
        hydratedClipId: "clip.a",
        targetClipId: null,
      }),
    ).toBe(false);
  });
});
