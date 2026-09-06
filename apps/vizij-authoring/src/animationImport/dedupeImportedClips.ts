import { stableStringify } from "../utils/hash";
import type { AnimationClipIR } from "../types/animationClipIr";

/**
 * De-duplicating imported clips against what the session already holds.
 *
 * Extracted from `channelManifest.ts`, which grew a manifest/fingerprint/drift
 * apparatus for a triage feature that was never built. This was the only part
 * of it anything imported, so the rest went and this stayed.
 */

/**
 * Canonical form for comparing two clips by what they animate.
 *
 * Deliberately drops clip id, name and keyframe ids, so a re-render or re-id
 * does not read as a different animation. Detached tracks are excluded too,
 * since they never reach the baked output.
 */
function canonicalizeClipContent(clip: AnimationClipIR) {
  return {
    duration: clip.duration,
    tracks: clip.tracks
      .filter((track) => !track.detached)
      .map((track) => ({
        channel: track.channel,
        interpolation: track.interpolation,
        keyframes: track.keyframes.map((keyframe) => ({
          time: keyframe.time,
          value: keyframe.value,
          interpolation: keyframe.interpolation ?? null,
          inTangent: keyframe.inTangent ?? null,
          outTangent: keyframe.outTangent ?? null,
        })),
      }))
      .sort((left, right) => left.channel.localeCompare(right.channel)),
  };
}

/**
 * Synchronous content signature for a clip — equal signatures mean equal
 * animation.
 *
 * A string rather than a digest: the comparison is local and only equality
 * matters, so hashing would buy nothing and force the caller to be async.
 */
export function animationClipContentSignature(clip: AnimationClipIR): string {
  return stableStringify(canonicalizeClipContent(clip));
}

export interface ImportedClipDedupeResult {
  /** Clips with no content-equal counterpart already present. */
  fresh: AnimationClipIR[];
  /** Incoming clips that duplicate an existing one, paired with its name. */
  duplicates: Array<{ clip: AnimationClipIR; existingName: string }>;
}

/**
 * Filters incoming imported clips against what the session already holds.
 *
 * Re-importing the same GLB is a normal thing to do — after editing geometry
 * in Blender, or just to check something — and it should not silently pile up
 * identical clips. Matching is on content, not on file name or clip id, so a
 * re-export that changed nothing about the animation still de-duplicates.
 */
export function dedupeImportedClips(options: {
  clips: ReadonlyArray<AnimationClipIR>;
  existing: ReadonlyArray<{ name: string; clip: AnimationClipIR }>;
}): ImportedClipDedupeResult {
  const existingBySignature = new Map<string, string>();
  for (const entry of options.existing) {
    const signature = animationClipContentSignature(entry.clip);
    if (!existingBySignature.has(signature)) {
      existingBySignature.set(signature, entry.name);
    }
  }

  const fresh: AnimationClipIR[] = [];
  const duplicates: ImportedClipDedupeResult["duplicates"] = [];
  for (const clip of options.clips) {
    const signature = animationClipContentSignature(clip);
    const existingName = existingBySignature.get(signature);
    if (existingName !== undefined) {
      duplicates.push({ clip, existingName });
      continue;
    }
    // Also de-duplicate within one import batch.
    existingBySignature.set(signature, clip.name ?? clip.id);
    fresh.push(clip);
  }
  return { fresh, duplicates };
}
