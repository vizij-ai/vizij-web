import type { AnimatableBinding } from "@vizij/node-graph-authoring";

const SLOT_KEY_DELIMITER = "::";

export function createSlotKey(targetId: string, slotId: string): string {
  return `${targetId}${SLOT_KEY_DELIMITER}${slotId}`;
}

export function getSlotIdentifier(
  slot: AnimatableBinding["slots"][number],
  index: number,
): string {
  if (slot.id && slot.id.trim().length > 0) {
    return slot.id.trim();
  }
  if (slot.alias && slot.alias.trim().length > 0) {
    return slot.alias.trim();
  }
  return `s${index + 1}`;
}
