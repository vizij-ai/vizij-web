import type { VizijBundleAnimationEntry } from "@vizij/render";
import type { StandardRigInput } from "@vizij/utils";
import { bundleAnimationEntryToClipIr } from "../utils/animationClipCompiler";
import type { AnimationClipEntryInput } from "./animationClipsStore";

/**
 * The bundle's animations as clip-store entries.
 *
 * Replaces three parallel maps — `bundleAnimationClipOverrides`,
 * `bundleAnimationNameOverrides` and `bundleAnimationDurationOverrides` —
 * layered over a clip re-derived from the bundle on every read. An entry
 * carries the shipped clip as `baseline` and the live one as `clip`, so "has
 * this been edited?" is a comparison rather than a lookup in three places that
 * could disagree.
 *
 * Target ids stay index-based and face-scoped, exactly as App built them.
 * Their identity is not ours to change here: they key hidden-target state and
 * the runtime's active target, and re-keying them would be a separate
 * behavioural change hidden inside a refactor.
 */
export function buildImportedClipEntries(options: {
  animations: ReadonlyArray<VizijBundleAnimationEntry> | undefined;
  /** `bundle-animation:` — passed in so this module owns no App constants. */
  targetPrefix: string;
  /** Face-scoped, so ids from a previous face cannot be mistaken for these. */
  sessionKey: string;
  standardInputsById?: ReadonlyMap<string, StandardRigInput>;
}): AnimationClipEntryInput[] {
  const entries: AnimationClipEntryInput[] = [];
  const seenClipIds = new Set<string>();

  (options.animations ?? []).forEach((entry, index) => {
    const clip = bundleAnimationEntryToClipIr(entry, {
      ...(options.standardInputsById
        ? { standardInputsById: options.standardInputsById }
        : {}),
    });
    if (!clip) {
      return;
    }
    // Clip id is the identity everywhere downstream, so a duplicate would let
    // one clip's edits address another. Keep the first and skip the rest
    // rather than letting them collide silently.
    if (seenClipIds.has(clip.id)) {
      return;
    }
    seenClipIds.add(clip.id);

    const name =
      clip.name?.trim() ||
      entry.id?.trim() ||
      `Imported Animation ${index + 1}`;

    entries.push({
      clipId: clip.id,
      targetId: `${options.targetPrefix}${options.sessionKey}:${index}`,
      name,
      source: "imported",
      // Two instances on purpose: `clip` is edited in place, `baseline` stays
      // as shipped so an edit is detectable without a second map.
      baseline: structuredClone(clip),
      clip: { ...clip, name },
    });
  });

  return entries;
}
