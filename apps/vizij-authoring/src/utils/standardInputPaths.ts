import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import { normalizeGraphPath } from "./graphPaths";

function buildStandardPathFromRigRemainder(
  remainder: string | undefined,
): string {
  const clean = remainder?.replace(/^\/+/g, "") ?? "";
  if (!clean) {
    return "/standard";
  }
  if (clean === "standard" || clean.startsWith("standard/")) {
    return clean.startsWith("standard/") ? `/${clean}` : "/standard";
  }
  return `/standard/${clean}`;
}

export function inferStandardSuggestion(
  path: string | null,
  standardInputs: StandardRigInput[],
): string | null {
  if (!path) {
    return null;
  }
  const canonicalSet = new Set(
    standardInputs.map((input) => normalizeStandardRigInputPath(input.path)),
  );
  const normalized = normalizeGraphPath(path);
  if (!normalized) {
    return null;
  }
  if (canonicalSet.has(normalizeStandardRigInputPath(path))) {
    return normalizeStandardRigInputPath(path);
  }
  const rigMatch = normalized.match(/^rig\/[^/]+\/(.+)$/);
  if (rigMatch) {
    const candidate = buildStandardPathFromRigRemainder(rigMatch[1]);
    const canonical = normalizeStandardRigInputPath(candidate);
    if (canonicalSet.has(canonical)) {
      return canonical;
    }
    return candidate;
  }
  return null;
}

export function ensureStandardPathInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.length) {
    return trimmed;
  }
  const normalized = normalizeGraphPath(trimmed);
  const normalizedNoSlash = normalized?.replace(/^\/+/g, "");
  if (normalizedNoSlash?.startsWith("rig/")) {
    const rigMatch = normalizedNoSlash.match(/^rig\/[^/]+\/(.+)$/);
    return normalizeStandardRigInputPath(
      buildStandardPathFromRigRemainder(rigMatch?.[1]),
    );
  }
  return normalizeStandardRigInputPath(
    trimmed.startsWith("/") ? trimmed : `/${trimmed}`,
  );
}
