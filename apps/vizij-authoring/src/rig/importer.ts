import type { GraphSpec } from "@vizij/node-graph-wasm";
import {
  createDefaultBinding,
  createDefaultRemap,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingToDefinition,
  ensureBindingStructure,
  type AnimatableBinding,
  type BindingMap,
  type InputBindingMap,
  PRIMARY_SLOT_ALIAS,
  PRIMARY_SLOT_ID,
} from "./state";
import {
  createStandardRigInput,
  cloneRemapSettings,
  type AnimatableComponent,
  type AnimatableValue,
  type StandardRigInput,
} from "@vizij/utils";
import type { GraphBindingSummary } from "./graphBuilder";

interface VizijGraphMetadataInput {
  id: string;
  path: string;
  label: string;
  group: string;
  defaultValue: number;
  range: { min: number; max: number };
}

interface VizijGraphMetadata {
  faceId: string;
  inputs: VizijGraphMetadataInput[];
  bindings: GraphBindingSummary[];
}

interface VizijMetadataContainer {
  vizij?: VizijGraphMetadata;
}

export interface RehydratedRigData {
  standardInputs: StandardRigInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
}

function coerceExpression(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : fallback;
}

function buildBindingFromSummaries(
  targetId: string,
  target: {
    id: string;
    defaultValue: number;
    range: { min: number; max: number };
  },
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
    const remap = summary.remap
      ? cloneRemapSettings(summary.remap)
      : cloneRemapSettings(createDefaultRemap(target));
    return {
      id: slotId,
      alias: aliasBase,
      inputId: summary.inputId,
      remap,
    };
  });

  const primarySlot = slots[0] ?? {
    id: PRIMARY_SLOT_ID,
    alias: PRIMARY_SLOT_ALIAS,
    inputId: null,
    remap: cloneRemapSettings(createDefaultRemap(target)),
  };

  const binding: AnimatableBinding = {
    targetId,
    inputId: primarySlot.inputId ?? null,
    remap: cloneRemapSettings(primarySlot.remap),
    slots,
    expression: coerceExpression(
      summaries[0]?.expression,
      primarySlot.alias ?? PRIMARY_SLOT_ALIAS,
    ),
  };

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

  if (vizij.faceId && vizij.faceId !== options.faceId) {
    // eslint-disable-next-line no-console -- diagnostics for mismatched assets
    console.warn(
      `Imported graph metadata targets faceId "${vizij.faceId}" but the loaded GLB is "${options.faceId}". Continuing with the loaded asset.`,
    );
  }

  const standardInputs = vizij.inputs.map((input) =>
    createStandardRigInput({
      id: input.id,
      path: input.path,
      label: input.label,
      group: input.group,
      defaultValue: input.defaultValue,
      range: {
        min: input.range.min,
        max: input.range.max,
      },
    }),
  );

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
    standardInputs,
    bindings,
    inputBindings,
  };
}
