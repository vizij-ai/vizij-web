import type {
  BindingMap,
  StandardInputValues,
} from "@vizij/node-graph-authoring";
import type { RigBindingDefinition, StandardRigInput } from "@vizij/utils";
import {
  migratePersistedRigState,
  RigStateMigrationError,
} from "./legacyMigration";

const STORAGE_KEY = "vizij:rig-authoring:v2";
export const RIG_STATE_SCHEMA_VERSION = 3;

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
  disabledStandardInputIds?: string[];
  hiddenDriverIds?: string[];
  /** @deprecated retained for backward compatibility with legacy saves */
  derivedStandardInputs?: Record<string, RigBindingDefinition>;
  /** Parent/child binding definitions keyed by standard input id */
  inputBindingDefinitions?: Record<string, RigBindingDefinition>;
  featureFlags?: Record<string, boolean>;
  graphInsights?: PersistedGraphInsight;
  schemaVersion?: number;
  standardInputSchema?: { id: string; version: string };
}

export interface PersistedGraphInsight {
  summary: {
    faceId: string;
    inputs: string[];
    outputs: string[];
    bindings: number;
  };
  issues: {
    fatal: string[];
    byTarget: Record<string, string[]>;
  };
  generatedAt: string;
}

type PersistedRigStateMap = Record<string, PersistedRigState>;

export type RigPersistenceOperation = "load" | "save" | "delete";

export type RigPersistenceErrorCode =
  | "storage_unavailable"
  | "storage_read_failed"
  | "storage_write_failed"
  | "storage_parse_failed"
  | "migration_failed"
  | "unsupported_schema_version";

export interface RigPersistenceError {
  code: RigPersistenceErrorCode;
  message: string;
  operation: RigPersistenceOperation;
  faceId?: string;
  cause?: unknown;
}

export type RigPersistenceResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: RigPersistenceError;
    };

function success<T>(value: T): RigPersistenceResult<T> {
  return { ok: true, value };
}

function failure<T>(
  code: RigPersistenceErrorCode,
  message: string,
  operation: RigPersistenceOperation,
  faceId?: string,
  cause?: unknown,
): RigPersistenceResult<T> {
  return {
    ok: false,
    error: { code, message, operation, faceId, cause },
  };
}

function getStorage(
  operation: RigPersistenceOperation,
  faceId?: string,
): RigPersistenceResult<Storage> {
  if (typeof window === "undefined") {
    return failure(
      "storage_unavailable",
      "window is unavailable; rig persistence requires a browser context.",
      operation,
      faceId,
    );
  }
  try {
    return success(window.localStorage);
  } catch (error) {
    return failure(
      "storage_unavailable",
      "localStorage is unavailable in this environment.",
      operation,
      faceId,
      error,
    );
  }
}

function readAll(
  operation: RigPersistenceOperation,
  faceId?: string,
): RigPersistenceResult<PersistedRigStateMap> {
  const storageResult = getStorage(operation, faceId);
  if (!storageResult.ok) {
    return storageResult;
  }
  let raw: string | null;
  try {
    raw = storageResult.value.getItem(STORAGE_KEY);
  } catch (error) {
    return failure(
      "storage_read_failed",
      `Failed to read rig persistence key "${STORAGE_KEY}".`,
      operation,
      faceId,
      error,
    );
  }
  if (!raw) {
    return success({});
  }
  try {
    const parsed = JSON.parse(raw) as PersistedRigStateMap;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return success(parsed);
    }
    return failure(
      "storage_parse_failed",
      `Rig persistence payload for "${STORAGE_KEY}" is not a valid object map.`,
      operation,
      faceId,
      raw,
    );
  } catch (error) {
    return failure(
      "storage_parse_failed",
      `Failed to parse rig persistence payload for "${STORAGE_KEY}" as JSON.`,
      operation,
      faceId,
      error,
    );
  }
}

function writeAll(
  operation: RigPersistenceOperation,
  next: PersistedRigStateMap,
  faceId?: string,
): RigPersistenceResult<void> {
  const storageResult = getStorage(operation, faceId);
  if (!storageResult.ok) {
    return storageResult;
  }
  try {
    storageResult.value.setItem(STORAGE_KEY, JSON.stringify(next));
    return success(undefined);
  } catch (error) {
    return failure(
      "storage_write_failed",
      `Failed to write rig persistence key "${STORAGE_KEY}".`,
      operation,
      faceId,
      error,
    );
  }
}

function mapMigrationError(
  operation: RigPersistenceOperation,
  faceId: string,
  error: unknown,
): RigPersistenceError {
  if (
    error instanceof RigStateMigrationError &&
    error.code === "unsupported_schema_version"
  ) {
    return {
      code: "unsupported_schema_version",
      message: error.message,
      operation,
      faceId,
      cause: error,
    };
  }
  const message =
    error instanceof Error
      ? error.message
      : "Unknown rig state migration failure.";
  return {
    code: "migration_failed",
    message,
    operation,
    faceId,
    cause: error,
  };
}

export function formatRigPersistenceError(error: RigPersistenceError): string {
  switch (error.code) {
    case "storage_unavailable":
      return `Rig persistence is unavailable (${error.message})`;
    case "storage_read_failed":
      return `Failed to read saved rig state (${error.message})`;
    case "storage_write_failed":
      return `Failed to write saved rig state (${error.message})`;
    case "storage_parse_failed":
      return `Saved rig state is malformed (${error.message})`;
    case "unsupported_schema_version":
      return `Saved rig state uses an unsupported schema version (${error.message})`;
    case "migration_failed":
      return `Failed to migrate saved rig state (${error.message})`;
    default:
      return error.message;
  }
}

export function loadRigState(
  faceId: string,
): RigPersistenceResult<PersistedRigState | null> {
  const allResult = readAll("load", faceId);
  if (!allResult.ok) {
    return allResult;
  }
  const persisted = allResult.value[faceId];
  if (!persisted) {
    return success(null);
  }
  if (typeof persisted !== "object" || Array.isArray(persisted)) {
    return failure(
      "storage_parse_failed",
      `Saved rig state for "${faceId}" is not an object payload.`,
      "load",
      faceId,
      persisted,
    );
  }
  try {
    return success(
      migratePersistedRigState(persisted, RIG_STATE_SCHEMA_VERSION),
    );
  } catch (error) {
    return { ok: false, error: mapMigrationError("load", faceId, error) };
  }
}

export function saveRigState(
  state: PersistedRigState,
): RigPersistenceResult<void> {
  const allResult = readAll("save", state.faceId);
  if (!allResult.ok) {
    return allResult;
  }
  allResult.value[state.faceId] = state;
  return writeAll("save", allResult.value, state.faceId);
}

export function deleteRigState(faceId: string): RigPersistenceResult<void> {
  const allResult = readAll("delete", faceId);
  if (!allResult.ok) {
    return allResult;
  }
  if (!(faceId in allResult.value)) {
    return success(undefined);
  }
  delete allResult.value[faceId];
  return writeAll("delete", allResult.value, faceId);
}
