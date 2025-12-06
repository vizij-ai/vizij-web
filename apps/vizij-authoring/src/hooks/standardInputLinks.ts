import type { MutableRefObject } from "react";

import {
  addBindingSlot,
  bindingTargetFromInput,
  createDefaultParentBinding,
  ensureBindingStructure,
  PRIMARY_SLOT_ID,
  updateBindingWithInput,
  type AnimatableBinding,
  type BindingTarget,
} from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";

export type BindingUpdater = (
  targetId: string,
  initializer: (target: BindingTarget) => AnimatableBinding,
  transform: (
    binding: AnimatableBinding,
    target: BindingTarget,
  ) => AnimatableBinding,
  options?: { preserveExpression?: boolean },
) => void;

interface StandardInputRefs {
  standardInputsByIdRef: MutableRefObject<Map<string, StandardRigInput>>;
  allStandardInputsRef: MutableRefObject<Map<string, StandardRigInput>>;
}

export interface LinkChildInputOptions extends StandardInputRefs {
  parentId: string;
  childId: string;
  updateInputBinding: BindingUpdater;
}

export function linkChildInput({
  parentId,
  childId,
  updateInputBinding,
  standardInputsByIdRef,
  allStandardInputsRef,
}: LinkChildInputOptions): void {
  if (parentId === childId) {
    return;
  }
  const parent =
    standardInputsByIdRef.current.get(parentId) ??
    allStandardInputsRef.current.get(parentId);
  const child =
    standardInputsByIdRef.current.get(childId) ??
    allStandardInputsRef.current.get(childId);
  if (!parent || !child) {
    return;
  }

  updateInputBinding(childId, createDefaultParentBinding, (binding, target) => {
    let next = binding;
    const existingSlot = next.slots.find((slot) => slot.inputId === parent.id);
    let targetSlotId = existingSlot?.id ?? null;
    if (!targetSlotId) {
      const reusableSlot = next.slots.find(
        (slot, index) =>
          index > 0 && (slot.inputId === null || slot.inputId === undefined),
      );
      if (reusableSlot) {
        targetSlotId = reusableSlot.id;
      } else {
        next = addBindingSlot(next, target);
        targetSlotId = next.slots[next.slots.length - 1]?.id ?? null;
      }
    }
    return updateBindingWithInput(
      next,
      target,
      parent,
      targetSlotId ?? undefined,
    );
  });
}

export interface UnlinkChildInputOptions extends StandardInputRefs {
  parentId: string;
  childId: string;
  updateInputBinding: BindingUpdater;
}

export function unlinkChildInput({
  parentId,
  childId,
  updateInputBinding,
  standardInputsByIdRef,
  allStandardInputsRef,
}: UnlinkChildInputOptions): void {
  updateInputBinding(childId, createDefaultParentBinding, (binding, target) => {
    const slotIdsToClear = new Set<string>();
    if (binding.inputId === parentId) {
      slotIdsToClear.add(binding.slots[0]?.id ?? PRIMARY_SLOT_ID);
    }
    binding.slots.forEach((slot) => {
      if (slot.inputId === parentId && slot.id) {
        slotIdsToClear.add(slot.id);
      }
    });
    if (slotIdsToClear.size === 0) {
      return binding;
    }
    let next = binding;
    slotIdsToClear.forEach((slotId) => {
      next = updateBindingWithInput(next, target, undefined, slotId);
    });
    const ensured = ensureBindingStructure(next, target);
    let normalized = ensured;
    if (slotIdsToClear.has(ensured.slots[0]?.id ?? PRIMARY_SLOT_ID)) {
      normalized = updateBindingWithInput(
        normalized,
        target,
        undefined,
        ensured.slots[0]?.id ?? PRIMARY_SLOT_ID,
      );
    }
    const resolvedChild =
      standardInputsByIdRef.current.get(childId) ??
      allStandardInputsRef.current.get(childId);
    const resolvedParent =
      standardInputsByIdRef.current.get(parentId) ??
      allStandardInputsRef.current.get(parentId);
    if (!resolvedChild || !resolvedParent) {
      return normalized;
    }
    const targetDescriptor = bindingTargetFromInput(resolvedChild);
    const parentTarget = bindingTargetFromInput(resolvedParent);
    if (normalized.inputId === resolvedParent.id) {
      normalized = updateBindingWithInput(
        normalized,
        targetDescriptor,
        undefined,
        parentTarget.id,
      );
    }
    return normalized;
  });
}
