import { normalizeStandardRigInputPath } from "@vizij/utils";

function formatRigFaceId(faceId?: string | null): string {
  const trimmed = faceId?.trim();
  if (!trimmed) {
    return "vizij";
  }
  return trimmed;
}

export function buildRigPathPrefix(faceId?: string | null): string {
  return `rig/${formatRigFaceId(faceId)}`;
}

export function buildRigPathParts(
  path: string,
  faceId?: string | null,
): {
  prefix: string;
  suffix: string;
} {
  const prefix = buildRigPathPrefix(faceId);
  const suffix = normalizeStandardRigInputPath(path);
  return { prefix, suffix };
}

export function formatRigPathLabel(
  path: string,
  faceId?: string | null,
): string {
  const { prefix, suffix } = buildRigPathParts(path, faceId);
  return `${prefix}[${suffix}]`;
}
