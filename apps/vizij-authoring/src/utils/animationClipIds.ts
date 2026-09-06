/**
 * Next free ordinal for an `authoring.timeline.clip.N` id.
 *
 * Must be given **every** clip id already in play, not just the authored
 * targets'. Imported bundle clips use the same id scheme — they were exported
 * from this app — so scanning authored targets alone hands the next authored
 * clip an id an imported clip already owns. Two targets then share a clip id,
 * and because clip id is the identity everywhere downstream, that single
 * collision:
 *
 * - lets `saveAnimationTarget`'s `clipId` match resolve to the wrong target,
 * - makes the two indistinguishable to the store's hydration marker, so one
 *   clip's tracks get written into the other,
 * - and collapses them into one entry on export, which is dropped animations.
 */
export function nextClipOrdinal(reservedClipIds: Iterable<string>): number {
  const prefix = "authoring.timeline.clip.";
  let maxOrdinal = 0;
  for (const clipId of reservedClipIds) {
    if (typeof clipId !== "string" || !clipId.startsWith(prefix)) {
      continue;
    }
    const parsed = Number.parseInt(clipId.slice(prefix.length), 10);
    if (Number.isFinite(parsed) && parsed > maxOrdinal) {
      maxOrdinal = parsed;
    }
  }
  return maxOrdinal + 1;
}
