import { cloneDeepSafe } from "../cloneDeepSafe";

export type RigInputGroup = string;

export type BindingValueType = "scalar" | "vector";

export type RigBindingOperandKind =
  | "slot"
  | "reserved"
  | "literal"
  | "expression"
  | "unknown";

export interface RigBindingOperandMetadata {
  kind: RigBindingOperandKind;
  ref?: string;
  slotId?: string;
  alias?: string;
  inputId?: string | null;
  valueType?: BindingValueType;
  description?: string;
  literalValue?: number;
  expression?: string;
}

export interface RigBindingCaseMetadata {
  kind: "case";
  selector?: RigBindingOperandMetadata;
  defaultBranch?: RigBindingOperandMetadata;
  branches: RigBindingOperandMetadata[];
}

export interface RigBindingExpressionMetadata {
  case?: RigBindingCaseMetadata;
}

export interface RigBindingMetadata {
  expression?: RigBindingExpressionMetadata;
  [key: string]: unknown;
}

export interface RigBindingSlot {
  id: string;
  alias: string;
  inputId: string | null;
  valueType?: BindingValueType;
}

export function cloneRigBindingSlot(slot: RigBindingSlot): RigBindingSlot {
  return {
    id: slot.id,
    alias: slot.alias,
    inputId: slot.inputId,
    valueType: slot.valueType,
  };
}

export interface RigBindingDefinition {
  inputId: string | null;
  slots: RigBindingSlot[];
  expression: string;
  metadata?: RigBindingMetadata;
}

export function cloneRigBindingDefinition(
  definition: RigBindingDefinition,
): RigBindingDefinition {
  return {
    inputId: definition.inputId,
    slots: definition.slots.map(cloneRigBindingSlot),
    expression: definition.expression,
    metadata: definition.metadata
      ? (cloneDeepSafe(definition.metadata) as RigBindingMetadata)
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
  normalized = stripRigPathPrefix(normalized);
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized === "/") {
    return "/custom/input";
  }
  return normalized;
}

function stripRigPathPrefix(value: string): string {
  let working = value.startsWith("/") ? value.slice(1) : value;
  const pattern = /^rig\/[\w-]+\/(.*)$/i;
  while (true) {
    const match = working.match(pattern);
    if (!match) {
      break;
    }
    working = match[1] ?? "";
  }
  return working;
}

export function deriveStandardRigInputIdFromPath(path: string): string {
  return path.replace(/\//g, "_").replace(/^_+/, "");
}

export interface StandardRigInputInit extends Omit<
  StandardRigInput,
  "id" | "path"
> {
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
