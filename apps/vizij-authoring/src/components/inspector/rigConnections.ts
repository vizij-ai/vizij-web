import type {
  AnimatableBinding,
  BindingMap,
  InputBindingMap,
} from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID } from "@vizij/utils";
import type { SceneObjectNode } from "../../scene/sceneGraph";

interface RigDependentTarget {
  name: string;
  targetId: string;
}

function collectBindingInputIds(binding: AnimatableBinding): string[] {
  const ids = new Set<string>();
  if (
    binding.inputId &&
    binding.inputId !== SELF_BINDING_ID &&
    binding.inputId.trim().length > 0
  ) {
    ids.add(binding.inputId);
  }
  (binding.slots ?? []).forEach((slot) => {
    if (
      slot.inputId &&
      slot.inputId !== SELF_BINDING_ID &&
      slot.inputId.trim().length > 0
    ) {
      ids.add(slot.inputId);
    }
  });
  return Array.from(ids);
}

export function collectDownstreamRigInputIds(
  selectedRigId: string,
  inputBindings: InputBindingMap,
): Set<string> {
  const downstream = new Set<string>([selectedRigId]);
  let changed = true;

  while (changed) {
    changed = false;
    Object.entries(inputBindings).forEach(([targetInputId, binding]) => {
      const bindingInputIds = collectBindingInputIds(binding);
      const dependsOnDownstream = bindingInputIds.some((inputId) =>
        downstream.has(inputId),
      );
      if (dependsOnDownstream && !downstream.has(targetInputId)) {
        downstream.add(targetInputId);
        changed = true;
      }
    });
  }

  return downstream;
}

function resolveTargetName(
  targetId: string,
  objects: SceneObjectNode[],
): string {
  for (const obj of objects) {
    for (const feat of obj.features) {
      for (const comp of feat.components) {
        if (comp.targetId === targetId) {
          return `${obj.name} · ${feat.label}${feat.components.length > 1 ? ` ${comp.label}` : ""}`;
        }
      }
    }
  }
  return targetId;
}

export function collectRigDependents(params: {
  selectedRigId: string;
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  objects: SceneObjectNode[];
}): RigDependentTarget[] {
  const { selectedRigId, bindings, inputBindings, objects } = params;
  const drivenRigIds = collectDownstreamRigInputIds(
    selectedRigId,
    inputBindings,
  );
  const targets = new Map<string, RigDependentTarget>();

  Object.entries(bindings).forEach(([targetId, binding]) => {
    const bindingInputIds = collectBindingInputIds(binding);
    const matchesDrivenPath = bindingInputIds.some((inputId) =>
      drivenRigIds.has(inputId),
    );
    if (!matchesDrivenPath) {
      return;
    }
    targets.set(targetId, {
      targetId,
      name: resolveTargetName(targetId, objects),
    });
  });

  return Array.from(targets.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}
