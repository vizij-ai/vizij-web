import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
} from "../types/animationClipIr";

/**
 * One owner for every animation clip and for which one is selected.
 *
 * The bugs this replaces all had the same shape: the clip being *edited* lived
 * in one store and the *saved* copies in another, with an effect copying
 * between them. The destination of that copy was computed separately from the
 * data being copied, so any moment where the two disagreed wrote the wrong
 * clip — producing, at different times, a new clip holding another clip's
 * tracks, every clip emptied, and edits appearing not to save.
 *
 * Here there is no copy to get wrong. `entries` holds the single instance of
 * each clip's data, edits address `selectedClipId`, and switching is one
 * `set()` — so no render can observe a state where selection and data refer to
 * different clips.
 *
 * See docs/notes/ANIMATION_SELECTION_STATE_2026-09-03.md.
 */

/** Where a clip came from. Export needs this; it is not implied by storage. */
export type AnimationClipSource = "authored" | "imported";

export interface AnimationClipEntry {
  /** Identity everywhere: saving, hydration, export, dedupe. */
  clipId: string;
  /** Stable id for UI selection, derived from `clipId` and its source. */
  targetId: string;
  name: string;
  source: AnimationClipSource;
  /**
   * For an imported clip, the clip as the bundle shipped it. Retained so an
   * edited import can be compared against its origin without a second map of
   * overrides — the arrangement that made "is this edited?" ambiguous.
   */
  baseline: AnimationClipIR | null;
  /** The single instance of this clip's data. */
  clip: AnimationClipIR;
}

export const AUTHORED_CLIP_TARGET_PREFIX = "authored-animation:";
export const IMPORTED_CLIP_TARGET_PREFIX = "bundle-animation:";

export function clipTargetId(
  clipId: string,
  source: AnimationClipSource,
): string {
  const prefix =
    source === "authored"
      ? AUTHORED_CLIP_TARGET_PREFIX
      : IMPORTED_CLIP_TARGET_PREFIX;
  return `${prefix}${clipId}`;
}

/**
 * Next free `authoring.timeline.clip.N` ordinal.
 *
 * Takes every reserved id, imported included: bundle clips use this same
 * scheme because they were exported from this app, and a collision makes two
 * entries share the identity that saving, hydration and export all key on.
 */
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

export function createEmptyClip(
  clipId: string,
  name: string,
  duration = 10,
): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: clipId,
    name,
    duration,
    tracks: [],
  };
}

/** Ordering rule, kept in one place: authored first, then imported. */
function sortedOrder(entries: Record<string, AnimationClipEntry>): string[] {
  const authored: string[] = [];
  const imported: string[] = [];
  for (const entry of Object.values(entries)) {
    (entry.source === "authored" ? authored : imported).push(entry.clipId);
  }
  return [...authored, ...imported];
}

/**
 * An entry as callers supply it: the target id may be given explicitly, and is
 * derived from the clip id otherwise.
 *
 * Imported clips need the explicit form. Their target ids are index-based and
 * scoped to the loaded face (`bundle-animation:<rootId>:<index>`), which is
 * what invalidates them when a different face loads — deriving one from the
 * clip id instead would silently change identity for every imported clip, and
 * with it the keys of everything else stored against a target.
 */
export type AnimationClipEntryInput = Omit<AnimationClipEntry, "targetId"> & {
  targetId?: string;
};

function withTargetId(entry: AnimationClipEntryInput): AnimationClipEntry {
  return {
    ...entry,
    targetId: entry.targetId ?? clipTargetId(entry.clipId, entry.source),
  };
}

/**
 * The clip set and which clip is selected, as pure reducers.
 *
 * These are owned by `animationStore` rather than living in a store of their
 * own: switching clips has to materialise the editing buffer into the outgoing
 * entry and load the incoming one in the *same* `set()`. Split across two
 * stores that is two updates, and the window between them is exactly where
 * every clip-corruption bug in this codebase has lived.
 */
export interface ClipSetState {
  clipEntries: Readonly<Record<string, AnimationClipEntry>>;
  clipOrder: readonly string[];
  selectedClipId: string | null;
}

export const EMPTY_CLIP_SET: ClipSetState = {
  clipEntries: {},
  clipOrder: [],
  selectedClipId: null,
};

export function addClipEntry(
  state: ClipSetState,
  entry: AnimationClipEntryInput,
): ClipSetState {
  if (state.clipEntries[entry.clipId]) {
    return state;
  }
  const clipEntries = {
    ...state.clipEntries,
    [entry.clipId]: withTargetId(entry),
  };
  return { ...state, clipEntries, clipOrder: sortedOrder(clipEntries) };
}

export function removeClipEntry(
  state: ClipSetState,
  clipId: string,
): ClipSetState {
  if (!state.clipEntries[clipId]) {
    return state;
  }
  const clipEntries = { ...state.clipEntries };
  delete clipEntries[clipId];
  const clipOrder = sortedOrder(clipEntries);
  return {
    ...state,
    clipEntries,
    clipOrder,
    selectedClipId:
      state.selectedClipId === clipId
        ? (clipOrder[0] ?? null)
        : state.selectedClipId,
  };
}

export function renameClipEntry(
  state: ClipSetState,
  clipId: string,
  name: string,
): ClipSetState {
  const entry = state.clipEntries[clipId];
  if (!entry || entry.name === name) {
    return state;
  }
  return {
    ...state,
    clipEntries: {
      ...state.clipEntries,
      [clipId]: { ...entry, name, clip: { ...entry.clip, name } },
    },
  };
}

/** Write `clip` into `clipId`'s entry, pinning the entry's identity. */
export function commitClipEntry(
  state: ClipSetState,
  clipId: string,
  clip: AnimationClipIR,
): ClipSetState {
  const entry = state.clipEntries[clipId];
  if (!entry) {
    return state;
  }
  return {
    ...state,
    clipEntries: {
      ...state.clipEntries,
      [clipId]: { ...entry, clip: { ...clip, id: clipId } },
    },
  };
}

export function replaceClipEntries(
  state: ClipSetState,
  entries: ReadonlyArray<AnimationClipEntryInput>,
  selectedClipId?: string | null,
): ClipSetState {
  const clipEntries: Record<string, AnimationClipEntry> = {};
  for (const entry of entries) {
    clipEntries[entry.clipId] = withTargetId(entry);
  }
  const clipOrder = sortedOrder(clipEntries);
  const requested =
    selectedClipId === undefined ? state.selectedClipId : selectedClipId;
  return {
    ...state,
    clipEntries,
    clipOrder,
    selectedClipId:
      requested && clipEntries[requested] ? requested : (clipOrder[0] ?? null),
  };
}

/** Ordered entries, for lists and export. */
export function orderedClipEntries(state: ClipSetState): AnimationClipEntry[] {
  return state.clipOrder
    .map((clipId) => state.clipEntries[clipId])
    .filter((entry): entry is AnimationClipEntry => Boolean(entry));
}

export function selectedClipEntry(
  state: ClipSetState,
): AnimationClipEntry | null {
  return state.selectedClipId
    ? (state.clipEntries[state.selectedClipId] ?? null)
    : null;
}
