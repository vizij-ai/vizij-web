import {
  bindingFromDefinition,
  bindingTargetFromInput,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import {
  SELF_BINDING_ID,
  type RigBindingDefinition,
  type StandardRigInput,
} from "@vizij/utils";

export function resolvePendingInputBindings(
  pendingDefinitions: Record<string, RigBindingDefinition> | null | undefined,
  inputsById: Map<string, StandardRigInput>,
): InputBindingMap | null {
  if (!pendingDefinitions || inputsById.size === 0) {
    return null;
  }
  const next: InputBindingMap = {};
  Object.entries(pendingDefinitions).forEach(([inputId, definition]) => {
    const input = inputsById.get(inputId);
    if (!input) {
      return;
    }
    const target = bindingTargetFromInput(input);
    const binding = bindingFromDefinition(target, definition);
    const hasParents =
      (binding.inputId && binding.inputId !== SELF_BINDING_ID) ||
      binding.slots.some(
        (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
      );
    if (!hasParents) {
      return;
    }
    next[inputId] = binding;
  });
  return next;
}
