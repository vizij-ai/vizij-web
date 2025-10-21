export const RIG_INPUT_GROUPS = [
  "mouth",
  "left_eye",
  "left_eye_highlight",
  "left_eye_top_eyelid",
  "left_eye_bottom_eyelid",
  "left_eye_brow",
  "right_eye",
  "right_eye_highlight",
  "right_eye_bottom_eyelid",
  "right_eye_top_eyelid",
  "right_eye_brow",
] as const;

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

export type StandardRigInputDraft = Omit<StandardRigInputInit, "id">;

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

function input(
  path: string,
  label: string,
  group: RigInputGroup,
  defaults: {
    value: number;
    min: number;
    max: number;
  },
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

const POS_DEFAULTS = { value: 0, min: -1, max: 1 };
const SCALE_DEFAULTS = { value: 0, min: -1, max: 1 };
const MORPH_DEFAULTS = { value: 0, min: -1, max: 1 };
const ROT_DEFAULTS = { value: 0, min: -1.6, max: 1.6 };

export const STANDARD_RIG_INPUTS: StandardRigInput[] = [
  input("/mouth/pos/x", "Mouth Pos X", "mouth", POS_DEFAULTS),
  input("/mouth/pos/y", "Mouth Pos Y", "mouth", POS_DEFAULTS),
  input("/mouth/scale/x", "Mouth Scale X", "mouth", SCALE_DEFAULTS),
  input("/mouth/scale/y", "Mouth Scale Y", "mouth", SCALE_DEFAULTS),
  input("/mouth/morph", "Mouth Morph", "mouth", MORPH_DEFAULTS),
  input("/left_eye/pos/x", "Left Eye Pos X", "left_eye", POS_DEFAULTS),
  input("/left_eye/pos/y", "Left Eye Pos Y", "left_eye", POS_DEFAULTS),
  input(
    "/left_eye_highlight/scale/x",
    "Left Eye Highlight Scale X",
    "left_eye_highlight",
    SCALE_DEFAULTS,
  ),
  input(
    "/left_eye_highlight/scale/y",
    "Left Eye Highlight Scale Y",
    "left_eye_highlight",
    SCALE_DEFAULTS,
  ),
  input(
    "/left_eye_bottom_eyelid/pos/y",
    "Left Bottom Eyelid Pos Y",
    "left_eye_bottom_eyelid",
    POS_DEFAULTS,
  ),
  input(
    "/left_eye_bottom_eyelid/rot/z",
    "Left Bottom Eyelid Rot Z",
    "left_eye_bottom_eyelid",
    ROT_DEFAULTS,
  ),
  input(
    "/left_eye_top_eyelid/pos/y",
    "Left Top Eyelid Pos Y",
    "left_eye_top_eyelid",
    POS_DEFAULTS,
  ),
  input(
    "/left_eye_top_eyelid/rot/z",
    "Left Top Eyelid Rot Z",
    "left_eye_top_eyelid",
    ROT_DEFAULTS,
  ),
  input(
    "/left_eye_brow/pos/y",
    "Left Brow Pos Y",
    "left_eye_brow",
    POS_DEFAULTS,
  ),
  input(
    "/left_eye_brow/rot/z",
    "Left Brow Rot Z",
    "left_eye_brow",
    ROT_DEFAULTS,
  ),
  input(
    "/left_eye_brow/scale/x",
    "Left Brow Scale X",
    "left_eye_brow",
    SCALE_DEFAULTS,
  ),
  input("/right_eye/pos/x", "Right Eye Pos X", "right_eye", POS_DEFAULTS),
  input("/right_eye/pos/y", "Right Eye Pos Y", "right_eye", POS_DEFAULTS),
  input(
    "/right_eye_highlight/scale/x",
    "Right Eye Highlight Scale X",
    "right_eye_highlight",
    SCALE_DEFAULTS,
  ),
  input(
    "/right_eye_highlight/scale/y",
    "Right Eye Highlight Scale Y",
    "right_eye_highlight",
    SCALE_DEFAULTS,
  ),
  input(
    "/right_eye_bottom_eyelid/pos/y",
    "Right Bottom Eyelid Pos Y",
    "right_eye_bottom_eyelid",
    POS_DEFAULTS,
  ),
  input(
    "/right_eye_bottom_eyelid/rot/z",
    "Right Bottom Eyelid Rot Z",
    "right_eye_bottom_eyelid",
    ROT_DEFAULTS,
  ),
  input(
    "/right_eye_top_eyelid/pos/y",
    "Right Top Eyelid Pos Y",
    "right_eye_top_eyelid",
    POS_DEFAULTS,
  ),
  input(
    "/right_eye_top_eyelid/rot/z",
    "Right Top Eyelid Rot Z",
    "right_eye_top_eyelid",
    ROT_DEFAULTS,
  ),
  input(
    "/right_eye_brow/pos/y",
    "Right Brow Pos Y",
    "right_eye_brow",
    POS_DEFAULTS,
  ),
  input(
    "/right_eye_brow/rot/z",
    "Right Brow Rot Z",
    "right_eye_brow",
    ROT_DEFAULTS,
  ),
  input(
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
