import { SELF_BINDING_ID } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";

interface BindingSlotLike {
  inputId?: string | null;
}

interface BindingLike {
  inputId?: string | null;
  slots?: BindingSlotLike[] | null;
}

function normalizeInputId(inputId: string | null | undefined): string | null {
  if (!inputId) {
    return null;
  }
  const trimmed = inputId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveEffectiveBindingInputId(
  binding: BindingLike | null | undefined,
): string | null {
  if (!binding) {
    return null;
  }

  const slots = Array.isArray(binding.slots) ? binding.slots : [];
  for (const slot of slots) {
    const inputId = normalizeInputId(slot?.inputId);
    if (!inputId || inputId === SELF_BINDING_ID) {
      continue;
    }
    return inputId;
  }

  const fallback = normalizeInputId(binding.inputId);
  if (!fallback || fallback === SELF_BINDING_ID) {
    return null;
  }
  return fallback;
}

function normalizeInputIdentifier(value: string): string {
  return value.trim().replace(/^\/+/, "").replace(/\/+/g, "_").toLowerCase();
}

export function resolveEffectiveBindingStandardInput(
  binding: BindingLike | null | undefined,
  standardInputsById: Map<string, StandardRigInput>,
  standardInputs: readonly StandardRigInput[],
): {
  inputId: string | null;
  input: StandardRigInput | null;
  unresolvedInputId: string | null;
} {
  const inputId = resolveEffectiveBindingInputId(binding);
  if (!inputId) {
    return {
      inputId: null,
      input: null,
      unresolvedInputId: null,
    };
  }

  const direct = standardInputsById.get(inputId);
  if (direct) {
    return {
      inputId,
      input: direct,
      unresolvedInputId: null,
    };
  }

  const normalizedId = normalizeInputIdentifier(inputId);
  const fallback =
    standardInputs.find(
      (candidate) => normalizeInputIdentifier(candidate.id) === normalizedId,
    ) ??
    standardInputs.find(
      (candidate) => normalizeInputIdentifier(candidate.path) === normalizedId,
    ) ??
    null;

  return {
    inputId: fallback?.id ?? inputId,
    input: fallback,
    unresolvedInputId: fallback ? null : inputId,
  };
}
