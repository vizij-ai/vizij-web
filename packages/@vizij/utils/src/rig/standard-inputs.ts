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

type StandardRigInputDefaults = {
  value: number;
  min: number;
  max: number;
};

function defineStandardRigInput(
  path: string,
  label: string,
  group: RigInputGroup,
  defaults: StandardRigInputDefaults,
): StandardRigInput {
  return createStandardRigInput({
    path,
    label,
    group,
    defaultValue: defaults.value,
    range: {
      min: defaults.min,
      max: defaults.max,
    },
  });
}

const POS_DEFAULTS: StandardRigInputDefaults = { value: 0, min: -1, max: 1 };
const SCALE_DEFAULTS: StandardRigInputDefaults = { value: 0, min: -1, max: 1 };
const MORPH_DEFAULTS: StandardRigInputDefaults = { value: 0, min: -1, max: 1 };
const ROT_DEFAULTS: StandardRigInputDefaults = { value: 0, min: -1, max: 1 };

export const STANDARD_RIG_INPUTS: StandardRigInput[] = [
  defineStandardRigInput("/mouth/pos/x", "Mouth Pos X", "mouth", POS_DEFAULTS),
  defineStandardRigInput("/mouth/pos/y", "Mouth Pos Y", "mouth", POS_DEFAULTS),
  defineStandardRigInput(
    "/mouth/scale/x",
    "Mouth Scale X",
    "mouth",
    SCALE_DEFAULTS,
  ),
  defineStandardRigInput(
    "/mouth/scale/y",
    "Mouth Scale Y",
    "mouth",
    SCALE_DEFAULTS,
  ),
  defineStandardRigInput(
    "/mouth/morph",
    "Mouth Morph",
    "mouth",
    MORPH_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye/pos/x",
    "Left Eye Pos X",
    "left_eye",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye/pos/y",
    "Left Eye Pos Y",
    "left_eye",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye_highlight/scale/x",
    "Left Eye Highlight Scale X",
    "left_eye_highlight",
    SCALE_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye_highlight/scale/y",
    "Left Eye Highlight Scale Y",
    "left_eye_highlight",
    SCALE_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye_top_eyelid/pos/y",
    "Left Top Eyelid Pos Y",
    "left_eye_top_eyelid",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye_top_eyelid/rot/z",
    "Left Top Eyelid Rot Z",
    "left_eye_top_eyelid",
    ROT_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye_brow/pos/y",
    "Left Brow Pos Y",
    "left_eye_brow",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye_brow/rot/z",
    "Left Brow Rot Z",
    "left_eye_brow",
    ROT_DEFAULTS,
  ),
  defineStandardRigInput(
    "/left_eye_brow/scale/x",
    "Left Brow Scale X",
    "left_eye_brow",
    SCALE_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye/pos/x",
    "Right Eye Pos X",
    "right_eye",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye/pos/y",
    "Right Eye Pos Y",
    "right_eye",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_highlight/scale/x",
    "Right Eye Highlight Scale X",
    "right_eye_highlight",
    SCALE_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_highlight/scale/y",
    "Right Eye Highlight Scale Y",
    "right_eye_highlight",
    SCALE_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_bottom_eyelid/pos/y",
    "Right Bottom Eyelid Pos Y",
    "right_eye_bottom_eyelid",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_bottom_eyelid/rot/z",
    "Right Bottom Eyelid Rot Z",
    "right_eye_bottom_eyelid",
    ROT_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_top_eyelid/pos/y",
    "Right Top Eyelid Pos Y",
    "right_eye_top_eyelid",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_top_eyelid/rot/z",
    "Right Top Eyelid Rot Z",
    "right_eye_top_eyelid",
    ROT_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_brow/pos/y",
    "Right Brow Pos Y",
    "right_eye_brow",
    POS_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_brow/rot/z",
    "Right Brow Rot Z",
    "right_eye_brow",
    ROT_DEFAULTS,
  ),
  defineStandardRigInput(
    "/right_eye_brow/scale/x",
    "Right Brow Scale X",
    "right_eye_brow",
    SCALE_DEFAULTS,
  ),
];

export const STANDARD_RIG_INPUTS_BY_ID = new Map(
  STANDARD_RIG_INPUTS.map((item) => [item.id, item]),
);

export function findStandardRigInput(id: string): StandardRigInput | undefined {
  return STANDARD_RIG_INPUTS_BY_ID.get(id);
}
