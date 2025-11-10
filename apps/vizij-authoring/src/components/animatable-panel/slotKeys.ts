const SLOT_KEY_DELIMITER = "::";

export function createSlotKey(targetId: string, slotId: string): string {
  return `${targetId}${SLOT_KEY_DELIMITER}${slotId}`;
}
