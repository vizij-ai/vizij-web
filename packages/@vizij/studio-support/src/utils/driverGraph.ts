import type {
  RigDriver,
  RigDriverGraph,
  RigDriverSource,
  RigDriverTarget,
  RigDriverTransform,
  StandardRigInput,
} from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";
import {
  ensureBindingStructure,
  type AnimatableBinding,
  type BindingMap,
} from "@vizij/node-graph-authoring";

export interface BuildAuthoringDriverGraphOptions {
  faceId: string;
  namespace: string;
  bindings: BindingMap;
  componentsById: Map<string, AnimatableComponent>;
  standardInputsById: Map<string, StandardRigInput>;
}

function createSourceForBinding(
  binding: AnimatableBinding,
  standardInputsById: Map<string, StandardRigInput>,
): RigDriverSource {
  if (!binding.inputId) {
    return {
      type: "unassigned",
      id: `unassigned:${binding.targetId}`,
      label: "Unassigned",
    };
  }
  const input = standardInputsById.get(binding.inputId);
  if (!input) {
    return {
      type: "standard-input",
      id: binding.inputId,
      label: binding.inputId,
    };
  }
  return {
    type: "standard-input",
    id: input.id,
    label: input.label,
    path: input.path,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function createCenteredRemapTransform(
  binding: AnimatableBinding,
  component: AnimatableComponent,
  standardInputsById: Map<string, StandardRigInput>,
): RigDriverTransform {
  const input = binding.inputId
    ? standardInputsById.get(binding.inputId)
    : null;
  const inLow = input?.range.min ?? -1;
  const inHigh = input?.range.max ?? 1;
  const inAnchor = input ? clamp(input.defaultValue, inLow, inHigh) : 0;
  const outLow = component.range?.min ?? -1;
  const outHigh = component.range?.max ?? 1;
  const outAnchor = clamp(component.defaultValue, outLow, outHigh);
  return {
    type: "centered-remap",
    inLow,
    inAnchor,
    inHigh,
    outLow,
    outAnchor,
    outHigh,
  };
}

function createTargetForComponent(
  component: AnimatableComponent,
): RigDriverTarget {
  return {
    type: "animatable",
    id: component.animatableId,
    path: component.animatableId,
    component: component.component,
    label: component.label,
  };
}

export function buildAuthoringDriverGraph(
  options: BuildAuthoringDriverGraphOptions,
): RigDriverGraph {
  const { faceId, namespace, bindings, componentsById, standardInputsById } =
    options;

  const drivers: RigDriver[] = [];

  Object.values(bindings).forEach((binding) => {
    const component = componentsById.get(binding.targetId);
    if (!component) {
      return;
    }
    const normalized = ensureBindingStructure(binding, component);

    const source = createSourceForBinding(normalized, standardInputsById);
    const transform = createCenteredRemapTransform(
      normalized,
      component,
      standardInputsById,
    );
    const target = createTargetForComponent(component);

    drivers.push({
      id: `remap:${normalized.targetId}`,
      kind: "remap",
      source,
      outputs: [
        {
          target,
          transform,
        },
      ],
      metadata: {
        targetId: normalized.targetId,
        animatableId: component.animatableId,
        animatableType: component.animatableType,
        standardInputId: normalized.inputId ?? null,
      },
    });
  });

  return {
    faceId,
    namespace,
    drivers,
    standardInputs: Array.from(standardInputsById.values()),
  };
}
