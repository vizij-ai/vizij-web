import { SELF_BINDING_ID } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import {
  getStandardInputResolutionIndex,
  resolveUniqueAliasIdFromStandardInputs,
} from "../../utils/standardInputResolutionIndex";

interface BindingSlotLike {
  inputId?: string | null;
}

interface BindingLike {
  inputId?: string | null;
  slots?: BindingSlotLike[] | null;
}

type InputBindingMapLike = Record<string, BindingLike | undefined>;

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

function collectParentInputIds(binding: BindingLike): string[] {
  const parentIds: string[] = [];
  const seen = new Set<string>();
  const push = (value: string | null | undefined) => {
    const normalized = normalizeInputId(value);
    if (!normalized || normalized === SELF_BINDING_ID || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    parentIds.push(normalized);
  };
  push(binding.inputId);
  const slots = Array.isArray(binding.slots) ? binding.slots : [];
  slots.forEach((slot) => push(slot.inputId));
  return parentIds;
}

function hasSelfSlot(binding: BindingLike): boolean {
  if (normalizeInputId(binding.inputId) === SELF_BINDING_ID) {
    return true;
  }
  const slots = Array.isArray(binding.slots) ? binding.slots : [];
  return slots.some(
    (slot) => normalizeInputId(slot.inputId) === SELF_BINDING_ID,
  );
}

export function resolveControllableInputId(
  inputId: string | null | undefined,
  inputBindings: InputBindingMapLike,
): {
  inputId: string | null;
  blockedReason: string | null;
} {
  const normalized = normalizeInputId(inputId);
  if (!normalized) {
    return { inputId: null, blockedReason: null };
  }
  const visited = new Set<string>();
  let current: string | null = normalized;
  while (current) {
    if (visited.has(current)) {
      return {
        inputId: null,
        blockedReason: "Derived input cycle detected while resolving driver.",
      };
    }
    visited.add(current);

    const binding = inputBindings[current];
    if (!binding) {
      return { inputId: current, blockedReason: null };
    }

    if (hasSelfSlot(binding)) {
      return { inputId: current, blockedReason: null };
    }

    const parents = collectParentInputIds(binding);
    if (parents.length === 0) {
      return {
        inputId: null,
        blockedReason:
          "Derived variable has no self slot and no parent drivers. Use the Parents section to repair.",
      };
    }
    if (parents.length > 1) {
      return {
        inputId: null,
        blockedReason:
          "Derived variable has multiple parent drivers and no local self control. Use the Parents section to select a controllable source.",
      };
    }

    current = parents[0] ?? null;
  }

  return { inputId: null, blockedReason: null };
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

  const index = getStandardInputResolutionIndex(standardInputsById);
  const fallbackId =
    index.resolveUniqueAliasId(inputId) ??
    resolveUniqueAliasIdFromStandardInputs(inputId, standardInputs);
  const fallback =
    (fallbackId && standardInputsById.get(fallbackId)) ||
    standardInputs.find((candidate) => candidate.id === fallbackId) ||
    null;

  return {
    inputId: fallbackId ?? inputId,
    input: fallback,
    unresolvedInputId: fallback ? null : inputId,
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
  const resolved = resolveEffectiveBindingStandardInput(
    binding,
    standardInputsById,
    standardInputs,
  );
  if (!resolved.inputId) {
    return {
      ...resolved,
      blockedReason: null,
    };
  }

  const controllable = resolveControllableInputId(
    resolved.inputId,
    inputBindings,
  );
  if (controllable.blockedReason) {
    return {
      ...resolved,
      blockedReason: controllable.blockedReason,
    };
  }
  if (!controllable.inputId || controllable.inputId === resolved.inputId) {
    return {
      ...resolved,
      blockedReason: null,
    };
  }

  const upstream = resolveEffectiveBindingStandardInput(
    { inputId: controllable.inputId },
    standardInputsById,
    standardInputs,
  );
  return {
    ...upstream,
    blockedReason: null,
  };
}
