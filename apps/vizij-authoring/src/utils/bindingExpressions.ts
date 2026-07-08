import {
  buildCanonicalBindingExpression,
  type AnimatableBinding,
} from "@vizij/node-graph-authoring";
import { SELF_BINDING_ID } from "@vizij/utils";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function expressionReferencesBindingSlot(
  binding: AnimatableBinding,
  slotId: string,
): boolean {
  const expression = (binding.expression ?? "").trim();
  if (expression.length === 0) {
    return false;
  }
  const slot = (binding.slots ?? []).find(
    (candidate) => candidate.id === slotId,
  );
  if (!slot || !slot.inputId || slot.inputId === SELF_BINDING_ID) {
    return false;
  }
  const slotTokenCandidates = new Set<string>();
  const alias = slot.alias?.trim();
  if (alias) {
    slotTokenCandidates.add(alias);
  }
  const trimmedSlotId = slot.id?.trim();
  if (trimmedSlotId) {
    slotTokenCandidates.add(trimmedSlotId);
  }
  for (const token of slotTokenCandidates) {
    const pattern = new RegExp(`\\b${escapeRegExp(token)}\\b`);
    if (pattern.test(expression)) {
      return true;
    }
  }
  return false;
}

export function ensureLinkedSlotActiveInExpression(
  binding: AnimatableBinding,
  slotId: string | null | undefined,
): AnimatableBinding {
  if (!slotId || expressionReferencesBindingSlot(binding, slotId)) {
    return binding;
  }
  const canonicalExpression = buildCanonicalBindingExpression(binding).trim();
  if (
    canonicalExpression.length === 0 ||
    (binding.expression ?? "").trim() === canonicalExpression
  ) {
    return binding;
  }
  return {
    ...binding,
    expression: canonicalExpression,
  };
}
