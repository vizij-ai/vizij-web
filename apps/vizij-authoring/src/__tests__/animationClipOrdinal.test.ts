import { describe, expect, it } from "vitest";
import { nextAuthoredAnimationClipOrdinal } from "../App";

/**
 * A new authored clip must never reuse a clip id an imported clip already
 * owns. Imported bundle clips use the same `authoring.timeline.clip.N` scheme
 * because they were exported from this app, and clip id is the identity used
 * by saving, hydration and export — so one collision writes one clip's tracks
 * into another and collapses both into a single entry on export.
 */

describe("nextAuthoredAnimationClipOrdinal", () => {
  it("skips ordinals taken by imported clips", () => {
    // The reported failure: with no authored clips and an imported
    // `clip.1`, the old implementation returned 1 and collided.
    expect(
      nextAuthoredAnimationClipOrdinal([
        "authoring.timeline.clip.1",
        "authoring.timeline.main",
      ]),
    ).toBe(2);
  });

  it("starts at 1 when nothing is reserved", () => {
    expect(nextAuthoredAnimationClipOrdinal([])).toBe(1);
  });

  it("takes the highest ordinal in use, not the count", () => {
    expect(
      nextAuthoredAnimationClipOrdinal([
        "authoring.timeline.clip.1",
        "authoring.timeline.clip.7",
      ]),
    ).toBe(8);
  });

  it("ignores ids that are not of the ordinal scheme", () => {
    expect(
      nextAuthoredAnimationClipOrdinal([
        "authoring.timeline.main",
        "some-uuid-4f6d-b0c6",
        "authoring.timeline.clip.notanumber",
      ]),
    ).toBe(1);
  });

  it("accepts a Set, which is how the app supplies it", () => {
    expect(
      nextAuthoredAnimationClipOrdinal(new Set(["authoring.timeline.clip.3"])),
    ).toBe(4);
  });
});
