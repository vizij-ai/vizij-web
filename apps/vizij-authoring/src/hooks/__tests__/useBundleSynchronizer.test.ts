import { describe, expect, it, vi } from "vitest";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  LEGACY_AUTHORED_TIMELINE_CLIP_ID,
} from "../../types/animationClipIr";
import { hydrateAuthoredTimelineFromBundleAnimations } from "../useBundleSynchronizer";

function createBundleAnimationEntry(
  id: string,
  metadata?: Record<string, unknown>,
) {
  return {
    id,
    clip: {
      id,
      duration: 1,
      tracks: [
        {
          channel: "controls/a",
          targetInputId: "input_a",
          interpolation: "linear",
          keyframes: [
            { time: 0, value: 0, interpolation: "linear" },
            { time: 1, value: 1, interpolation: "linear" },
          ],
        },
      ],
    },
    metadata,
  };
}

describe("hydrateAuthoredTimelineFromBundleAnimations", () => {
  it("hydrates canonical authored clip id", () => {
    const importClipIr = vi.fn();
    const reset = vi.fn();

    const hydrated = hydrateAuthoredTimelineFromBundleAnimations(
      [createBundleAnimationEntry(AUTHORED_TIMELINE_CLIP_ID)],
      { importClipIr, reset },
    );

    expect(hydrated).toBe(true);
    expect(importClipIr).toHaveBeenCalledTimes(1);
    expect(importClipIr).toHaveBeenCalledWith(
      expect.objectContaining({
        id: AUTHORED_TIMELINE_CLIP_ID,
      }),
    );
    expect(reset).not.toHaveBeenCalled();
  });

  it("accepts legacy timeline-main only when metadata.origin is authored timeline", () => {
    const importClipIr = vi.fn();
    const reset = vi.fn();

    const withoutMarker = hydrateAuthoredTimelineFromBundleAnimations(
      [createBundleAnimationEntry(LEGACY_AUTHORED_TIMELINE_CLIP_ID)],
      { importClipIr, reset },
    );
    expect(withoutMarker).toBe(false);
    expect(importClipIr).not.toHaveBeenCalled();
    expect(reset).toHaveBeenCalledTimes(1);

    reset.mockReset();
    const withMarker = hydrateAuthoredTimelineFromBundleAnimations(
      [
        createBundleAnimationEntry(LEGACY_AUTHORED_TIMELINE_CLIP_ID, {
          origin: AUTHORED_TIMELINE_METADATA_ORIGIN,
        }),
      ],
      { importClipIr, reset },
    );
    expect(withMarker).toBe(true);
    expect(importClipIr).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });
});
