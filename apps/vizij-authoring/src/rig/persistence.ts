import type { BindingMap, StandardInputValues } from "./state";
import type { RigBindingDefinition, StandardRigInput } from "@vizij/utils";

const STORAGE_KEY = "vizij:rig-authoring:v2";

export interface PersistedAutoStandardInput {
  id: string;
  path: string;
  sourceId?: string;
  sourcePath?: string;
  group?: string;
  label?: string;
  defaultValue?: number;
  range?: {
    min?: number;
    max?: number;
  };
}

export interface PersistedRigState {
  faceId: string;
  bindings: BindingMap;
  inputValues: StandardInputValues;
  /**
   * Auto-generated standard inputs (persisted as lightweight descriptors).
   * Legacy states may store full StandardRigInput objects here; callers must migrate.
   */
  standardInputs?: PersistedAutoStandardInput[] | StandardRigInput[];
  customStandardInputs?: StandardRigInput[];
  selectedStandardInputRoots?: string[];
  selectedStandardInputSubgroups?: string[];
  featureLabels?: Record<string, string>;
  /** @deprecated retained for backward compatibility with legacy saves */
  derivedStandardInputs?: Record<string, RigBindingDefinition>;
  /** Parent/child binding definitions keyed by standard input id */
  inputBindingDefinitions?: Record<string, RigBindingDefinition>;
  schemaVersion?: number;
}

type PersistedRigStateMap = Record<string, PersistedRigState>;

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readAll(): PersistedRigStateMap {
  const storage = getStorage();
  if (!storage) {
    return {};
  }
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as PersistedRigStateMap;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Ignore malformed data.
  }
  return {};
}

function writeAll(next: PersistedRigStateMap): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / serialization errors.
  }
}

export function loadRigState(faceId: string): PersistedRigState | null {
  const all = readAll();
  return all[faceId] ?? null;
}

export function saveRigState(state: PersistedRigState): void {
  const all = readAll();
  all[state.faceId] = state;
  writeAll(all);
}

export function deleteRigState(faceId: string): void {
  const all = readAll();
  if (!(faceId in all)) {
    return;
  }
  delete all[faceId];
  writeAll(all);
}
