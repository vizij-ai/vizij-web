import { beforeEach, describe, expect, it } from "vitest";
import {
  clipTargetId,
  createEmptyClip,
  nextClipOrdinal,
  selectOrderedEntries,
  selectSelectedEntry,
  useAnimationClipsStore,
  type AnimationClipEntry,
} from "../animationClipsStore";
import type { AnimationClipIR } from "../../types/animationClipIr";

/**
 * These encode the failures that motivated a single owner. Each one is a real
 * sequence that destroyed data when clip contents lived in one store and the
 * saved copies in another — see
 * docs/notes/ANIMATION_SELECTION_STATE_2026-09-03.md.
 */

function clipWithTracks(clipId: string, trackCount: number): AnimationClipIR {
  const clip = createEmptyClip(clipId, clipId);
  return {
    ...clip,
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
) {
  return {
    clipId,
    name: clipId,
    source,
    baseline: source === "imported" ? clipWithTracks(clipId, trackCount) : null,
    clip: clipWithTracks(clipId, trackCount),
  };
}

const store = () => useAnimationClipsStore.getState();
const trackCount = (clipId: string) =>
  useAnimationClipsStore.getState().entries[clipId]?.clip.tracks.length ?? null;

describe("animation clips store", () => {
  beforeEach(() => {
    useAnimationClipsStore.getState().reset();
  });

  it("switching clips moves no data between them", () => {
    // The reported failure: a new clip with one track came back holding the
    // four tracks of the clip switched to.
    store().addClip(entry("imported.1", 4, "imported"));
    store().addClip(entry("clip.2", 1));
    store().selectClip("clip.2");

    store().selectClip("imported.1");
    expect(trackCount("clip.2")).toBe(1);
    expect(trackCount("imported.1")).toBe(4);

    store().selectClip("clip.2");
    expect(trackCount("clip.2")).toBe(1);
    expect(trackCount("imported.1")).toBe(4);
  });

  it("adding a clip while another is selected touches neither's data", () => {
    // The other reported failure: creating an animation emptied or overwrote
    // the existing one.
    store().addClip(entry("imported.1", 4, "imported"));
    store().selectClip("imported.1");

    store().addClip(entry("clip.2", 0));

    expect(trackCount("imported.1")).toBe(4);
    expect(trackCount("clip.2")).toBe(0);
    // Adding does not steal the selection.
    expect(store().selectedClipId).toBe("imported.1");
  });

  it("edits land on the selected clip and nowhere else", () => {
    store().addClip(entry("clip.1", 1));
    store().addClip(entry("clip.2", 1));
    store().selectClip("clip.2");

    store().updateSelectedClip((clip) => ({ ...clip, duration: 42 }));

    expect(store().entries["clip.2"]!.clip.duration).toBe(42);
    expect(store().entries["clip.1"]!.clip.duration).toBe(10);
  });

  it("edits after a switch land on the newly selected clip", () => {
    // Selection and data change in one transition, so there is no window in
    // which an edit can be routed to the clip just left.
    store().addClip(entry("clip.1", 1));
    store().addClip(entry("clip.2", 1));
    store().selectClip("clip.1");
    store().selectClip("clip.2");

    store().updateSelectedClip((clip) => ({ ...clip, duration: 7 }));

    expect(store().entries["clip.2"]!.clip.duration).toBe(7);
    expect(store().entries["clip.1"]!.clip.duration).toBe(10);
  });

  it("ignores edits when nothing is selected rather than guessing", () => {
    store().addClip(entry("clip.1", 1));
    store().updateSelectedClip((clip) => ({ ...clip, duration: 99 }));
    expect(store().entries["clip.1"]!.clip.duration).toBe(10);
  });

  it("refuses to select a clip that does not exist", () => {
    // Falling back to another clip is what made selection and data disagree.
    store().addClip(entry("clip.1", 1));
    store().selectClip("clip.1");
    store().selectClip("nope");
    expect(store().selectedClipId).toBe("clip.1");
  });

  it("an edit cannot rewrite the clip's identity", () => {
    store().addClip(entry("clip.1", 1));
    store().selectClip("clip.1");
    store().updateSelectedClip((clip) => ({ ...clip, id: "hijacked" }));

    expect(store().entries["hijacked"]).toBeUndefined();
    expect(store().entries["clip.1"]!.clip.id).toBe("clip.1");
  });

  it("removing the selected clip selects another rather than nothing", () => {
    store().addClip(entry("clip.1", 1));
    store().addClip(entry("clip.2", 1));
    store().selectClip("clip.2");

    store().removeClip("clip.2");

    expect(store().selectedClipId).toBe("clip.1");
    expect(store().entries["clip.2"]).toBeUndefined();
    expect(trackCount("clip.1")).toBe(1);
  });

  it("orders authored clips before imported ones", () => {
    store().addClip(entry("imported.1", 1, "imported"));
    store().addClip(entry("clip.2", 1));

    expect(selectOrderedEntries(store()).map((e) => e.clipId)).toEqual([
      "clip.2",
      "imported.1",
    ]);
  });

  it("keeps an imported clip's baseline so edits stay comparable", () => {
    store().addClip(entry("imported.1", 2, "imported"));
    store().selectClip("imported.1");
    store().updateSelectedClip((clip) => ({ ...clip, duration: 3 }));

    const found = selectSelectedEntry(store())!;
    expect(found.clip.duration).toBe(3);
    expect(found.baseline!.duration).toBe(10);
  });

  it("replaceAll keeps a valid selection and drops an invalid one", () => {
    store().addClip(entry("clip.1", 1));
    store().selectClip("clip.1");

    store().replaceAll([entry("clip.9", 1)]);
    expect(store().selectedClipId).toBe("clip.9");

    store().replaceAll([entry("clip.9", 1), entry("clip.8", 1)], "clip.8");
    expect(store().selectedClipId).toBe("clip.8");
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
