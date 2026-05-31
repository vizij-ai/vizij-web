import type { StandardRigInput } from "@vizij/utils";
import {
  resolveControllableInputId as resolveControllableInputIdCore,
  resolveEffectiveBindingInputId,
  resolveEffectiveBindingStandardInput,
  resolveEffectiveControllableBindingStandardInput as resolveEffectiveControllableBindingStandardInputCore,
  type BindingResolutionBlockedCode,
} from "@vizij/studio-support";

type BindingSlotLike = {
  inputId?: string | null;
};

type BindingLike = {
  inputId?: string | null;
  slots?: BindingSlotLike[] | null;
};

type InputBindingMapLike = Record<string, BindingLike | undefined>;

function formatBindingBlockedReason(
  code: BindingResolutionBlockedCode | null,
): string | null {
  switch (code) {
    case "derived-input-cycle":
      return "Derived input cycle detected while resolving driver.";
    case "derived-input-missing-parent":
      return "Derived variable has no self slot and no parent drivers. Use the Parents section to repair.";
    case "derived-input-multiple-parents":
      return "Derived variable has multiple parent drivers and no local self control. Use the Parents section to select a controllable source.";
    default:
      return null;
  }
}

export { resolveEffectiveBindingInputId, resolveEffectiveBindingStandardInput };

export function resolveControllableInputId(
  inputId: string | null | undefined,
  inputBindings: InputBindingMapLike,
): {
  inputId: string | null;
  blockedReason: string | null;
} {
  const resolved = resolveControllableInputIdCore(inputId, inputBindings);
  return {
    inputId: resolved.inputId,
    blockedReason: formatBindingBlockedReason(resolved.blockedCode),
  };
}

export function resolveEffectiveControllableBindingStandardInput(
  binding: BindingLike | null | undefined,
  standardInputsById: Map<string, StandardRigInput>,
  standardInputs: readonly StandardRigInput[],
  inputBindings: InputBindingMapLike,
): {
  inputId: string | null;
  input: StandardRigInput | null;
  unresolvedInputId: string | null;
  blockedReason: string | null;
} {
  const resolved = resolveEffectiveControllableBindingStandardInputCore(
    binding,
    standardInputsById,
    standardInputs,
    inputBindings,
  );
  return {
    inputId: resolved.inputId,
    input: resolved.input,
    unresolvedInputId: resolved.unresolvedInputId,
    blockedReason: formatBindingBlockedReason(resolved.blockedCode),
  };
}
