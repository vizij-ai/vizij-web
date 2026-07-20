import type { PoseRigConfigFile, PoseRigIrFile } from "../poseRig/types";
import type { AnimationClipIR } from "../types/animationClipIr";
import { stableStringify } from "../utils/hash";

/**
 * The local working save: Save persists the authored document (expressions,
 * animations, behaviors) to localStorage so a reload restores in-progress
 * work, distinct from Publish which produces the shareable Face Package GLB.
 *
 * The rig document is intentionally not part of this payload — it is already
 * auto-persisted per face by useRigPersistence. Behaviors are stored as
 * editor snapshots (nodes/edges/IO sets), not compiled specs, so a restore
 * is lossless for further editing.
 */

export const WORKING_SAVE_VERSION = 1;
const STORAGE_PREFIX = "vizij-authoring:working-save:v1:";

export interface WorkingSaveBehaviorSnapshotV1 {
  nodes: unknown[];
  edges: unknown[];
  enabledOutputs: string[];
  enabledInputs: string[];
  customInputPaths: string[];
}

export interface WorkingSaveBehaviorV1 {
  programId: string;
  name: string;
  snapshot: WorkingSaveBehaviorSnapshotV1;
}

export interface WorkingSaveDocumentV1 {
  version: typeof WORKING_SAVE_VERSION;
  faceId: string;
  savedAt: string;
  pose: {
    config: PoseRigConfigFile | null;
    ir: PoseRigIrFile | null;
  };
  animations: AnimationClipIR[];
  behaviors: WorkingSaveBehaviorV1[];
}

export type WorkingSaveContent = Omit<
  WorkingSaveDocumentV1,
  "version" | "savedAt"
>;

function storageKey(faceId: string): string {
  return `${STORAGE_PREFIX}${faceId}`;
}

function resolveStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Deterministic signature of the working document content (excluding
 * savedAt), used for dirty tracking: dirty = current signature differs from
 * the last saved signature.
 */
export function buildWorkingSignature(content: WorkingSaveContent): string {
  return stableStringify({
    faceId: content.faceId,
    pose: content.pose,
    animations: content.animations,
    behaviors: content.behaviors,
  });
}

export function saveWorkingDocument(
  content: WorkingSaveContent,
): WorkingSaveDocumentV1 | null {
  const storage = resolveStorage();
  const document: WorkingSaveDocumentV1 = {
    version: WORKING_SAVE_VERSION,
    savedAt: new Date().toISOString(),
    ...content,
  };
  if (!storage || !content.faceId.trim()) {
    return null;
  }
  try {
    storage.setItem(storageKey(content.faceId), JSON.stringify(document));
    return document;
  } catch {
    // Quota exceeded or serialization failure — treat as no save.
    return null;
  }
}

export function loadWorkingDocument(
  faceId: string,
): WorkingSaveDocumentV1 | null {
  const storage = resolveStorage();
  if (!storage || !faceId.trim()) {
    return null;
  }
  const raw = storage.getItem(storageKey(faceId));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WorkingSaveDocumentV1>;
    if (
      parsed?.version !== WORKING_SAVE_VERSION ||
      typeof parsed.faceId !== "string" ||
      typeof parsed.savedAt !== "string" ||
      !parsed.pose ||
      !Array.isArray(parsed.animations) ||
      !Array.isArray(parsed.behaviors)
    ) {
      return null;
    }
    return parsed as WorkingSaveDocumentV1;
  } catch {
    return null;
  }
}

export function clearWorkingDocument(faceId: string): void {
  const storage = resolveStorage();
  if (!storage || !faceId.trim()) {
    return;
  }
  storage.removeItem(storageKey(faceId));
}
