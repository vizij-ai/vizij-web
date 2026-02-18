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
  deriveGroupFromNormalizedPath,
  isAutorigStandardInputPath,
  normalizeStandardRigInputPath,
  resolveStandardRigInputId,
  type AnimatableComponent,
  type AnimatableValue,
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

interface VizijGraphMetadata {
  faceId: string;
  inputs: VizijGraphMetadataInput[];
  bindings: GraphBindingSummary[];
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
  legacyAutorigInputPaths: string[];
  normalizationDiagnostics: ImportNormalizationDiagnostics;
}

const LEGACY_AUTORIG_PREFIX = "/rig/element";

type BindingFallbackReason = "missing-source-input" | "missing-autorig-target";

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
  toAutorigInputId: string;
}

interface AnimatableFallbackDiagnostic {
  animatableTargetId: string;
  slotId: string;
  inputId: string;
  reason: BindingFallbackReason;
}

export interface ImportNormalizationDiagnostics {
  inputIdRemaps: BindingInputRemapDiagnostic[];
  targetIdRemaps: BindingTargetRemapDiagnostic[];
  animatableRetargets: AnimatableRetargetDiagnostic[];
  animatableFallbacks: AnimatableFallbackDiagnostic[];
}

function isLegacyAutorigPath(path: string | undefined | null): boolean {
  if (!path) {
    return false;
  }
  const trimmed = path.trim();
  return (
    trimmed.startsWith(`${LEGACY_AUTORIG_PREFIX}/`) ||
    trimmed.startsWith(`${LEGACY_AUTORIG_PREFIX}`)
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
  // Preserve the /standard/ prefix for standard inputs - don't strip it
  // The UI (StdFaceChannelsPanel) expects the /standard/ prefix to be present
  return normalizeStandardRigInputPath(descriptor.path);
}

function coerceExpression(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function createNormalizationDiagnostics(): ImportNormalizationDiagnostics {
  return {
    inputIdRemaps: [],
    targetIdRemaps: [],
    animatableRetargets: [],
    animatableFallbacks: [],
  };
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
): string {
  const trimmed = targetId.trim();
  if (!trimmed || componentIds.has(trimmed)) {
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

function collectAutorigTargetByComponentId(
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
    if (!isAutorigStandardInputPath(input.path)) {
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
    if (!source || !isAutorigStandardInputPath(source.path)) {
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

function hasTransitiveAutorigBoundaryPath(params: {
  componentId: string;
  sourceInputId: string;
  autorigTargetsByComponentId: Map<string, string[]>;
  downstreamByInputId: Map<string, Set<string>>;
}): boolean {
  const {
    componentId,
    sourceInputId,
    autorigTargetsByComponentId,
    downstreamByInputId,
  } = params;
  const autorigCandidates = autorigTargetsByComponentId.get(componentId);
  if (!autorigCandidates || autorigCandidates.length === 0) {
    return false;
  }
  const candidateSet = new Set(autorigCandidates);
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

  const autorigTargetsByComponentId = collectAutorigTargetByComponentId(
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
    if (sourceInput && isAutorigStandardInputPath(sourceInput.path)) {
      return summary;
    }

    if (
      hasTransitiveAutorigBoundaryPath({
        componentId: summary.targetId,
        sourceInputId: summary.inputId,
        autorigTargetsByComponentId,
        downstreamByInputId,
      })
    ) {
      return summary;
    }

    const autorigTargetId = autorigTargetsByComponentId.get(
      summary.targetId,
    )?.[0];
    if (!autorigTargetId) {
      diagnostics.animatableFallbacks.push({
        animatableTargetId: summary.targetId,
        slotId: summary.slotId,
        inputId: summary.inputId,
        reason: sourceInput ? "missing-autorig-target" : "missing-source-input",
      });
      return summary;
    }

    diagnostics.animatableRetargets.push({
      animatableTargetId: summary.targetId,
      slotId: summary.slotId,
      fromInputId: summary.inputId,
      toAutorigInputId: autorigTargetId,
    });
    return {
      ...summary,
      targetId: autorigTargetId,
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
    animatables: Record<string, AnimatableValue>;
    components: AnimatableComponent[];
  },
): RehydratedRigData {
  const metadata = (spec as unknown as { metadata?: VizijMetadataContainer })
    ?.metadata;
  const vizij = metadata?.vizij;
  if (!vizij) {
    throw new Error("Graph spec is missing Vizij metadata.");
  }

  const importedFaceId = vizij.faceId?.trim() ?? null;

  if (importedFaceId && importedFaceId !== options.faceId) {
    // eslint-disable-next-line no-console -- diagnostics for mismatched assets
    console.warn(
      `Imported graph metadata targets faceId "${importedFaceId}" but the loaded GLB is "${options.faceId}". Continuing with the loaded asset.`,
    );
  }

  const inputMetadata = new Map<string, { source?: string; root?: string }>();

  const standardInputs = vizij.inputs.map((input) => {
    const normalizedPath = normalizeImportedInputPath(input);
    const group = resolveImportedInputGroup(input, normalizedPath);
    const created = createStandardRigInput({
      id: input.id,
      path: normalizedPath,
      sourceId: input.sourceId,
      label: input.label,
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

  const legacyAutorigInputPaths = new Set<string>();

  vizij.inputs.forEach((input) => {
    if (isLegacyAutorigPath(input.path)) {
      legacyAutorigInputPaths.add(input.path);
    }
  });

  const standardInputsById = new Map(
    standardInputs.map((input) => [input.id, input]),
  );

  const { summaries: normalizedSummaries, diagnostics } =
    normalizeImportedBindingSummaries(vizij.bindings, {
      components: options.components,
      standardInputs: standardInputsById,
    });

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
    legacyAutorigInputPaths: Array.from(legacyAutorigInputPaths),
    normalizationDiagnostics: diagnostics,
  };
}
