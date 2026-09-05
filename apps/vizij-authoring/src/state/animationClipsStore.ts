import { create } from "zustand";
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

export interface AnimationClipsState {
  entries: Readonly<Record<string, AnimationClipEntry>>;
  /** Display order; authored clips first, matching the existing UI. */
  order: readonly string[];
  selectedClipId: string | null;

  selectClip: (clipId: string | null) => void;
  addClip: (entry: Omit<AnimationClipEntry, "targetId">) => void;
  removeClip: (clipId: string) => void;
  renameClip: (clipId: string, name: string) => void;
  /**
   * The only way to change clip data. Applies to the selected clip, so an edit
   * cannot be misrouted to a clip the user is not looking at.
   */
  updateSelectedClip: (
    updater: (clip: AnimationClipIR) => AnimationClipIR,
  ) => void;
  replaceAll: (
    entries: ReadonlyArray<Omit<AnimationClipEntry, "targetId">>,
    selectedClipId?: string | null,
  ) => void;
  reset: () => void;
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

function withTargetId(
  entry: Omit<AnimationClipEntry, "targetId">,
): AnimationClipEntry {
  return { ...entry, targetId: clipTargetId(entry.clipId, entry.source) };
}

const INITIAL: Pick<
  AnimationClipsState,
  "entries" | "order" | "selectedClipId"
> = {
  entries: {},
  order: [],
  selectedClipId: null,
};

export const useAnimationClipsStore = create<AnimationClipsState>(
  (set, get) => ({
    ...INITIAL,

    selectClip: (clipId) =>
      set((state) => {
        if (clipId !== null && !state.entries[clipId]) {
          // Selecting a clip that does not exist would leave the selection and
          // the data disagreeing, which is the whole class of bug this store
          // exists to prevent. Refuse rather than fall back to another clip.
          return state;
        }
        if (state.selectedClipId === clipId) {
          return state;
        }
        return { ...state, selectedClipId: clipId };
      }),

    addClip: (entry) =>
      set((state) => {
        if (state.entries[entry.clipId]) {
          return state;
        }
        const entries = {
          ...state.entries,
          [entry.clipId]: withTargetId(entry),
        };
        return { ...state, entries, order: sortedOrder(entries) };
      }),

    removeClip: (clipId) =>
      set((state) => {
        if (!state.entries[clipId]) {
          return state;
        }
        const entries = { ...state.entries };
        delete entries[clipId];
        const order = sortedOrder(entries);
        return {
          ...state,
          entries,
          order,
          selectedClipId:
            state.selectedClipId === clipId
              ? (order[0] ?? null)
              : state.selectedClipId,
        };
      }),

    renameClip: (clipId, name) =>
      set((state) => {
        const entry = state.entries[clipId];
        if (!entry || entry.name === name) {
          return state;
        }
        return {
          ...state,
          entries: {
            ...state.entries,
            [clipId]: { ...entry, name, clip: { ...entry.clip, name } },
          },
        };
      }),

    updateSelectedClip: (updater) =>
      set((state) => {
        const clipId = state.selectedClipId;
        if (!clipId) {
          return state;
        }
        const entry = state.entries[clipId];
        if (!entry) {
          return state;
        }
        const nextClip = updater(entry.clip);
        if (nextClip === entry.clip) {
          return state;
        }
        // The clip's own id is not the updater's to change: it is the identity
        // the entry is keyed by, and letting an edit rewrite it would make the
        // map and the entry disagree.
        return {
          ...state,
          entries: {
            ...state.entries,
            [clipId]: { ...entry, clip: { ...nextClip, id: clipId } },
          },
        };
      }),

    replaceAll: (nextEntries, selectedClipId) =>
      set((state) => {
        const entries: Record<string, AnimationClipEntry> = {};
        for (const entry of nextEntries) {
          entries[entry.clipId] = withTargetId(entry);
        }
        const order = sortedOrder(entries);
        const requested =
          selectedClipId === undefined ? state.selectedClipId : selectedClipId;
        return {
          ...state,
          entries,
          order,
          selectedClipId:
            requested && entries[requested] ? requested : (order[0] ?? null),
        };
      }),

    reset: () => set(() => ({ ...INITIAL })),
  }),
);

/** The selected entry, or null. A selector so components resubscribe correctly. */
export function selectSelectedEntry(
  state: AnimationClipsState,
): AnimationClipEntry | null {
  return state.selectedClipId
    ? (state.entries[state.selectedClipId] ?? null)
    : null;
}

/** Entries in display order. */
export function selectOrderedEntries(
  state: AnimationClipsState,
): AnimationClipEntry[] {
  return state.order
    .map((clipId) => state.entries[clipId])
    .filter((entry): entry is AnimationClipEntry => Boolean(entry));
}
