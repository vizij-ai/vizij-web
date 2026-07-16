import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StarredKind = "driver" | "pose";

/**
 * A starred entry is a lightweight *reference* to real functionality (a driver
 * or a pose) identified by its stable id. It is resolved to the live object at
 * render time, so editing the underlying driver/pose is reflected everywhere it
 * is shown.
 */
export interface StarredRef {
  kind: StarredKind;
  id: string;
}

/** Stable string key for set membership / dedup. */
export function starredRefKey(ref: StarredRef): string {
  return `${ref.kind}:${ref.id}`;
}

function dedupeRefs(refs: StarredRef[]): StarredRef[] {
  const seen = new Set<string>();
  const next: StarredRef[] = [];
  for (const ref of refs) {
    const key = starredRefKey(ref);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push({ kind: ref.kind, id: ref.id });
  }
  return next;
}

interface StarredState {
  /** Starred references keyed by faceId. */
  byFace: Record<string, StarredRef[]>;
  toggleStarred: (faceId: string, ref: StarredRef) => void;
  /** Replace the full set for a face (used when importing a glb bundle). */
  setStarredForFace: (faceId: string, refs: StarredRef[]) => void;
  clearFace: (faceId: string) => void;
}

const EMPTY: StarredRef[] = [];

export const useStarredStore = create<StarredState>()(
  persist(
    (set, get) => ({
      byFace: {},
      toggleStarred: (faceId, ref) => {
        if (!faceId) {
          return;
        }
        const key = starredRefKey(ref);
        const current = get().byFace[faceId] ?? EMPTY;
        const exists = current.some((entry) => starredRefKey(entry) === key);
        const next = exists
          ? current.filter((entry) => starredRefKey(entry) !== key)
          : [...current, { kind: ref.kind, id: ref.id }];
        set({ byFace: { ...get().byFace, [faceId]: next } });
      },
      setStarredForFace: (faceId, refs) => {
        if (!faceId) {
          return;
        }
        set({ byFace: { ...get().byFace, [faceId]: dedupeRefs(refs) } });
      },
      clearFace: (faceId) => {
        if (!faceId || !(faceId in get().byFace)) {
          return;
        }
        const next = { ...get().byFace };
        delete next[faceId];
        set({ byFace: next });
      },
    }),
    {
      name: "vizij-starred",
    },
  ),
);

/** Read the starred references for a face (stable empty array when none). */
export function getStarredForFace(
  state: StarredState,
  faceId: string | null | undefined,
): StarredRef[] {
  if (!faceId) {
    return EMPTY;
  }
  return state.byFace[faceId] ?? EMPTY;
}

/** Whether a given ref is starred for a face. */
export function isRefStarred(refs: StarredRef[], ref: StarredRef): boolean {
  const key = starredRefKey(ref);
  return refs.some((entry) => starredRefKey(entry) === key);
}
