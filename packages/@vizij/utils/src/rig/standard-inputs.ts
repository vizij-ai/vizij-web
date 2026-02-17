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

export const AUTORIG_PATH_PREFIX = "/autorig";
export const AUTORIG_INPUT_PATH_PREFIX = AUTORIG_PATH_PREFIX;
export const RIG_ELEMENT_INPUT_PATH_PREFIX = "/rig/element";
export const LEGACY_AUTORIG_INPUT_PATH_PREFIX = RIG_ELEMENT_INPUT_PATH_PREFIX;

function normalizeRigInputCandidate(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

export function isRigElementStandardInputPath(
  path: string | null | undefined,
): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path);
  const faceStripped = normalized.replace(/^\/rig\/[^/]+\//, "/");
  return (
    normalized.startsWith(AUTORIG_INPUT_PATH_PREFIX) ||
    normalized.startsWith(RIG_ELEMENT_INPUT_PATH_PREFIX) ||
    faceStripped.startsWith(AUTORIG_INPUT_PATH_PREFIX) ||
    faceStripped.startsWith(RIG_ELEMENT_INPUT_PATH_PREFIX)
  );
}

export function isAutorigStandardInputPath(
  path: string | null | undefined,
): boolean {
  return isRigElementStandardInputPath(path);
}

export function resolveStandardRigInputId(
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

  const candidateIds = new Set<string>();
  const pathCandidateSet = new Set<string>();
  const addPathCandidates = (rawPath: string | null | undefined) => {
    const normalized = normalizeStandardRigInputPath(rawPath ?? "");
    if (!normalized || normalized === "/custom/input") {
      return;
    }
    if (pathCandidateSet.has(normalized)) {
      return;
    }
    pathCandidateSet.add(normalized);
    candidateIds.add(deriveStandardRigInputIdFromPath(normalized));
    candidateIds.add(
      deriveStandardRigInputIdFromPath(
        applyStandardInputPathPrefix(normalized),
      ),
    );
    candidateIds.add(
      deriveStandardRigInputIdFromPath(
        stripStandardInputPathPrefix(normalized),
      ),
    );

    const withStandardPrefix = applyStandardInputPathPrefix(normalized);
    if (!pathCandidateSet.has(withStandardPrefix)) {
      pathCandidateSet.add(withStandardPrefix);
    }

    const withoutStandardPrefix = stripStandardInputPathPrefix(normalized);
    if (!pathCandidateSet.has(withoutStandardPrefix)) {
      pathCandidateSet.add(withoutStandardPrefix);
    }

    if (normalized.startsWith("/rig/")) {
      const strippedFacePrefix = stripRigPathPrefix(normalized);
      if (strippedFacePrefix.length > 0) {
        addPathCandidates(strippedFacePrefix);
      }
    }
  };

  const enqueueAliasPath = (normalizedPath: string) => {
    if (normalizedPath.startsWith(`${AUTORIG_INPUT_PATH_PREFIX}/`)) {
      const suffix = normalizedPath.slice(AUTORIG_INPUT_PATH_PREFIX.length + 1);
      if (suffix.length > 0) {
        addPathCandidates(`${RIG_ELEMENT_INPUT_PATH_PREFIX}/${suffix}`);
      }
    }
    if (normalizedPath.startsWith(`${RIG_ELEMENT_INPUT_PATH_PREFIX}/`)) {
      const suffix = normalizedPath.slice(
        RIG_ELEMENT_INPUT_PATH_PREFIX.length + 1,
      );
      if (suffix.length > 0) {
        addPathCandidates(`${AUTORIG_INPUT_PATH_PREFIX}/${suffix}`);
      }
    }
    if (normalizedPath.startsWith("/pose/control/")) {
      addPathCandidates(
        `${AUTORIG_INPUT_PATH_PREFIX}/${normalizedPath.slice(
          "/pose/control/".length,
        )}`,
      );
    }
    if (normalizedPath.startsWith("/rig/control/")) {
      addPathCandidates(
        `${AUTORIG_INPUT_PATH_PREFIX}/${normalizedPath.slice(
          "/rig/control/".length,
        )}`,
      );
    }
  };

  const addIdCandidate = (candidate: string | null | undefined) => {
    const normalized = normalizeRigInputCandidate(candidate);
    if (!normalized) {
      return;
    }
    candidateIds.add(normalized);
    const path = normalized.includes("/")
      ? normalized
      : `/${normalized.replace(/_/g, "/")}`;
    addPathCandidates(path);
    const strippedPrefix = stripStandardInputPathPrefix(path);
    addPathCandidates(strippedPrefix);
    if (!normalized.startsWith("/")) {
      addPathCandidates(normalizeStandardRigInputPath(normalized));
    }
  };

  const normalizedInput = normalizeStandardRigInputPath(selectedRigId);
  addIdCandidate(selectedRigId);
  addIdCandidate(normalizedInput);
  addIdCandidate(selectedRigId.replace(/^\/+/, ""));
  addIdCandidate(selectedRigId.replace(/^(?:autorig|rig[_-]element)_/, ""));
  addIdCandidate(normalizedInput.replace(/^\/rig\//, ""));
  if (!selectedRigId.includes("/")) {
    addIdCandidate(selectedRigId.replace(/_/g, "/"));
  }

  const pathCandidates = Array.from(pathCandidateSet);
  pathCandidates.forEach((pathCandidate) => {
    enqueueAliasPath(pathCandidate);
  });

  for (const [candidateId] of candidateIds.entries()) {
    if (standardInputsById.has(candidateId)) {
      return candidateId;
    }
  }

  for (const [inputId, input] of standardInputsById.entries()) {
    const inputPathCandidates = new Set<string>();
    const addInputCandidatePaths = (path: string) => {
      const normalized = normalizeStandardRigInputPath(path);
      if (!normalized || normalized === "/custom/input") {
        return;
      }
      inputPathCandidates.add(normalized);
      inputPathCandidates.add(stripStandardInputPathPrefix(normalized));
      inputPathCandidates.add(applyStandardInputPathPrefix(normalized));
      inputPathCandidates.add(stripStandardInputPathPrefix(normalized));
      inputPathCandidates.add(deriveStandardRigInputIdFromPath(normalized));
      inputPathCandidates.add(
        deriveStandardRigInputIdFromPath(
          applyStandardInputPathPrefix(normalized),
        ),
      );
      inputPathCandidates.add(
        deriveStandardRigInputIdFromPath(
          stripStandardInputPathPrefix(normalized),
        ),
      );
      if (normalized.startsWith("/rig/")) {
        const strippedRigPrefix = stripRigPathPrefix(normalized);
        if (strippedRigPrefix.length > 0) {
          inputPathCandidates.add(
            normalizeStandardRigInputPath(strippedRigPrefix),
          );
        }
      }
      if (normalized.startsWith("/pose/control/")) {
        inputPathCandidates.add(
          `${AUTORIG_INPUT_PATH_PREFIX}/${normalized.slice(
            "/pose/control/".length,
          )}`,
        );
      }
      if (normalized.startsWith("/rig/control/")) {
        inputPathCandidates.add(
          `${AUTORIG_INPUT_PATH_PREFIX}/${normalized.slice(
            "/rig/control/".length,
          )}`,
        );
      }
      if (normalized.startsWith(AUTORIG_INPUT_PATH_PREFIX)) {
        const suffix = normalized.slice(AUTORIG_INPUT_PATH_PREFIX.length + 1);
        if (suffix.length > 0) {
          inputPathCandidates.add(`${RIG_ELEMENT_INPUT_PATH_PREFIX}/${suffix}`);
        }
      }
      if (normalized.startsWith(RIG_ELEMENT_INPUT_PATH_PREFIX)) {
        const suffix = normalized.slice(
          RIG_ELEMENT_INPUT_PATH_PREFIX.length + 1,
        );
        if (suffix.length > 0) {
          inputPathCandidates.add(`${AUTORIG_INPUT_PATH_PREFIX}/${suffix}`);
        }
      }
    };
    addInputCandidatePaths(input.path);

    for (const candidatePath of inputPathCandidates) {
      if (
        candidatePath &&
        candidatePath !== "/custom/input" &&
        pathCandidateSet.has(normalizeStandardRigInputPath(candidatePath))
      ) {
        return inputId;
      }
      if (candidateIds.has(candidatePath)) {
        return inputId;
      }
    }
    if (candidateIds.has(inputId)) {
      return inputId;
    }
  }

  const fallbackId = deriveStandardRigInputIdFromPath(normalizedInput);
  if (standardInputsById.has(fallbackId)) {
    return fallbackId;
  }

  return selectedRigId;
}

export function isRigElementStandardInputPathList(
  paths: Array<string | null | undefined>,
): boolean {
  return paths.some((path) => isRigElementStandardInputPath(path));
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
  const pattern = /^rig\/([\w-]+)\/(.*)$/i;
  while (true) {
    const match = working.match(pattern);
    if (!match) {
      break;
    }
    const segment = (match[1] ?? "").toLowerCase();
    // Preserve legacy rig namespaces that represent canonical control families
    // rather than rig-face prefixes.
    if (segment === "element" || segment === "control") {
      break;
    }
    working = match[2] ?? "";
  }
  return working;
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
