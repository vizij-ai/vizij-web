import type { AroraValue } from "./value";

/**
 * Generic update payload using arora Value.
 * Matches the Rust AroraUpdate struct in arora-websocket crate.
 */
export type AroraUpdate = {
  values: Record<string, AroraValue>;
};

/**
 * Generic acknowledgment response.
 * Matches the Rust AroraAck struct in arora-websocket crate.
 */
export type AroraAck = {
  success: boolean;
  message?: string;
};

/**
 * Helper to create an AroraUpdate payload.
 */
export function createUpdate(
  values: Record<string, AroraValue>,
): AroraUpdate {
  return { values };
}

/**
 * Helper to create a success Ack.
 */
export function createSuccessAck(): AroraAck {
  return { success: true };
}

/**
 * Helper to create an error Ack.
 */
export function createErrorAck(message: string): AroraAck {
  return { success: false, message };
}
