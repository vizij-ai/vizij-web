import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";

export function isStandardInputPath(path: string): boolean {
  return path.includes("/standard/");
}

export function buildStandardInputMapByNormalizedPath(
  inputs: Iterable<StandardRigInput>,
): Map<string, StandardRigInput> {
  const byPath = new Map<string, StandardRigInput>();
  for (const input of inputs) {
    if (!isStandardInputPath(input.path)) {
      continue;
    }
    const normalizedPath = normalizeStandardRigInputPath(input.path);
    if (!byPath.has(normalizedPath)) {
      byPath.set(normalizedPath, input);
    }
  }
  return byPath;
}

export function mergeReferenceAndMainStandardInputs(
  referenceInputs: Iterable<StandardRigInput>,
  mainInputs: Iterable<StandardRigInput>,
): Map<string, StandardRigInput> {
  const byPath = buildStandardInputMapByNormalizedPath(referenceInputs);
  for (const input of mainInputs) {
    if (!isStandardInputPath(input.path)) {
      continue;
    }
    const normalizedPath = normalizeStandardRigInputPath(input.path);
    if (!byPath.has(normalizedPath)) {
      byPath.set(normalizedPath, input);
    }
  }
  return byPath;
}

export function buildNormalizedPathSet(
  inputs: Iterable<StandardRigInput>,
): Set<string> {
  const paths = new Set<string>();
  for (const input of inputs) {
    paths.add(normalizeStandardRigInputPath(input.path));
  }
  return paths;
}
