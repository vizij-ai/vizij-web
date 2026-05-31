import type { GraphSpec } from "@vizij/node-graph-wasm";
import {
  createDefaultBinding,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingToDefinition,
  ensureBindingStructure,
  type AnimatableBinding,
  type BindingMap,
  type InputBindingMap,
  PRIMARY_SLOT_ALIAS,
  PRIMARY_SLOT_ID,
  type BindingTarget,
  type BindingValueType,
} from "@vizij/node-graph-authoring";
import {
  SELF_BINDING_ID,
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  isPropsRigStandardInputPath,
  migrateLegacyStandardRigInputLabel,
  normalizeStandardRigInputPath,
  resolveStandardRigInputId,
  type AnimatableComponent,
  type StandardRigInput,
  cloneDeepSafe,
} from "@vizij/utils";
import type { GraphBindingSummary, IrGraph } from "@vizij/node-graph-authoring";
import type { RigBindingMetadata } from "@vizij/utils";

function cloneBindingMetadata(
  metadata: RigBindingMetadata | undefined,
): RigBindingMetadata | undefined {
  if (!metadata) {
    return undefined;
  }
  return cloneDeepSafe(metadata);
}

interface VizijGraphMetadataInput {
  id: string;
  path: string;
  sourceId?: string;
  source?: string;
  label: string;
  group: string;
  root?: string;
  defaultValue: number;
  range: { min: number; max: number };
}

interface VizijPipelineV1LinkConfig {
  linkId?: string;
  parentInputId?: string;
  childInputId?: string;
  scale?: number;
  offset?: number;
  enabled?: boolean;
  expression?: string;
}

interface VizijPipelineV1ParentConfig {
  linkId?: string;
  inputId?: string;
  alias?: string;
  scale?: number;
  offset?: number;
  enabled?: boolean;
  expression?: string;
}

interface VizijPipelineV1InputConfig {
  inputId?: string;
  parents?: VizijPipelineV1ParentConfig[];
}

interface VizijPipelineV1Metadata {
  byInputId?: Record<string, VizijPipelineV1InputConfig>;
  links?: Record<string, VizijPipelineV1LinkConfig>;
}

interface VizijGraphMetadata {
  faceId: string;
  inputs: VizijGraphMetadataInput[];
  bindings: GraphBindingSummary[];
  pipelineV1?: VizijPipelineV1Metadata;
  machineReport?: Record<string, unknown>;
  irGraph?: IrGraph;
}

interface VizijMetadataContainer {
  vizij?: VizijGraphMetadata;
}

export interface RehydratedRigData {
  sourceFaceId: string | null;
  standardInputs: StandardRigInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  inputMetadata: Map<string, { source?: string; root?: string }>;
  legacyPropsRigInputPaths: string[];
  normalizationDiagnostics: ImportNormalizationDiagnostics;
}

const LEGACY_PROPSRIG_PREFIX = "/rig/element";

type BindingFallbackReason = "missing-source-input" | "missing-propsrig-target";

interface BindingInputRemapDiagnostic {
  targetId: string;
  slotId: string;
  fromInputId: string;
  toInputId: string;
}

interface BindingTargetRemapDiagnostic {
  fromTargetId: string;
  toTargetId: string;
}

interface AnimatableRetargetDiagnostic {
  animatableTargetId: string;
  slotId: string;
  fromInputId: string;
  toPropsRigInputId: string;
}

interface AnimatableFallbackDiagnostic {
  animatableTargetId: string;
  slotId: string;
  inputId: string;
  reason: BindingFallbackReason;
}

interface PropsRigInputCreatedDiagnostic {
  inputId: string;
  path: string;
  sourceId?: string;
}

interface FaceIdMismatchDiagnostic {
  importedFaceId: string;
  loadedFaceId: string;
}

export interface ImportNormalizationDiagnostics {
  faceIdMismatches: FaceIdMismatchDiagnostic[];
  createdPropsRigInputs: PropsRigInputCreatedDiagnostic[];
  inputIdRemaps: BindingInputRemapDiagnostic[];
  targetIdRemaps: BindingTargetRemapDiagnostic[];
  animatableRetargets: AnimatableRetargetDiagnostic[];
  animatableFallbacks: AnimatableFallbackDiagnostic[];
}

function isLegacyPropsRigPath(path: string | undefined | null): boolean {
  if (!path) {
    return false;
  }
  const trimmed = path.trim();
  return (
    trimmed.startsWith(`${LEGACY_PROPSRIG_PREFIX}/`) ||
    trimmed.startsWith(`${LEGACY_PROPSRIG_PREFIX}`)
  );
}

function resolveImportedInputGroup(
  descriptor: VizijGraphMetadataInput,
  normalizedPath: string,
): string {
  if (descriptor.root && descriptor.root.length > 0) {
    return descriptor.root;
  }
  const derivedGroup = deriveGroupFromNormalizedPath(normalizedPath);
  if (descriptor.group && descriptor.group.length > 0) {
    if (
      descriptor.group === "standard" &&
      derivedGroup &&
      derivedGroup !== "standard"
    ) {
      return derivedGroup;
    }
    return descriptor.group;
  }
  if (derivedGroup && derivedGroup.length > 0) {
    return derivedGroup;
  }
  return "custom";
}

function normalizeImportedInputPath(
  descriptor: VizijGraphMetadataInput,
): string {
  // The standard path namespace is part of the import/export contract.
  return normalizeStandardRigInputPath(descriptor.path);
}

function coerceExpression(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function createNormalizationDiagnostics(): ImportNormalizationDiagnostics {
  return {
    faceIdMismatches: [],
    createdPropsRigInputs: [],
    inputIdRemaps: [],
    targetIdRemaps: [],
    animatableRetargets: [],
    animatableFallbacks: [],
  };
}

function normalizeStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFiniteValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeBooleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function buildInputPairKey(
  parentInputId: string,
  childInputId: string,
): string {
  return `${parentInputId}::${childInputId}`;
}

function synthesizeInputBindingSummariesFromPipelineLinks(params: {
  summaries: readonly GraphBindingSummary[];
  pipelineV1: VizijPipelineV1Metadata | undefined;
  knownInputIds: ReadonlySet<string>;
}): GraphBindingSummary[] {
  const links = params.pipelineV1?.links;
  const byInputId = params.pipelineV1?.byInputId;
  const hasLinks = Boolean(links && Object.keys(links).length > 0);
  const hasParentConfigs = Boolean(
    byInputId &&
      Object.values(byInputId).some(
        (config) => Array.isArray(config?.parents) && config.parents.length > 0,
      ),
  );
  if (!hasLinks && !hasParentConfigs) {
    return [...params.summaries];
  }

  const existingPairs = new Set<string>();
  params.summaries.forEach((summary) => {
    const targetId = summary.targetId?.trim();
    const inputId = summary.inputId?.trim();
    if (
      !targetId ||
      !inputId ||
      inputId === SELF_BINDING_ID ||
      !params.knownInputIds.has(targetId)
    ) {
      return;
    }
    existingPairs.add(buildInputPairKey(inputId, targetId));
  });

  const pendingByChild = new Map<
    string,
    Array<{
      linkId: string;
      parentInputId: string;
      childInputId: string;
      slotAlias: string | null;
      scale: number | null;
      offset: number | null;
      enabled: boolean | null;
      expression: string | null;
    }>
  >();

  const queuePending = (entry: {
    linkId: string;
    parentInputId: string;
    childInputId: string;
    slotAlias: string | null;
    scale: number | null;
    offset: number | null;
    enabled: boolean | null;
    expression: string | null;
  }) => {
    if (
      !params.knownInputIds.has(entry.parentInputId) ||
      !params.knownInputIds.has(entry.childInputId)
    ) {
      return;
    }
    const pairKey = buildInputPairKey(entry.parentInputId, entry.childInputId);
    if (existingPairs.has(pairKey)) {
      return;
    }
    existingPairs.add(pairKey);
    const current = pendingByChild.get(entry.childInputId);
    if (current) {
      current.push(entry);
    } else {
      pendingByChild.set(entry.childInputId, [entry]);
    }
  };

  Object.entries(links ?? {}).forEach(([rawLinkId, rawConfig]) => {
    if (!rawConfig || typeof rawConfig !== "object") {
      return;
    }
    const record = rawConfig as Record<string, unknown>;
    const parentInputId = normalizeStringValue(record.parentInputId);
    const childInputId = normalizeStringValue(record.childInputId);
    if (!parentInputId || !childInputId) {
      return;
    }
    queuePending({
      linkId:
        normalizeStringValue(record.linkId) ??
        normalizeStringValue(rawLinkId) ??
        `link/${encodeURIComponent(parentInputId)}->${encodeURIComponent(childInputId)}`,
      parentInputId,
      childInputId,
      slotAlias: null,
      scale: normalizeFiniteValue(record.scale),
      offset: normalizeFiniteValue(record.offset),
      enabled: normalizeBooleanValue(record.enabled),
      expression: normalizeStringValue(record.expression),
    });
  });

  Object.entries(byInputId ?? {}).forEach(([rawChildInputId, rawConfig]) => {
    if (!rawConfig || typeof rawConfig !== "object") {
      return;
    }
    const childInputId =
      normalizeStringValue((rawConfig as { inputId?: unknown }).inputId) ??
      normalizeStringValue(rawChildInputId);
    if (!childInputId) {
      return;
    }
    const parents = Array.isArray((rawConfig as { parents?: unknown }).parents)
      ? ((rawConfig as { parents: unknown[] }).parents as unknown[])
      : [];
    parents.forEach((rawParent) => {
      if (!rawParent || typeof rawParent !== "object") {
        return;
      }
      const record = rawParent as Record<string, unknown>;
      const parentInputId = normalizeStringValue(record.inputId);
      if (!parentInputId) {
        return;
      }
      queuePending({
        linkId:
          normalizeStringValue(record.linkId) ??
          `link/${encodeURIComponent(parentInputId)}->${encodeURIComponent(childInputId)}`,
        parentInputId,
        childInputId,
        slotAlias: normalizeStringValue(record.alias),
        scale: normalizeFiniteValue(record.scale),
        offset: normalizeFiniteValue(record.offset),
        enabled: normalizeBooleanValue(record.enabled),
        expression: normalizeStringValue(record.expression),
      });
    });
  });

  if (pendingByChild.size === 0) {
    return [...params.summaries];
  }

  const nextSummaries = [...params.summaries];
  pendingByChild.forEach((entries, childInputId) => {
    const sortedEntries = [...entries];
    const slotAliases = sortedEntries.map(
      (entry, index) => entry.slotAlias ?? `s${(index + 1).toString(10)}`,
    );
    const expression = slotAliases.join(" + ");
    const linkMetadata: Record<string, Record<string, unknown>> = {};
    sortedEntries.forEach((entry) => {
      linkMetadata[entry.linkId] = {
        linkId: entry.linkId,
        parentInputId: entry.parentInputId,
        childInputId: entry.childInputId,
        ...(entry.scale !== null ? { scale: entry.scale } : {}),
        ...(entry.offset !== null ? { offset: entry.offset } : {}),
        ...(entry.enabled !== null ? { enabled: entry.enabled } : {}),
        ...(entry.expression ? { expression: entry.expression } : {}),
      };
    });

    sortedEntries.forEach((entry, index) => {
      const slotId = `s${(index + 1).toString(10)}`;
      const slotAlias = slotAliases[index] ?? slotId;
      nextSummaries.push({
        targetId: childInputId,
        animatableId: childInputId,
        component: undefined,
        slotId,
        slotAlias,
        inputId: entry.parentInputId,
        expression,
        valueType: "scalar",
        nodeId: `import_pipeline_link_${entry.linkId}`,
        expressionNodeId: `import_pipeline_expr_${childInputId}`,
        metadata:
          index === 0
            ? ({
                vizij: {
                  pipelineV1: {
                    links: linkMetadata,
                  },
                },
              } as RigBindingMetadata)
            : undefined,
      });
    });
  });

  return nextSummaries;
}

function resolveUniqueImportedInputId(
  baseId: string,
  standardInputs: Map<string, StandardRigInput>,
): string {
  const trimmedBase = baseId.trim();
  const seed = trimmedBase.length > 0 ? trimmedBase : "input";
  if (!standardInputs.has(seed)) {
    return seed;
  }
  let suffix = 2;
  let candidate = `${seed}_${suffix}`;
  while (standardInputs.has(candidate)) {
    suffix += 1;
    candidate = `${seed}_${suffix}`;
  }
  return candidate;
}

function normalizeBindingInputId(
  inputId: string | null,
  standardInputs: Map<string, StandardRigInput>,
): string | null {
  if (inputId === null) {
    return null;
  }
  const trimmed = inputId.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed === SELF_BINDING_ID) {
    return SELF_BINDING_ID;
  }
  if (standardInputs.has(trimmed)) {
    return trimmed;
  }
  const resolved = resolveStandardRigInputId(trimmed, standardInputs);
  if (resolved !== trimmed && standardInputs.has(resolved)) {
    return resolved;
  }
  return trimmed;
}

function normalizeBindingTargetId(
  targetId: string,
  componentIds: Set<string>,
  standardInputs: Map<string, StandardRigInput>,
  componentIdRemaps?: Map<string, string>,
): string {
  const trimmed = targetId.trim();
  if (!trimmed) {
    return targetId;
  }

  if (componentIdRemaps && componentIdRemaps.size > 0) {
    const directRemap = componentIdRemaps.get(trimmed);
    if (directRemap && componentIds.has(directRemap)) {
      return directRemap;
    }

    const separatorIndex = trimmed.indexOf(":");
    const baseTargetId =
      separatorIndex > 0 ? trimmed.slice(0, separatorIndex) : trimmed;
    const remappedBaseTargetId = componentIdRemaps.get(baseTargetId);
    if (remappedBaseTargetId) {
      const remappedTargetId =
        separatorIndex > 0
          ? `${remappedBaseTargetId}${trimmed.slice(separatorIndex)}`
          : remappedBaseTargetId;
      if (componentIds.has(remappedTargetId)) {
        return remappedTargetId;
      }
    }
  }

  if (componentIds.has(trimmed)) {
    return trimmed || targetId;
  }
  if (standardInputs.has(trimmed)) {
    return trimmed;
  }
  const resolved = resolveStandardRigInputId(trimmed, standardInputs);
  if (resolved !== trimmed && standardInputs.has(resolved)) {
    return resolved;
  }
  return trimmed;
}

function resolveComponentIdFromSourceId(
  sourceId: string | undefined,
): string | null {
  const value = sourceId?.trim();
  if (!value || !value.startsWith("component:")) {
    return null;
  }
  const tokens = value.split(":");
  if (tokens.length < 2) {
    return null;
  }
  const encodedComponentId = tokens[tokens.length - 1];
  if (!encodedComponentId || encodedComponentId.trim().length === 0) {
    return null;
  }
  try {
    return decodeURIComponent(encodedComponentId);
  } catch {
    return encodedComponentId;
  }
}

function collectPropsRigTargetByComponentId(
  normalizedSummaries: GraphBindingSummary[],
  componentIds: Set<string>,
  standardInputs: Map<string, StandardRigInput>,
): Map<string, string[]> {
  const candidates = new Map<string, Set<string>>();
  const addCandidate = (componentId: string, inputId: string) => {
    const current = candidates.get(componentId) ?? new Set<string>();
    current.add(inputId);
    candidates.set(componentId, current);
  };

  standardInputs.forEach((input, inputId) => {
    if (!isPropsRigStandardInputPath(input.path)) {
      return;
    }
    const componentId = resolveComponentIdFromSourceId(input.sourceId);
    if (!componentId || !componentIds.has(componentId)) {
      return;
    }
    addCandidate(componentId, inputId);
  });

  normalizedSummaries.forEach((summary) => {
    if (!componentIds.has(summary.targetId) || !summary.inputId) {
      return;
    }
    const source = standardInputs.get(summary.inputId);
    if (!source || !isPropsRigStandardInputPath(source.path)) {
      return;
    }
    addCandidate(summary.targetId, source.id);
  });

  const resolved = new Map<string, string[]>();
  candidates.forEach((inputIds, componentId) => {
    const ordered = Array.from(inputIds).sort((a, b) => a.localeCompare(b));
    if (ordered.length > 0) {
      resolved.set(componentId, ordered);
    }
  });
  return resolved;
}

function buildInputDownstreamLookup(
  normalizedSummaries: GraphBindingSummary[],
  standardInputs: Map<string, StandardRigInput>,
): Map<string, Set<string>> {
  const downstreamByInputId = new Map<string, Set<string>>();

  normalizedSummaries.forEach((summary) => {
    if (!summary.inputId || summary.inputId === SELF_BINDING_ID) {
      return;
    }
    if (!standardInputs.has(summary.inputId)) {
      return;
    }
    if (!standardInputs.has(summary.targetId)) {
      return;
    }
    const downstream = downstreamByInputId.get(summary.inputId) ?? new Set();
    downstream.add(summary.targetId);
    downstreamByInputId.set(summary.inputId, downstream);
  });

  return downstreamByInputId;
}

function hasTransitivePropsRigBoundaryPath(params: {
  componentId: string;
  sourceInputId: string;
  propsrigTargetsByComponentId: Map<string, string[]>;
  downstreamByInputId: Map<string, Set<string>>;
}): boolean {
  const {
    componentId,
    sourceInputId,
    propsrigTargetsByComponentId,
    downstreamByInputId,
  } = params;
  const propsrigCandidates = propsrigTargetsByComponentId.get(componentId);
  if (!propsrigCandidates || propsrigCandidates.length === 0) {
    return false;
  }
  const candidateSet = new Set(propsrigCandidates);
  if (candidateSet.has(sourceInputId)) {
    return true;
  }

  const queue = [sourceInputId];
  const visited = new Set<string>([sourceInputId]);

  while (queue.length > 0) {
    const currentInputId = queue.shift();
    if (!currentInputId) {
      continue;
    }
    const downstreamInputs = downstreamByInputId.get(currentInputId);
    if (!downstreamInputs || downstreamInputs.size === 0) {
      continue;
    }
    for (const nextInputId of downstreamInputs) {
      if (candidateSet.has(nextInputId)) {
        return true;
      }
      if (!visited.has(nextInputId)) {
        visited.add(nextInputId);
        queue.push(nextInputId);
      }
    }
  }

  return false;
}

function normalizeImportedBindingSummaries(
  summaries: GraphBindingSummary[],
  options: {
    components: AnimatableComponent[];
    standardInputs: Map<string, StandardRigInput>;
    componentIdRemaps?: Map<string, string>;
  },
): {
  summaries: GraphBindingSummary[];
  diagnostics: ImportNormalizationDiagnostics;
} {
  const diagnostics = createNormalizationDiagnostics();
  const componentIds = new Set(
    options.components.map((component) => component.id),
  );

  const normalizedIds = summaries.map((summary) => {
    const normalizedTargetId = normalizeBindingTargetId(
      summary.targetId,
      componentIds,
      options.standardInputs,
      options.componentIdRemaps,
    );
    if (normalizedTargetId !== summary.targetId) {
      diagnostics.targetIdRemaps.push({
        fromTargetId: summary.targetId,
        toTargetId: normalizedTargetId,
      });
    }

    const normalizedInputId = normalizeBindingInputId(
      summary.inputId,
      options.standardInputs,
    );
    if (
      summary.inputId &&
      normalizedInputId &&
      normalizedInputId !== summary.inputId
    ) {
      diagnostics.inputIdRemaps.push({
        targetId: normalizedTargetId,
        slotId: summary.slotId,
        fromInputId: summary.inputId,
        toInputId: normalizedInputId,
      });
    }

    return {
      ...summary,
      targetId: normalizedTargetId,
      inputId: normalizedInputId,
    };
  });

  const propsrigTargetsByComponentId = collectPropsRigTargetByComponentId(
    normalizedIds,
    componentIds,
    options.standardInputs,
  );
  const downstreamByInputId = buildInputDownstreamLookup(
    normalizedIds,
    options.standardInputs,
  );

  const retargeted = normalizedIds.map((summary) => {
    if (!componentIds.has(summary.targetId) || !summary.inputId) {
      return summary;
    }
    if (summary.inputId === SELF_BINDING_ID) {
      return summary;
    }
    const sourceInput = options.standardInputs.get(summary.inputId);
    if (sourceInput && isPropsRigStandardInputPath(sourceInput.path)) {
      return summary;
    }

    if (
      hasTransitivePropsRigBoundaryPath({
        componentId: summary.targetId,
        sourceInputId: summary.inputId,
        propsrigTargetsByComponentId,
        downstreamByInputId,
      })
    ) {
      return summary;
    }

    const propsrigTargetId = propsrigTargetsByComponentId.get(
      summary.targetId,
    )?.[0];
    if (!propsrigTargetId) {
      diagnostics.animatableFallbacks.push({
        animatableTargetId: summary.targetId,
        slotId: summary.slotId,
        inputId: summary.inputId,
        reason: sourceInput
          ? "missing-propsrig-target"
          : "missing-source-input",
      });
      return summary;
    }

    diagnostics.animatableRetargets.push({
      animatableTargetId: summary.targetId,
      slotId: summary.slotId,
      fromInputId: summary.inputId,
      toPropsRigInputId: propsrigTargetId,
    });
    return {
      ...summary,
      targetId: propsrigTargetId,
    };
  });

  return { summaries: retargeted, diagnostics };
}

function buildBindingFromSummaries(
  targetId: string,
  target: BindingTarget,
  summaries: GraphBindingSummary[],
): AnimatableBinding {
  if (summaries.length === 0) {
    return ensureBindingStructure(createDefaultBinding(target), target);
  }

  const slots = summaries.map((summary, index) => {
    const aliasBase =
      summary.slotAlias && summary.slotAlias.trim().length > 0
        ? summary.slotAlias.trim()
        : summary.slotId && summary.slotId.trim().length > 0
          ? summary.slotId.trim()
          : `s${index + 1}`;
    const slotId =
      summary.slotId && summary.slotId.trim().length > 0
        ? summary.slotId.trim()
        : aliasBase;
    const slotValueType: BindingValueType =
      summary.valueType === "vector" ? "vector" : "scalar";
    return {
      id: slotId,
      alias: aliasBase,
      inputId: summary.inputId,
      valueType: slotValueType,
    };
  });

  const targetValueType: BindingValueType =
    target.valueType === "vector" ? "vector" : "scalar";

  const primarySlot = slots[0] ?? {
    id: PRIMARY_SLOT_ID,
    alias: PRIMARY_SLOT_ALIAS,
    inputId: null,
    valueType: targetValueType,
  };

  const binding: AnimatableBinding = {
    targetId,
    inputId: primarySlot.inputId ?? null,
    slots,
    expression: coerceExpression(summaries[0]?.expression, PRIMARY_SLOT_ALIAS),
  };

  const metadataSource = summaries.find((summary) => summary.metadata);
  if (metadataSource?.metadata) {
    binding.metadata = cloneBindingMetadata(metadataSource.metadata);
  }

  return ensureBindingStructure(binding, target);
}

function buildBindings(
  summaries: GraphBindingSummary[],
  components: AnimatableComponent[],
  standardInputs: Map<string, StandardRigInput>,
): { bindings: BindingMap; inputBindings: InputBindingMap } {
  const groups = new Map<string, GraphBindingSummary[]>();
  summaries.forEach((summary) => {
    const key = summary.targetId;
    const existing = groups.get(key);
    if (existing) {
      existing.push(summary);
    } else {
      groups.set(key, [summary]);
    }
  });

  const bindings: BindingMap = {};
  components.forEach((component) => {
    const summaries = groups.get(component.id) ?? [];
    const target = bindingTargetFromComponent(component);
    bindings[component.id] = buildBindingFromSummaries(
      component.id,
      target,
      summaries,
    );
  });

  const inputBindings: InputBindingMap = {};
  standardInputs.forEach((input) => {
    const summaries = groups.get(input.id) ?? [];
    if (summaries.length === 0) {
      return;
    }
    const target = bindingTargetFromInput(input);
    inputBindings[input.id] = buildBindingFromSummaries(
      input.id,
      target,
      summaries,
    );
  });

  return { bindings, inputBindings };
}

function populateInputHierarchy(
  standardInputs: Map<string, StandardRigInput>,
  inputBindings: InputBindingMap,
) {
  standardInputs.forEach((input) => {
    input.parentBinding = null;
    input.derivedChildren = [];
  });

  Object.entries(inputBindings).forEach(([inputId, binding]) => {
    const owner = standardInputs.get(inputId);
    if (owner) {
      owner.parentBinding = bindingToDefinition(binding);
    }
    binding.slots.forEach((slot) => {
      if (!slot.inputId) {
        return;
      }
      const parent = standardInputs.get(slot.inputId);
      if (!parent) {
        return;
      }
      const existing = parent.derivedChildren ?? [];
      if (!existing.includes(inputId)) {
        parent.derivedChildren = [...existing, inputId];
      }
    });
  });
}

export function rehydrateRigDataFromGraph(
  spec: GraphSpec,
  options: {
    faceId: string;
    components: AnimatableComponent[];
    provisionedPropsRigInputs?: StandardRigInput[];
  },
): RehydratedRigData {
  const metadata = (spec as unknown as { metadata?: VizijMetadataContainer })
    ?.metadata;
  const vizij = metadata?.vizij;
  if (!vizij) {
    throw new Error("Graph spec is missing Vizij metadata.");
  }

  const importedFaceId = vizij.faceId?.trim() ?? null;
  const faceIdMismatches: FaceIdMismatchDiagnostic[] = [];
  if (importedFaceId && importedFaceId !== options.faceId) {
    faceIdMismatches.push({
      importedFaceId,
      loadedFaceId: options.faceId,
    });
  }

  const inputMetadata = new Map<string, { source?: string; root?: string }>();

  const standardInputs = vizij.inputs.map((input) => {
    const normalizedPath = normalizeImportedInputPath(input);
    const group = resolveImportedInputGroup(input, normalizedPath);
    const created = createStandardRigInput({
      id: input.id,
      path: normalizedPath,
      sourceId: input.sourceId,
      label: migrateLegacyStandardRigInputLabel(normalizedPath, input.label),
      group,
      defaultValue: input.defaultValue,
      range: {
        min: input.range.min,
        max: input.range.max,
      },
    });
    inputMetadata.set(input.id, {
      source: input.source,
      root: input.root ?? group,
    });
    return created;
  });
  const standardInputsById = new Map(
    standardInputs.map((input) => [input.id, input]),
  );
  const standardInputsByPath = new Map(
    standardInputs.map((input) => [
      normalizeStandardRigInputPath(input.path),
      input,
    ]),
  );
  const provisionedPropsRigInputsByPath = new Map<string, StandardRigInput>();
  (options.provisionedPropsRigInputs ?? []).forEach((provisioned) => {
    const normalizedPath = normalizeStandardRigInputPath(provisioned.path);
    if (!isPropsRigStandardInputPath(normalizedPath)) {
      return;
    }
    provisionedPropsRigInputsByPath.set(normalizedPath, provisioned);
  });
  const componentIdRemaps = new Map<string, string>();
  standardInputs.forEach((input) => {
    const normalizedPath = normalizeStandardRigInputPath(input.path);
    if (!isPropsRigStandardInputPath(normalizedPath)) {
      return;
    }
    const provisioned = provisionedPropsRigInputsByPath.get(normalizedPath);
    if (!provisioned) {
      return;
    }
    const importedComponentId = resolveComponentIdFromSourceId(input.sourceId);
    const currentComponentId = resolveComponentIdFromSourceId(
      provisioned.sourceId,
    );
    if (!importedComponentId || !currentComponentId) {
      return;
    }
    if (importedComponentId !== currentComponentId) {
      componentIdRemaps.set(importedComponentId, currentComponentId);
      const importedSeparatorIndex = importedComponentId.indexOf(":");
      const currentSeparatorIndex = currentComponentId.indexOf(":");
      if (importedSeparatorIndex > 0 && currentSeparatorIndex > 0) {
        const importedBaseId = importedComponentId.slice(
          0,
          importedSeparatorIndex,
        );
        const currentBaseId = currentComponentId.slice(
          0,
          currentSeparatorIndex,
        );
        if (importedBaseId !== currentBaseId) {
          componentIdRemaps.set(importedBaseId, currentBaseId);
        }
      }
    }
    if (
      provisioned.sourceId &&
      provisioned.sourceId.trim().length > 0 &&
      input.sourceId !== provisioned.sourceId
    ) {
      input.sourceId = provisioned.sourceId;
    }
  });
  const createdPropsRigInputs: PropsRigInputCreatedDiagnostic[] = [];

  (options.provisionedPropsRigInputs ?? []).forEach((provisioned) => {
    const normalizedPath = normalizeStandardRigInputPath(provisioned.path);
    if (!isPropsRigStandardInputPath(normalizedPath)) {
      return;
    }
    if (standardInputsByPath.has(normalizedPath)) {
      return;
    }
    const fallbackId = createStandardRigInputFromPath(normalizedPath).id;
    const inputId = resolveUniqueImportedInputId(
      provisioned.id ?? fallbackId,
      standardInputsById,
    );
    const resolvedGroup =
      provisioned.group?.trim() ||
      deriveGroupFromNormalizedPath(normalizedPath) ||
      "auto";
    const created = createStandardRigInput({
      id: inputId,
      path: normalizedPath,
      sourceId: provisioned.sourceId,
      label: provisioned.label,
      group: resolvedGroup,
      defaultValue: provisioned.defaultValue,
      range: {
        min: provisioned.range.min,
        max: provisioned.range.max,
      },
    });
    standardInputs.push(created);
    standardInputsById.set(created.id, created);
    standardInputsByPath.set(normalizedPath, created);
    inputMetadata.set(created.id, {
      source: "auto",
      root: resolvedGroup,
    });
    createdPropsRigInputs.push({
      inputId: created.id,
      path: created.path,
      sourceId: created.sourceId,
    });
  });

  const legacyPropsRigInputPaths = new Set<string>();

  vizij.inputs.forEach((input) => {
    if (isLegacyPropsRigPath(input.path)) {
      legacyPropsRigInputPaths.add(input.path);
    }
  });

  const importSummaries = synthesizeInputBindingSummariesFromPipelineLinks({
    summaries: vizij.bindings,
    pipelineV1: vizij.pipelineV1,
    knownInputIds: new Set(standardInputsById.keys()),
  });

  const { summaries: normalizedSummaries, diagnostics } =
    normalizeImportedBindingSummaries(importSummaries, {
      components: options.components,
      standardInputs: standardInputsById,
      componentIdRemaps,
    });
  diagnostics.faceIdMismatches.push(...faceIdMismatches);
  diagnostics.createdPropsRigInputs.push(...createdPropsRigInputs);

  const { bindings, inputBindings } = buildBindings(
    normalizedSummaries,
    options.components,
    standardInputsById,
  );

  populateInputHierarchy(standardInputsById, inputBindings);

  return {
    sourceFaceId: importedFaceId,
    standardInputs,
    bindings,
    inputBindings,
    inputMetadata,
    legacyPropsRigInputPaths: Array.from(legacyPropsRigInputPaths),
    normalizationDiagnostics: diagnostics,
  };
}
