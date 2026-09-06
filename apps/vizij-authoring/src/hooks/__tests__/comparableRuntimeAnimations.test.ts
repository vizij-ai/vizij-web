import { describe, expect, it } from "vitest";
import type { VizijAnimationAsset } from "@vizij/runtime-react";
import { selectComparableRuntimeAnimations } from "../useAnimationTransport";
import { AUTHORED_TIMELINE_CLIP_ID } from "../../types/animationClipIr";

/**
 * The transport decides it is ready by comparing what the runtime holds
 * against what it wants. Those two lists are built differently — the wanted
 * one drops inherited clips with no tracks — so comparing the raw runtime list
 * could never match, `transportRuntimeReady` stayed false, and Play silently
 * did nothing for the rest of the session.
 */

function asset(
  id: string,
  trackCount: number,
  duration = 5,
): VizijAnimationAsset {
  return {
    id,
    clip: {
      id,
      duration,
      tracks: Array.from({ length: trackCount }, (_, index) => ({
        id: `t${index}`,
      })),
    },
  } as unknown as VizijAnimationAsset;
}

describe("selectComparableRuntimeAnimations", () => {
  it("drops inherited clips with no tracks, as the wanted list does", () => {
    // The exact shape that stuck: an authored clip whose tracks were removed
    // sits in the runtime but never in the merged list.
    const result = selectComparableRuntimeAnimations(
      [asset("imported.a", 0), asset("imported.b", 3)],
      false,
    );
    expect(result.map((entry) => entry.id)).toEqual(["imported.b"]);
  });

  it("keeps the authored clip when one will be contributed", () => {
    // It is added to the merged list regardless of track count, so dropping it
    // here would reintroduce the same asymmetry from the other side.
    const result = selectComparableRuntimeAnimations(
      [asset(AUTHORED_TIMELINE_CLIP_ID, 0)],
      true,
    );
    expect(result.map((entry) => entry.id)).toEqual([
      AUTHORED_TIMELINE_CLIP_ID,
    ]);
  });

  it("drops the authored clip when none will be contributed", () => {
    const result = selectComparableRuntimeAnimations(
      [asset(AUTHORED_TIMELINE_CLIP_ID, 4)],
      false,
    );
    expect(result).toEqual([]);
  });

  it("sorts by id so ordering never causes a false mismatch", () => {
    const result = selectComparableRuntimeAnimations(
      [asset("z", 1), asset("a", 1), asset("m", 1)],
      false,
    );
    expect(result.map((entry) => entry.id)).toEqual(["a", "m", "z"]);
  });

  it("converges: a runtime holding the wanted set projects to that set", () => {
    const wanted = [
      asset("imported.b", 3),
      asset(AUTHORED_TIMELINE_CLIP_ID, 5),
    ];
    // The runtime also carries a track-less clip the merged list never has.
    const runtimeHolds = [...wanted, asset("imported.a", 0)];

    expect(
      selectComparableRuntimeAnimations(runtimeHolds, true).map((e) => e.id),
    ).toEqual(selectComparableRuntimeAnimations(wanted, true).map((e) => e.id));
  });

  it("returns an empty list rather than throwing on nothing", () => {
    expect(selectComparableRuntimeAnimations([], false)).toEqual([]);
  });
});
