import { SELF_BINDING_ID } from "@vizij/utils";

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
