import { SELF_BINDING_ID } from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import {
  getStandardInputResolutionIndex,
  resolveUniqueAliasIdFromStandardInputs,
} from "./standardInputResolutionIndex";

interface BindingSlotLike {
  inputId?: string | null;
}

interface BindingLike {
  inputId?: string | null;
  slots?: BindingSlotLike[] | null;
}

type InputBindingMapLike = Record<string, BindingLike | undefined>;

export type BindingResolutionBlockedCode =
  | "derived-input-cycle"
  | "derived-input-missing-parent"
  | "derived-input-multiple-parents";

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
  blockedCode: BindingResolutionBlockedCode | null;
} {
  const normalized = normalizeInputId(inputId);
  if (!normalized) {
    return { inputId: null, blockedCode: null };
  }
  const visited = new Set<string>();
  let current: string | null = normalized;
  while (current) {
    if (visited.has(current)) {
      return {
        inputId: null,
        blockedCode: "derived-input-cycle",
      };
    }
    visited.add(current);

    const binding = inputBindings[current];
    if (!binding) {
      return { inputId: current, blockedCode: null };
    }

    if (hasSelfSlot(binding)) {
      return { inputId: current, blockedCode: null };
    }

    const parents = collectParentInputIds(binding);
    if (parents.length === 0) {
      return {
        inputId: null,
        blockedCode: "derived-input-missing-parent",
      };
    }
    if (parents.length > 1) {
      return {
        inputId: null,
        blockedCode: "derived-input-multiple-parents",
      };
    }

    current = parents[0] ?? null;
  }

  return { inputId: null, blockedCode: null };
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
  blockedCode: BindingResolutionBlockedCode | null;
} {
  const resolved = resolveEffectiveBindingStandardInput(
    binding,
    standardInputsById,
    standardInputs,
  );
  if (!resolved.inputId) {
    return {
      ...resolved,
      blockedCode: null,
    };
  }

  const controllable = resolveControllableInputId(
    resolved.inputId,
    inputBindings,
  );
  if (controllable.blockedCode) {
    return {
      ...resolved,
      blockedCode: controllable.blockedCode,
    };
  }
  if (!controllable.inputId || controllable.inputId === resolved.inputId) {
    return {
      ...resolved,
      blockedCode: null,
    };
  }

  const upstream = resolveEffectiveBindingStandardInput(
    { inputId: controllable.inputId },
    standardInputsById,
    standardInputs,
  );
  return {
    ...upstream,
    blockedCode: null,
  };
}
