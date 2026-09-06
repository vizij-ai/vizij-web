import { describe, expect, it } from "vitest";
import {
  addClipEntry,
  clipTargetId,
  commitClipEntry,
  createEmptyClip,
  EMPTY_CLIP_SET,
  nextClipOrdinal,
  orderedClipEntries,
  removeClipEntry,
  updateClipEntry,
  renameClipEntry,
  replaceClipEntries,
  selectedClipEntry,
  type AnimationClipEntry,
  type ClipSetState,
} from "../animationClipsStore";
import type { AnimationClipIR } from "../../types/animationClipIr";

/**
 * The clip set as pure reducers. These encode the failures that motivated a
 * single owner — see docs/notes/ANIMATION_SELECTION_STATE_2026-09-03.md.
 */

function clipWithTracks(clipId: string, trackCount: number): AnimationClipIR {
  return {
    ...createEmptyClip(clipId, clipId),
    tracks: Array.from({ length: trackCount }, (_, index) => ({
      id: `${clipId}-t${index}`,
      variableId: `var_${index}`,
      channel: `propsrig/el/translation/${"xyz"[index % 3]}`,
      interpolation: "linear" as const,
      keyframes: [{ id: `${clipId}-k${index}`, time: 0, value: index }],
    })),
  };
}

function entry(
  clipId: string,
  trackCount: number,
  source: AnimationClipEntry["source"] = "authored",
): Omit<AnimationClipEntry, "targetId"> {
  return {
    clipId,
    name: clipId,
    source,
    baseline: source === "imported" ? clipWithTracks(clipId, trackCount) : null,
    clip: clipWithTracks(clipId, trackCount),
  };
}

function withClips(
  ...entries: Array<Omit<AnimationClipEntry, "targetId">>
): ClipSetState {
  return entries.reduce(addClipEntry, EMPTY_CLIP_SET);
}

const tracksOf = (state: ClipSetState, clipId: string) =>
  state.clipEntries[clipId]?.clip.tracks.length ?? null;

describe("clip set reducers", () => {
  it("adding a clip leaves every other clip's data untouched", () => {
    // The reported failure: creating an animation overwrote or emptied the
    // existing one.
    const before = withClips(entry("imported.1", 4, "imported"));
    const after = addClipEntry(before, entry("clip.2", 0));

    expect(tracksOf(after, "imported.1")).toBe(4);
    expect(tracksOf(after, "clip.2")).toBe(0);
    // Adding does not steal the selection.
    expect(after.selectedClipId).toBe(before.selectedClipId);
  });

  it("committing a clip writes only that clip", () => {
    const before = withClips(entry("clip.1", 1), entry("clip.2", 1));
    const after = commitClipEntry(
      before,
      "clip.2",
      clipWithTracks("clip.2", 5),
    );

    expect(tracksOf(after, "clip.2")).toBe(5);
    expect(tracksOf(after, "clip.1")).toBe(1);
  });

  it("a commit cannot rewrite the entry's identity", () => {
    // clipId is what saving, hydration and export all key on; letting a write
    // change it makes the map and the entry disagree.
    const before = withClips(entry("clip.1", 1));
    const after = commitClipEntry(before, "clip.1", {
      ...clipWithTracks("clip.1", 2),
      id: "hijacked",
    });

    expect(after.clipEntries["hijacked"]).toBeUndefined();
    expect(after.clipEntries["clip.1"]!.clip.id).toBe("clip.1");
    expect(tracksOf(after, "clip.1")).toBe(2);
  });

  it("committing an unknown clip is a no-op, not an insert", () => {
    const before = withClips(entry("clip.1", 1));
    const after = commitClipEntry(before, "ghost", clipWithTracks("ghost", 3));

    expect(after).toBe(before);
    expect(after.clipEntries["ghost"]).toBeUndefined();
  });

  it("removing the selected clip selects another rather than nothing", () => {
    const seeded = withClips(entry("clip.1", 1), entry("clip.2", 1));
    const before = { ...seeded, selectedClipId: "clip.2" };
    const after = removeClipEntry(before, "clip.2");

    expect(after.selectedClipId).toBe("clip.1");
    expect(after.clipEntries["clip.2"]).toBeUndefined();
    expect(tracksOf(after, "clip.1")).toBe(1);
  });

  it("removing a clip that is not selected keeps the selection", () => {
    const seeded = withClips(entry("clip.1", 1), entry("clip.2", 1));
    const before = { ...seeded, selectedClipId: "clip.1" };
    expect(removeClipEntry(before, "clip.2").selectedClipId).toBe("clip.1");
  });

  it("renaming touches the entry and the clip together", () => {
    const before = withClips(entry("clip.1", 1));
    const after = renameClipEntry(before, "clip.1", "Blink");

    expect(after.clipEntries["clip.1"]!.name).toBe("Blink");
    expect(after.clipEntries["clip.1"]!.clip.name).toBe("Blink");
  });

  it("orders authored clips before imported ones", () => {
    const state = withClips(
      entry("imported.1", 1, "imported"),
      entry("clip.2", 1),
    );
    expect(orderedClipEntries(state).map((e) => e.clipId)).toEqual([
      "clip.2",
      "imported.1",
    ]);
  });

  it("keeps an imported clip's baseline so edits stay comparable", () => {
    const before = {
      ...withClips(entry("imported.1", 2, "imported")),
      selectedClipId: "imported.1",
    };
    const after = commitClipEntry(before, "imported.1", {
      ...clipWithTracks("imported.1", 2),
      duration: 3,
    });
    const found = selectedClipEntry(after)!;

    expect(found.clip.duration).toBe(3);
    expect(found.baseline!.duration).toBe(10);
  });

  it("replaceClipEntries keeps a valid selection and drops an invalid one", () => {
    const before = {
      ...withClips(entry("clip.1", 1)),
      selectedClipId: "clip.1",
    };

    const replaced = replaceClipEntries(before, [entry("clip.9", 1)]);
    expect(replaced.selectedClipId).toBe("clip.9");

    const explicit = replaceClipEntries(
      before,
      [entry("clip.9", 1), entry("clip.8", 1)],
      "clip.8",
    );
    expect(explicit.selectedClipId).toBe("clip.8");
  });
});

describe("clip identity helpers", () => {
  it("derives a distinct target id per source", () => {
    expect(clipTargetId("clip.1", "authored")).toBe(
      "authored-animation:clip.1",
    );
    expect(clipTargetId("clip.1", "imported")).toBe("bundle-animation:clip.1");
  });

  it("skips ordinals already taken, imported ones included", () => {
    // A new clip reusing an imported clip's id makes two entries share the
    // identity that saving, hydration and export all key on.
    expect(nextClipOrdinal(["authoring.timeline.clip.1"])).toBe(2);
    expect(nextClipOrdinal([])).toBe(1);
    expect(
      nextClipOrdinal([
        "authoring.timeline.clip.1",
        "authoring.timeline.clip.7",
      ]),
    ).toBe(8);
    expect(nextClipOrdinal(new Set(["authoring.timeline.main"]))).toBe(1);
  });
});

describe("explicit target ids", () => {
  it("keeps a supplied target id instead of deriving one", () => {
    // Imported clips carry face-scoped, index-based ids
    // (`bundle-animation:<rootId>:<index>`). Deriving one from the clip id
    // would change identity for every imported clip, and with it the keys of
    // everything stored against a target.
    const state = addClipEntry(EMPTY_CLIP_SET, {
      clipId: "imported.1",
      targetId: "bundle-animation:root-abc:0",
      name: "Stages",
      source: "imported",
      baseline: createEmptyClip("imported.1", "Stages"),
      clip: createEmptyClip("imported.1", "Stages"),
    });
    expect(state.clipEntries["imported.1"]!.targetId).toBe(
      "bundle-animation:root-abc:0",
    );
  });

  it("still derives one for an authored clip", () => {
    const state = addClipEntry(EMPTY_CLIP_SET, {
      clipId: "authoring.timeline.clip.1",
      name: "Wave",
      source: "authored",
      baseline: null,
      clip: createEmptyClip("authoring.timeline.clip.1", "Wave"),
    });
    expect(state.clipEntries["authoring.timeline.clip.1"]!.targetId).toBe(
      "authored-animation:authoring.timeline.clip.1",
    );
  });
});

describe("updateClipEntry", () => {
  const seeded = addClipEntry(EMPTY_CLIP_SET, {
    clipId: "clip.1",
    name: "Wave",
    source: "authored",
    baseline: null,
    clip: createEmptyClip("clip.1", "Wave"),
  });

  it("replaces a clip's data in place", () => {
    const next = updateClipEntry(seeded, "clip.1", (entry) => ({
      ...entry,
      clip: { ...entry.clip, duration: 12 },
    }));
    expect(next.clipEntries["clip.1"]!.clip.duration).toBe(12);
    expect(next.clipOrder).toEqual(seeded.clipOrder);
  });

  it("refuses to let an update change identity", () => {
    // Filing an entry under its old key while it claims a new id is how a
    // clip's edits end up addressing a different clip.
    const next = updateClipEntry(seeded, "clip.1", (entry) => ({
      ...entry,
      clipId: "clip.2",
      targetId: "authored-animation:clip.2",
    }));
    expect(next.clipEntries["clip.1"]!.clipId).toBe("clip.1");
    expect(next.clipEntries["clip.1"]!.targetId).toBe(
      "authored-animation:clip.1",
    );
    expect(next.clipEntries["clip.2"]).toBeUndefined();
  });

  it("leaves the state untouched for an unknown clip", () => {
    expect(updateClipEntry(seeded, "missing", (entry) => entry)).toBe(seeded);
  });

  it("leaves the state untouched when the updater returns the same entry", () => {
    expect(updateClipEntry(seeded, "clip.1", (entry) => entry)).toBe(seeded);
  });
});
