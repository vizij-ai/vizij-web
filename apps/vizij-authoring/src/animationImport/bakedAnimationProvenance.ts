import type { GltfAnimationEntry } from "./gltfAnimationDocument";

/**
 * What to do with a glTF animation found in a file that also carries a Vizij
 * bundle.
 *
 * Export deliberately writes each clip twice: losslessly into
 * `VIZIJ_bundle.animations`, and baked into glTF animation channels so Blender
 * and other viewers see the motion. Loading our own export therefore offers the
 * same clip from two directions, and importing both is how two clips became
 * three.
 *
 * Skipping every baked animation would be wrong the other way: the whole point
 * of baking is that someone can open the GLB in Blender and change it. An
 * animation that no longer matches what we baked is *new information*, and
 * discarding it silently would lose their work.
 *
 * So the decision turns on whether the baked copy still matches what we wrote,
 * which export records as a fingerprint per animation.
 */

export type BakedAnimationDisposition =
  /** The bundle carries this clip and the baked copy is unchanged. */
  | { kind: "skip-duplicate"; clipId: string }
  /**
   * The bundle carries this clip but the baked copy differs — edited outside
   * Vizij. Both are kept: the authored clip is the lossless original, the
   * imported one is what the file now says, and only the user can say which
   * they meant.
   */
  | { kind: "keep-both-edited"; clipId: string }
  /** Nothing in the bundle claims this animation; import it normally. */
  | { kind: "import-new" };

/** What export recorded about one animation it baked. */
export interface BakedAnimationRecord {
  /** Bundle clip this animation was baked from. */
  clipId: string;
  /**
   * Fingerprint of the baked animation as written, when export could record
   * one. Optional because an export-time fingerprint cannot currently be made
   * to match an import-time one: `GLTFExporter` merges morph tracks into a
   * single `weights` channel, and values round-trip through float32. Without
   * it a name match is treated as a duplicate — which keeps the round trip
   * stable but cannot notice an edit made elsewhere.
   */
  fingerprint?: string;
}

/**
 * Content fingerprint of a glTF animation.
 *
 * Covers what a consumer could change: which node and property each curve
 * drives, its interpolation, and its sampled values. Deliberately ignores
 * animation *name* and curve order, so a reordering export does not read as an
 * edit. Values are rounded, because a float round-trip through a GLB is not
 * bit-exact and near-identical curves must not read as edits.
 */
export function gltfAnimationFingerprint(
  animation: Pick<GltfAnimationEntry, "curves">,
): string {
  const round = (value: number) =>
    Number.isFinite(value) ? Math.round(value * 1e5) / 1e5 : 0;
  const curves = animation.curves
    .map((curve) =>
      [
        curve.nodeName,
        curve.path,
        curve.interpolation,
        curve.stride,
        curve.times.map(round).join(","),
        curve.values.map(round).join(","),
      ].join("|"),
    )
    .sort();
  return curves.join("\n");
}

/**
 * Records from the loaded bundle, indexed both ways.
 *
 * Position is the primary identity: it is unique by construction, whereas a
 * clip name is not — nothing stops two clips sharing one, and import takes
 * names from the file. A name-keyed lookup silently kept only the last of a
 * duplicate pair, which reopened the two-clips-out-three-back bug these
 * records exist to prevent.
 *
 * The name index remains as a fallback, for bundles written before the index
 * was recorded and for files an editor has reordered. A name shared by more
 * than one record resolves to `null`: ambiguous, so it does not match at all
 * and the animation imports as new. That errs toward an extra clip rather
 * than toward dropping one, which is the recoverable direction.
 */
export interface BakedAnimationRecords {
  byIndex: ReadonlyMap<number, BakedAnimationRecord>;
  byName: ReadonlyMap<string, BakedAnimationRecord | null>;
}

/**
 * Decide what to do with one glTF animation, given what export recorded.
 *
 * A rename *and* a reorder together read as a new animation — correct, since
 * nothing then identifies it as the same clip, and importing it loses nothing.
 */
export function classifyGltfAnimation(options: {
  animation: Pick<GltfAnimationEntry, "name" | "index" | "curves">;
  bakedRecords: BakedAnimationRecords;
}): BakedAnimationDisposition {
  const record =
    options.bakedRecords.byIndex.get(options.animation.index) ??
    options.bakedRecords.byName.get(options.animation.name) ??
    null;
  if (!record) {
    return { kind: "import-new" };
  }
  if (record.fingerprint === undefined) {
    // No fingerprint recorded, so an edit is undetectable. Treating it as a
    // duplicate keeps the round trip stable; the alternative — importing every
    // baked animation — is the two-clips-in-three-clips-out bug.
    return { kind: "skip-duplicate", clipId: record.clipId };
  }
  const fingerprint = gltfAnimationFingerprint(options.animation);
  return fingerprint === record.fingerprint
    ? { kind: "skip-duplicate", clipId: record.clipId }
    : { kind: "keep-both-edited", clipId: record.clipId };
}

/** Nothing recorded: every animation imports normally. */
export const EMPTY_BAKED_ANIMATION_RECORDS: BakedAnimationRecords = {
  byIndex: new Map(),
  byName: new Map(),
};

/** Build the lookups from whatever the bundle recorded, tolerating junk. */
export function readBakedAnimationRecords(raw: unknown): BakedAnimationRecords {
  const byIndex = new Map<number, BakedAnimationRecord>();
  const byName = new Map<string, BakedAnimationRecord | null>();
  if (!Array.isArray(raw)) {
    return { byIndex, byName };
  }
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const { animationIndex, animationName, clipId, fingerprint } =
      entry as Record<string, unknown>;
    if (typeof clipId !== "string" || clipId.length === 0) {
      continue;
    }
    const record: BakedAnimationRecord = {
      clipId,
      ...(typeof fingerprint === "string" ? { fingerprint } : {}),
    };
    if (Number.isInteger(animationIndex)) {
      byIndex.set(animationIndex as number, record);
    }
    if (typeof animationName === "string" && animationName.length > 0) {
      // Second sighting of a name makes it ambiguous, and it stays that way.
      byName.set(animationName, byName.has(animationName) ? null : record);
    }
  }
  return { byIndex, byName };
}
