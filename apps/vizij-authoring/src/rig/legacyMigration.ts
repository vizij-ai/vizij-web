import {
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  normalizeStandardRigInputPath,
  stripStandardInputPathPrefix,
} from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import type {
  PersistedAutoStandardInput,
  PersistedRigState,
} from "./persistence";

export const RIG_STATE_INITIAL_SCHEMA_VERSION = 1;

interface RigStateMigrationStep {
  fromVersion: number;
  toVersion: number;
  migrate: (state: PersistedRigState) => PersistedRigState;
}

const RIG_STATE_MIGRATIONS: RigStateMigrationStep[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (state) => {
      const bindingDefinitions =
        state.inputBindingDefinitions ?? state.derivedStandardInputs;
      return {
        ...state,
        inputBindingDefinitions: bindingDefinitions,
        schemaVersion: 2,
      };
    },
  },
  {
    fromVersion: 2,
    toVersion: 3,
    migrate: (state) => {
      const bindingDefinitions =
        state.inputBindingDefinitions ?? state.derivedStandardInputs;
      return {
        ...state,
        inputBindingDefinitions: bindingDefinitions,
        derivedStandardInputs:
          state.derivedStandardInputs ?? bindingDefinitions,
        schemaVersion: 3,
      };
    },
  },
];

const MIGRATION_STEP_BY_VERSION = new Map<number, RigStateMigrationStep>(
  RIG_STATE_MIGRATIONS.map((step) => [step.fromVersion, step]),
);

export class RigStateMigrationError extends Error {
  readonly code:
    | "invalid_schema_version"
    | "unsupported_schema_version"
    | "missing_migration_step";
  readonly schemaVersion: number;
  readonly targetVersion: number;

  constructor(
    code:
      | "invalid_schema_version"
      | "unsupported_schema_version"
      | "missing_migration_step",
    schemaVersion: number,
    targetVersion: number,
    detail?: string,
  ) {
    const message =
      detail ??
      `Rig state migration error (${code}): cannot migrate from schema v${schemaVersion} to v${targetVersion}.`;
    super(message);
    this.name = "RigStateMigrationError";
    this.code = code;
    this.schemaVersion = schemaVersion;
    this.targetVersion = targetVersion;
  }
}

function resolveSchemaVersion(
  state: PersistedRigState,
): number | RigStateMigrationError {
  const raw = state.schemaVersion;
  if (raw === undefined || raw === null) {
    return RIG_STATE_INITIAL_SCHEMA_VERSION;
  }
  if (!Number.isInteger(raw) || raw < RIG_STATE_INITIAL_SCHEMA_VERSION) {
    return new RigStateMigrationError(
      "invalid_schema_version",
      Number(raw),
      RIG_STATE_INITIAL_SCHEMA_VERSION,
      `Rig state schemaVersion must be an integer >= ${RIG_STATE_INITIAL_SCHEMA_VERSION}. Received: ${String(raw)}.`,
    );
  }
  return raw;
}

export function migratePersistedRigState(
  state: PersistedRigState,
  targetVersion: number,
): PersistedRigState {
  const resolvedVersion = resolveSchemaVersion(state);
  if (resolvedVersion instanceof RigStateMigrationError) {
    throw resolvedVersion;
  }
  if (resolvedVersion > targetVersion) {
    throw new RigStateMigrationError(
      "unsupported_schema_version",
      resolvedVersion,
      targetVersion,
      `Rig state schema v${resolvedVersion} is newer than supported v${targetVersion}.`,
    );
  }

  let migrated: PersistedRigState = {
    ...state,
    schemaVersion: resolvedVersion,
  };
  let version = resolvedVersion;
  while (version < targetVersion) {
    const step = MIGRATION_STEP_BY_VERSION.get(version);
    if (!step || step.toVersion !== version + 1) {
      throw new RigStateMigrationError(
        "missing_migration_step",
        version,
        targetVersion,
        `No migration step registered for v${version} -> v${version + 1}.`,
      );
    }
    migrated = step.migrate(migrated);
    version = step.toVersion;
  }

  if (migrated.schemaVersion !== targetVersion) {
    migrated = { ...migrated, schemaVersion: targetVersion };
  }
  return migrated;
}

export function resolvePersistedAutoKey(
  sourceId?: string | null,
  sourcePath?: string | null,
): string | null {
  if (sourceId && sourceId.length > 0) {
    return sourceId;
  }
  if (sourcePath && sourcePath.length > 0) {
    return normalizeStandardRigInputPath(sourcePath);
  }
  return null;
}

export function normalizePersistedStandardInputs(
  standardInputs: (PersistedAutoStandardInput | StandardRigInput)[] | undefined,
): {
  autoEntries: Map<string, PersistedAutoStandardInput>;
  legacyCustomInputs: StandardRigInput[];
  idMismatches: string[];
} {
  const autoEntries = new Map<string, PersistedAutoStandardInput>();
  const legacyCustomInputs: StandardRigInput[] = [];
  const idMismatches: string[] = [];

  if (!Array.isArray(standardInputs)) {
    return { autoEntries, legacyCustomInputs, idMismatches };
  }

  standardInputs.forEach((entry) => {
    if (
      entry &&
      typeof entry === "object" &&
      "range" in entry &&
      "defaultValue" in entry &&
      !("sourcePath" in entry)
    ) {
      const legacyDescriptor = entry as StandardRigInput;
      const normalized = createStandardRigInput(legacyDescriptor);
      if (legacyDescriptor.id && legacyDescriptor.id !== normalized.id) {
        idMismatches.push(
          `${legacyDescriptor.id} → ${normalized.id} (${normalized.path})`,
        );
      }
      legacyCustomInputs.push(normalized);
      return;
    }

    const descriptor = entry as PersistedAutoStandardInput;
    const rawSourcePath = descriptor.sourcePath ?? descriptor.path;
    const normalizedSourcePath = normalizeStandardRigInputPath(
      rawSourcePath ?? "/custom/input",
    );
    const canonicalSourcePath =
      stripStandardInputPathPrefix(normalizedSourcePath);
    const rawPath = descriptor.path ?? descriptor.sourcePath ?? "/custom/input";
    const normalizedPath = normalizeStandardRigInputPath(rawPath);
    const canonicalPath = stripStandardInputPathPrefix(normalizedPath);
    const canonicalId = createStandardRigInputFromPath(canonicalPath).id;
    const resolvedId = descriptor.id ?? canonicalId;
    if (descriptor.id && resolvedId && descriptor.id !== resolvedId) {
      idMismatches.push(`${descriptor.id} → ${resolvedId} (${canonicalPath})`);
    }
    const derivedGroup = deriveGroupFromNormalizedPath(canonicalPath);
    let resolvedGroup: string;
    if (descriptor.group && descriptor.group !== "standard") {
      resolvedGroup = descriptor.group;
    } else if (derivedGroup && derivedGroup !== "standard") {
      resolvedGroup = derivedGroup;
    } else {
      const fallback =
        descriptor.group && descriptor.group.length > 0
          ? descriptor.group
          : derivedGroup;
      resolvedGroup =
        !fallback || fallback === "standard" ? "custom" : fallback;
    }

    const persistedKey = resolvePersistedAutoKey(
      descriptor.sourceId,
      canonicalSourcePath,
    );
    if (!persistedKey) {
      return;
    }

    autoEntries.set(persistedKey, {
      id: resolvedId,
      path: canonicalPath,
      sourceId: descriptor.sourceId,
      sourcePath: canonicalSourcePath,
      group: resolvedGroup,
      label: descriptor.label,
      defaultValue: descriptor.defaultValue,
      range: descriptor.range,
    });
  });

  return { autoEntries, legacyCustomInputs, idMismatches };
}
