export type RigInputGroup = string;

export interface RemapSettings {
  inLow: number;
  inAnchor: number;
  inHigh: number;
  outLow: number;
  outAnchor: number;
  outHigh: number;
}

export function cloneRemapSettings(remap: RemapSettings): RemapSettings {
  return {
    inLow: remap.inLow,
    inAnchor: remap.inAnchor,
    inHigh: remap.inHigh,
    outLow: remap.outLow,
    outAnchor: remap.outAnchor,
    outHigh: remap.outHigh,
  };
}

export type BindingValueType = "scalar" | "vector";

export interface RigBindingSlot {
  id: string;
  alias: string;
  inputId: string | null;
  remap: RemapSettings;
  valueType?: BindingValueType;
}

export function cloneRigBindingSlot(slot: RigBindingSlot): RigBindingSlot {
  return {
    id: slot.id,
    alias: slot.alias,
    inputId: slot.inputId,
    remap: cloneRemapSettings(slot.remap),
    valueType: slot.valueType,
  };
}

export type RigBindingOperatorType = "spring" | "damp" | "slew";

export interface RigBindingOperatorDefinition {
  type: RigBindingOperatorType;
  enabled: boolean;
  params: Record<string, number>;
}

export interface RigBindingDefinition {
  inputId: string | null;
  remap: RemapSettings;
  slots: RigBindingSlot[];
  expression: string;
  operators?: RigBindingOperatorDefinition[];
}

export function cloneRigBindingDefinition(
  definition: RigBindingDefinition,
): RigBindingDefinition {
  return {
    inputId: definition.inputId,
    remap: cloneRemapSettings(definition.remap),
    slots: definition.slots.map(cloneRigBindingSlot),
    expression: definition.expression,
    operators: definition.operators
      ? definition.operators.map((operator) => ({
          type: operator.type,
          enabled: operator.enabled,
          params: { ...operator.params },
        }))
      : undefined,
  };
}

export const SELF_BINDING_ID = "__self__";

export interface StandardRigInput {
  id: string;
  /**
   * Stable typed path segment appended to `rig/<faceId>/`.
   */
  path: string;
  /**
   * Stable identifier tying this input back to the authoring source (renderable/feature/component).
   * Optional for legacy inputs.
   */
  sourceId?: string;
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
  /**
   * Optional parent binding metadata for hierarchical remaps.
   */
  parentBinding?: RigBindingDefinition | null;
  /**
   * Cached child ids for quick tree traversal in authoring surfaces.
   */
  derivedChildren?: string[];
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

export function deriveStandardRigInputIdFromPath(path: string): string {
  return path.replace(/\//g, "_").replace(/^_+/, "");
}

export interface StandardRigInputInit
  extends Omit<StandardRigInput, "id" | "path"> {
  path: string;
  id?: string;
}

export function applyStandardInputPathPrefix(path: string): string {
  const normalized = normalizeStandardRigInputPath(path);
  if (normalized === "/standard" || normalized.startsWith("/standard/")) {
    return normalized;
  }
  return normalizeStandardRigInputPath(`/standard${normalized}`);
}

export function normalizeStandardRigGroup(
  value: string,
  fallback = "custom",
): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function createStandardRigInput(
  init: StandardRigInputInit,
): StandardRigInput {
  const path = normalizeStandardRigInputPath(init.path);
  const id = init.id ?? deriveStandardRigInputIdFromPath(path);
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
    sourceId: init.sourceId,
    label,
    group: init.group,
    defaultValue,
    range: {
      min: rangeMin,
      max: rangeMax,
    },
    parentBinding: init.parentBinding
      ? cloneRigBindingDefinition(init.parentBinding)
      : null,
    derivedChildren: init.derivedChildren ? [...init.derivedChildren] : [],
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
  const segments = withoutLeading.split("/");
  const filteredSegments = segments.filter((segment, index) => {
    if (index === 0 && segment === "standard") {
      return false;
    }
    return true;
  });
  const words = filteredSegments
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
  const segments = withoutLeading.split("/");
  if (segments[0] === "standard" && segments.length > 1) {
    return segments[1] || "custom";
  }
  const [first] = segments;
  return first || "custom";
}

export function stripStandardInputPathPrefix(path: string): string {
  const normalized = normalizeStandardRigInputPath(path);
  if (normalized === "/standard") {
    return "/custom/input";
  }
  if (normalized.startsWith("/standard/")) {
    return normalizeStandardRigInputPath(normalized.slice("/standard".length));
  }
  return normalized;
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
    path: applyStandardInputPathPrefix(path),
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

const LEGACY_STANDARD_INPUT_ID_ENTRIES: Array<[string, string]> = [];
STANDARD_RIG_INPUTS.forEach((input) => {
  const legacyPath = input.path.startsWith("/standard/")
    ? `/${input.path.slice("/standard/".length)}`
    : input.path;
  const legacyId = deriveStandardRigInputIdFromPath(legacyPath);
  if (legacyId !== input.id) {
    LEGACY_STANDARD_INPUT_ID_ENTRIES.push([legacyId, input.id]);
  }
});

export const LEGACY_STANDARD_RIG_INPUT_IDS = new Map(
  LEGACY_STANDARD_INPUT_ID_ENTRIES,
);
