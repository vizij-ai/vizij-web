export type RigInputGroup = string;

export interface StandardRigInput {
  id: string;
  /**
   * Stable typed path segment appended to `rig/<faceId>/`.
   */
  path: string;
  /**
   * Human readable label shown in the mapping UI.
   */
  label: string;
  group: RigInputGroup;
  defaultValue: number;
  /**
   * Suggested domain for the incoming standard rig values. Authors can override these.
   */
  range: {
    min: number;
    max: number;
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeStandardRigInputPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) {
    return "/custom/input";
  }
  let normalized = trimmed.replace(/\\/g, "/");
  normalized = normalized.replace(/\/\/+/g, "/");
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function deriveStandardRigInputId(path: string): string {
  return path.replace(/\//g, "_").replace(/^_+/, "");
}

export interface StandardRigInputInit
  extends Omit<StandardRigInput, "id" | "path"> {
  path: string;
  id?: string;
}

export function createStandardRigInput(
  init: StandardRigInputInit,
): StandardRigInput {
  const path = normalizeStandardRigInputPath(init.path);
  const id = init.id ?? deriveStandardRigInputId(path);
  const rangeMin = Math.min(init.range.min, init.range.max);
  const rangeMax = Math.max(init.range.min, init.range.max);
  const defaultValue = Math.min(
    rangeMax,
    Math.max(rangeMin, init.defaultValue),
  );
  const label = normalizeWhitespace(init.label || path);
  return {
    id,
    path,
    label,
    group: init.group,
    defaultValue,
    range: {
      min: rangeMin,
      max: rangeMax,
    },
  };
}

function capitalize(word: string): string {
  if (!word) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function deriveLabelFromNormalizedPath(normalizedPath: string): string {
  const withoutLeading = normalizedPath.startsWith("/")
    ? normalizedPath.slice(1)
    : normalizedPath;
  if (!withoutLeading) {
    return "Custom Input";
  }
  const words = withoutLeading
    .split("/")
    .flatMap((segment) =>
      segment.replace(/[_-]+/g, " ").split(" ").filter(Boolean),
    )
    .map(capitalize);
  return words.length > 0 ? words.join(" ") : "Custom Input";
}

export function deriveGroupFromNormalizedPath(normalizedPath: string): string {
  const withoutLeading = normalizedPath.startsWith("/")
    ? normalizedPath.slice(1)
    : normalizedPath;
  if (!withoutLeading) {
    return "custom";
  }
  const [first] = withoutLeading.split("/");
  return first || "custom";
}

export function createStandardRigInputFromPath(path: string): StandardRigInput {
  const normalized = normalizeStandardRigInputPath(path);
  const label = deriveLabelFromNormalizedPath(normalized);
  const group = deriveGroupFromNormalizedPath(normalized);
  return createStandardRigInput({
    path: normalized,
    label,
    group,
    defaultValue: 0,
    range: {
      min: -1,
      max: 1,
    },
  });
}
