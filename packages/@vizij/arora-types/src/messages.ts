/**
 * Arora WebSocket Protocol Message Types
 *
 * This module defines the standard message format for arora-based WebSocket communication.
 * Messages are serialized as JSON with a `type` field discriminator.
 */

import type { AroraType, AroraValue } from "./value";

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Metadata describing an available slot in the system.
 * Slots represent controllable parameters or observable outputs.
 */
export type SlotInfo = {
  /** Hierarchical path identifier (e.g., "face/mouth/open") */
  path: string;
  /** Slot kind/category (e.g., "input", "output", "computed") */
  kind?: string;
  /** The arora Type that this slot accepts/produces */
  value_type?: AroraType;
  /** Minimum value constraint (for numeric types) */
  min?: number;
  /** Maximum value constraint (for numeric types) */
  max?: number;
  /** Default value */
  default_value?: AroraValue;
  /** Human-readable description */
  description?: string;
};

/**
 * @deprecated Use SlotInfo.
 * Alias kept for compatibility with existing clients.
 */
export type NodeInfo = SlotInfo;

/**
 * Descriptor for an RPC method parameter.
 */
export type MethodParam = {
  /** Parameter name */
  name: string;
  /** Parameter type */
  param_type: AroraType;
  /** Whether this parameter is required */
  required?: boolean;
  /** Default value if not provided */
  default_value?: AroraValue;
  /** Human-readable description */
  description?: string;
};

/**
 * Metadata describing an available RPC method.
 */
export type MethodInfo = {
  /** Method path/name (e.g., "audio/play", "animation/trigger", "reset") */
  path: string;
  /** Method parameters */
  params?: MethodParam[];
  /** Return type (undefined means void/unit) */
  return_type?: AroraType;
  /** Human-readable description */
  description?: string;
};

// ============================================================================
// Incoming Messages (Client -> Server)
// ============================================================================

/**
 * Messages sent from client to server.
 * Use the `type` field to discriminate message kind.
 */
export type Incoming =
  | { type: "set_slot_values"; values: Record<string, AroraValue> }
  | { type: "get_slot_values"; slots: string[] }
  | { type: "list_slots"; path?: string }
  | { type: "list_methods"; path?: string }
  | {
      type: "invoke";
      method: string;
      args?: Record<string, AroraValue>;
      request_id?: string;
    };

// ============================================================================
// Outgoing Messages (Server -> Client)
// ============================================================================

/**
 * Messages sent from server to client.
 * Use the `type` field to discriminate message kind.
 */
export type Outgoing =
  | { type: "set_slot_values_resp"; success: boolean; message?: string }
  | { type: "get_slot_values_resp"; values: Record<string, AroraValue> }
  | { type: "list_slots_resp"; slots: SlotInfo[] }
  | { type: "list_methods_resp"; methods: MethodInfo[] }
  | {
      type: "invoke_resp";
      success: boolean;
      request_id?: string;
      value?: AroraValue;
      message?: string;
    }
  | { type: "error"; request_id?: string; message: string };

// ============================================================================
// Type Guards
// ============================================================================

/** Check if message is a SetSlotValuesResp */
export function isSetSlotValuesResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "set_slot_values_resp" }> {
  return msg.type === "set_slot_values_resp";
}

/** Check if message is a GetSlotValuesResp */
export function isGetSlotValuesResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "get_slot_values_resp" }> {
  return msg.type === "get_slot_values_resp";
}

/** Check if message is a ListSlotsResp */
export function isListSlotsResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "list_slots_resp" }> {
  return msg.type === "list_slots_resp";
}

/** Check if message is a ListMethodsResp */
export function isListMethodsResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "list_methods_resp" }> {
  return msg.type === "list_methods_resp";
}

/** Check if message is an InvokeResp */
export function isInvokeResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "invoke_resp" }> {
  return msg.type === "invoke_resp";
}

/** Check if message is an Error */
export function isError(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "error" }> {
  return msg.type === "error";
}

// ============================================================================
// Message Constructors
// ============================================================================

/**
 * Create a SetSlotValues message.
 */
export function createSetSlotValues(
  values: Record<string, AroraValue>,
): Incoming {
  return { type: "set_slot_values", values };
}

/**
 * Create a GetSlotValues message.
 */
export function createGetSlotValues(slots: string[]): Incoming {
  return { type: "get_slot_values", slots };
}

/**
 * Create a ListSlots message.
 */
export function createListSlots(path?: string): Incoming {
  return { type: "list_slots", path };
}

/**
 * @deprecated Use createSetSlotValues.
 * Alias kept for compatibility with existing clients.
 */
export function createUpdate(values: Record<string, AroraValue>): Incoming {
  return createSetSlotValues(values);
}

/**
 * @deprecated Use createListSlots.
 * Alias kept for compatibility with existing clients.
 */
export function createListNodes(path?: string): Incoming {
  return createListSlots(path);
}

/**
 * Create a ListMethods message.
 */
export function createListMethods(path?: string): Incoming {
  return { type: "list_methods", path };
}

/**
 * Create an Invoke message.
 */
export function createInvoke(
  method: string,
  args?: Record<string, AroraValue>,
  request_id?: string,
): Incoming {
  return { type: "invoke", method, args, request_id };
}

/**
 * @deprecated Use isSetSlotValuesResp.
 * Alias kept for compatibility with existing clients.
 */
export function isUpdateResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "set_slot_values_resp" }> {
  return isSetSlotValuesResp(msg);
}

/**
 * @deprecated Use isListSlotsResp.
 * Alias kept for compatibility with existing clients.
 */
export function isListNodesResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "list_slots_resp" }> {
  return isListSlotsResp(msg);
}
