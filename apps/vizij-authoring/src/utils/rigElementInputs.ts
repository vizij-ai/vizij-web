import type { StandardRigInput } from "@vizij/utils";
import {
  applyStandardInputPathPrefix,
  deriveStandardRigInputIdFromPath,
  normalizeStandardRigInputPath,
} from "@vizij/utils";

export const RIG_ELEMENT_INPUT_PATH_PREFIX = "/rig/element";

export function isRigElementStandardInputPath(
  path: string | null | undefined,
): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path);
  return normalized.startsWith(RIG_ELEMENT_INPUT_PATH_PREFIX);
}

export function isRigElementStandardInputPathList(
  paths: Array<string | null | undefined>,
): boolean {
  return paths.some((path) => isRigElementStandardInputPath(path));
}

export function resolveRigMetadataInputId(
  selectedRigId: string,
  standardInputsById?: Map<string, StandardRigInput>,
): string {
  if (!selectedRigId) {
    return selectedRigId;
  }

  if (!standardInputsById || standardInputsById.size === 0) {
    return selectedRigId;
  }

  if (standardInputsById.has(selectedRigId)) {
    return selectedRigId;
  }

  const normalizedInput = normalizeStandardRigInputPath(selectedRigId);
  const normalizedCandidates = new Set<string>([
    selectedRigId,
    normalizedInput,
    applyStandardInputPathPrefix(normalizedInput),
  ]);

  normalizedCandidates.add(deriveStandardRigInputIdFromPath(normalizedInput));
  normalizedCandidates.add(
    deriveStandardRigInputIdFromPath(
      applyStandardInputPathPrefix(normalizedInput),
    ),
  );

  if (selectedRigId.startsWith("rig_element_")) {
    const suffixPath = selectedRigId.replace(/^rig[_-]element[_-]/i, "");
    const normalizedSuffix = normalizeStandardRigInputPath(suffixPath);
    normalizedCandidates.add(suffixPath);
    normalizedCandidates.add(normalizedSuffix);
    normalizedCandidates.add(applyStandardInputPathPrefix(normalizedSuffix));
    normalizedCandidates.add(
      deriveStandardRigInputIdFromPath(normalizedSuffix),
    );
    normalizedCandidates.add(
      deriveStandardRigInputIdFromPath(
        applyStandardInputPathPrefix(normalizedSuffix),
      ),
    );
  }

  for (const candidate of normalizedCandidates) {
    if (standardInputsById.has(candidate)) {
      return candidate;
    }
  }

  const pathCandidates = Array.from(normalizedCandidates).map((value) =>
    normalizeStandardRigInputPath(value),
  );

  for (const [canonicalId, input] of standardInputsById.entries()) {
    const canonicalPath = normalizeStandardRigInputPath(input.path);
    const canonicalStandardPath = applyStandardInputPathPrefix(canonicalPath);
    if (
      pathCandidates.includes(canonicalPath) ||
      pathCandidates.includes(canonicalStandardPath)
    ) {
      return canonicalId;
    }
  }

  return selectedRigId;
}
