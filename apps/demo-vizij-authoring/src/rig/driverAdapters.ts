import type {
  RigDriver,
  RigDriverGraph,
  RigDriverSource,
  RigDriverTransform,
  RigDriverTarget,
  StandardRigInput,
} from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";

import {
  ensureBindingStructure,
  type AnimatableBinding,
  type BindingMap,
} from "./state";
import type { RemapSettings } from "@vizij/utils";

interface BuildAuthoringDriverGraphOptions {
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

function createCenteredRemapTransform(
  remap: RemapSettings,
): RigDriverTransform {
  return {
    type: "centered-remap",
    inLow: remap.inLow,
    inAnchor: remap.inAnchor,
    inHigh: remap.inHigh,
    outLow: remap.outLow,
    outAnchor: remap.outAnchor,
    outHigh: remap.outHigh,
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
    const transform = createCenteredRemapTransform(normalized.remap);
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
