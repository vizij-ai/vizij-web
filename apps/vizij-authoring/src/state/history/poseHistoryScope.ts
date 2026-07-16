import type { PoseRigState, PoseRigStore } from "../../poseRig/store";
import type { HistoryManager, HistorySnapshot } from "./historyStore";

export const POSE_HISTORY_SCOPE_ID = "pose-rig";

/**
 * The pose document fields tracked by history. Live-drive values
 * (`currentValues`) and derived outputs (`poseGraphSpec`, diagnostics) are
 * excluded — the store's setState rebuilds all derived drafts whenever these
 * authoring fields are patched, so restoring them restores everything.
 */
const POSE_DOC_FIELDS = [
  "poses",
  "neutralInputs",
  "neutralMode",
  "rigName",
  "rigKind",
  "blendMode",
  "crossGroupBlendMode",
  "standardInputSchema",
  "hiddenInputIds",
  "poseConfigDraft",
  "poseIrDraft",
  "lastImportedConfig",
] as const;

type PoseDocField = (typeof POSE_DOC_FIELDS)[number];
type PoseHistorySnapshot = HistorySnapshot & Pick<PoseRigState, PoseDocField>;

function capturePoseDoc(state: PoseRigState): PoseHistorySnapshot {
  const snapshot = {} as Record<string, unknown>;
  POSE_DOC_FIELDS.forEach((field) => {
    snapshot[field] = state[field];
  });
  return snapshot as PoseHistorySnapshot;
}

function poseDocChanged(state: PoseRigState, previous: HistorySnapshot) {
  return POSE_DOC_FIELDS.some(
    (field) => !Object.is(state[field], previous[field]),
  );
}

/**
 * Registers the pose rig document (poses, groups, stages, neutral, blend
 * config) as an undo/redo scope over a provider-scoped PoseRigStore.
 */
export function registerPoseHistoryScope(
  history: HistoryManager,
  store: PoseRigStore,
): () => void {
  const unregister = history.registerScope({
    id: POSE_HISTORY_SCOPE_ID,
    capture: () => capturePoseDoc(store.getState()),
    restore: (snapshot) => {
      store.setState(snapshot as Partial<PoseRigState>);
    },
  });

  let lastDoc: PoseHistorySnapshot = capturePoseDoc(store.getState());
  const unsubscribe = store.subscribe(() => {
    const state = store.getState();
    if (poseDocChanged(state, lastDoc)) {
      lastDoc = capturePoseDoc(state);
      history.notifyChange();
    }
  });

  return () => {
    unsubscribe();
    unregister();
  };
}
