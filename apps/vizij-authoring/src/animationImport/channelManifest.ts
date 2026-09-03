import { computeObjectHash, stableStringify } from "../utils/hash";
import type { AnimationClipIR } from "../types/animationClipIr";

export const ANIMATION_CHANNEL_MANIFEST_VERSION = 1 as const;

/**
 * Records how one propsrig channel was derived, so a later import can tell a
 * rename apart from a deletion.
 *
 * The channel path alone is not enough: `/propsrig/l_tlid/curveup/value`
 * cannot be reversed into `("L_TLid", "CurveUp")` because normalization is
 * lossy. Keeping the source triple makes drift classifiable.
 */
export interface AnimationChannelManifestEntry {
  channel: string;
  elementName: string;
  featureKey: string;
  component?: "x" | "y" | "z";
  /** Raw morph target name, for morph channels only. */
  morphName?: string;
}

/**
 * Lightweight identity signal for an element, used to spot a rename: an
 * element whose manifest entry vanished but whose fingerprint reappears under
 * a new name is a rename candidate rather than a deletion.
 *
 * Morph names only for now. A vertex count would strengthen this but is not
 * available without parsing geometry, so it is deferred rather than guessed.
 */
export interface AnimationElementFingerprint {
  elementName: string;
  morphNames: string[];
}

export interface AnimationChannelManifest {
  version: typeof ANIMATION_CHANNEL_MANIFEST_VERSION;
  entries: AnimationChannelManifestEntry[];
  fingerprints: AnimationElementFingerprint[];
}

/** Marks which lossy transforms a bake applied, for the import-side report. */
export type BakeLossReason =
  | "material-channels-dropped"
  | "morph-cubic-to-linear"
  | "pose-channels-dropped"
  | "stateful-graph-nodes"
  | "keyframes-decimated";

/**
 * Stamped onto every baked glTF animation, in the animation's `extras`.
 *
 * `extras` rather than a custom extension is deliberate: Blender maps extras
 * to custom properties and writes them back, while unknown extensions are
 * dropped. Without this, every Blender pass would look like a brand-new
 * external animation and duplicate clips on each round trip.
 */
export interface BakedClipProvenance {
  /** Authored clip id this was baked from. */
  bakedFrom: string;
  /** Hash of the source `AnimationClipIR`, to detect external edits. */
  bakeHash: string;
  bakedAt: string;
  channelManifestHash: string;
  lossy: BakeLossReason[];
}

export const BAKED_PROVENANCE_EXTRAS_KEY = "vizij" as const;

function sortEntries(
  entries: ReadonlyArray<AnimationChannelManifestEntry>,
): AnimationChannelManifestEntry[] {
  return [...entries].sort((left, right) =>
    left.channel.localeCompare(right.channel),
  );
}

export function createAnimationChannelManifest(options: {
  entries: ReadonlyArray<AnimationChannelManifestEntry>;
  fingerprints: ReadonlyArray<AnimationElementFingerprint>;
}): AnimationChannelManifest {
  return {
    version: ANIMATION_CHANNEL_MANIFEST_VERSION,
    entries: sortEntries(options.entries),
    fingerprints: [...options.fingerprints]
      .map((entry) => ({
        elementName: entry.elementName,
        morphNames: [...entry.morphNames].sort((a, b) => a.localeCompare(b)),
      }))
      .sort((left, right) => left.elementName.localeCompare(right.elementName)),
  };
}

/** Stable hash of a manifest; deterministic across sessions. */
export async function hashAnimationChannelManifest(
  manifest: AnimationChannelManifest,
): Promise<string> {
  return computeObjectHash(manifest);
}

/**
 * A clip reduced to just its animation-relevant content.
 *
 * Deliberately excludes presentational fields (`label`, `color`) and track and
 * keyframe ids, so a re-render or re-id does not read as a different
 * animation. Detached tracks are excluded too, since they never reach the
 * baked output.
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
 * Used for import de-duplication, where an async digest would be awkward and
 * a digest buys nothing: the comparison is local and equality is all that
 * matters. `hashAnimationClipForBake` hashes the same canonical form for
 * provenance, where a short stable value has to travel inside a file.
 */
export function animationClipContentSignature(clip: AnimationClipIR): string {
  return stableStringify(canonicalizeClipContent(clip));
}

/** Hash of a clip's animation-relevant content. */
export async function hashAnimationClipForBake(
  clip: AnimationClipIR,
): Promise<string> {
  return computeObjectHash(canonicalizeClipContent(clip));
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

export function serializeAnimationChannelManifest(
  manifest: AnimationChannelManifest,
): string {
  return stableStringify(manifest);
}

export type ChannelDriftClass =
  | "unchanged"
  | "renamed"
  | "deleted"
  | "added"
  | "collision-shift";

export interface ChannelDriftEntry {
  channel: string;
  classification: ChannelDriftClass;
  /** Candidate replacement channel for `renamed` / `collision-shift`. */
  suggestedChannel?: string;
  detail?: string;
}
