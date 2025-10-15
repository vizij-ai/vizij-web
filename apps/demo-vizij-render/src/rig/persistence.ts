import type { BindingMap, StandardInputValues } from "./state";

const STORAGE_KEY = "vizij:rig-authoring:v1";

interface PersistedRigState {
  faceId: string;
  bindings: BindingMap;
  inputValues: StandardInputValues;
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
