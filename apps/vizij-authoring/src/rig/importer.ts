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
  createStandardRigInput,
  deriveGroupFromNormalizedPath,
  normalizeStandardRigInputPath,
  stripStandardInputPathPrefix,
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
  const normalized = normalizeStandardRigInputPath(descriptor.path);
  return stripStandardInputPathPrefix(normalized);
}

function coerceExpression(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
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
  metadata: VizijGraphMetadata,
  components: AnimatableComponent[],
  standardInputs: Map<string, StandardRigInput>,
): { bindings: BindingMap; inputBindings: InputBindingMap } {
  const groups = new Map<string, GraphBindingSummary[]>();
  metadata.bindings.forEach((summary) => {
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

  const standardInputsById = new Map(
    standardInputs.map((input) => [input.id, input]),
  );

  const { bindings, inputBindings } = buildBindings(
    vizij,
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
  };
}
