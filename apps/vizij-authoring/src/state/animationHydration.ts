/**
 * Whether a store snapshot may be persisted onto an authored clip.
 *
 * Authored clip edits are committed by an effect keyed on the animation
 * store's contents. That effect cannot tell an edit from a reset: the store
 * being empty because the user cleared the clip and the store being empty
 * because something called `reset()` look identical at the point of writing.
 * Any reset that left a target selected therefore persisted an empty clip over
 * that target's saved work, which is how authored animations were lost.
 *
 * The store records which clip it was hydrated from, and a write is refused
 * unless that marker still matches the target being written. This covers both
 * directions of the seam:
 *
 * - after a reset the marker is null, so nothing is written;
 * - when a target has been selected without loading it (creating a clip does
 *   this), the marker still names the previous clip, so the previous clip's
 *   tracks are not copied into the new target.
 *
 * A pure function so the rule is testable without rendering `App`.
 */
export function shouldPersistAnimationEdit(options: {
  /** Clip the animation store was last hydrated from, or null after a reset. */
  hydratedClipId: string | null;
  /** Clip id of the target about to be written. */
  targetClipId: string | null;
}): boolean {
  const { hydratedClipId, targetClipId } = options;
  if (!hydratedClipId || !targetClipId) {
    return false;
  }
  return hydratedClipId === targetClipId;
}
