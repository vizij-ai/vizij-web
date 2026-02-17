import { normalizeStandardRigInputPath } from "@vizij/utils";

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
