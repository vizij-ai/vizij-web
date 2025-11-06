import {
  STANDARD_RIG_INPUTS,
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  normalizeStandardRigInputPath,
  stripStandardInputPathPrefix,
} from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import type { PersistedAutoStandardInput } from "./persistence";

const STANDARD_BLUEPRINT_PATHS = new Set(
  STANDARD_RIG_INPUTS.map((input) => normalizeStandardRigInputPath(input.path)),
);

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
    const isPresetBlueprint =
      STANDARD_BLUEPRINT_PATHS.has(normalizedSourcePath);
    const canonicalSourcePath = isPresetBlueprint
      ? normalizedSourcePath
      : stripStandardInputPathPrefix(normalizedSourcePath);
    const rawPath = descriptor.path ?? descriptor.sourcePath ?? "/custom/input";
    const normalizedPath = normalizeStandardRigInputPath(rawPath);
    const canonicalPath = isPresetBlueprint
      ? normalizedPath
      : stripStandardInputPathPrefix(normalizedPath);
    const canonicalId = createStandardRigInputFromPath(canonicalPath).id;
    const resolvedId = descriptor.id ?? canonicalId;
    if (descriptor.id && resolvedId && descriptor.id !== resolvedId) {
      idMismatches.push(`${descriptor.id} → ${resolvedId} (${canonicalPath})`);
    }
    const derivedGroup = deriveGroupFromNormalizedPath(canonicalPath);
    let resolvedGroup: string;
    if (isPresetBlueprint) {
      resolvedGroup =
        descriptor.group && descriptor.group.length > 0
          ? descriptor.group
          : "standard";
    } else if (descriptor.group && descriptor.group !== "standard") {
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
