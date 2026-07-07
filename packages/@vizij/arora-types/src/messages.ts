/**
 * Arora WebSocket Message Types
 *
 * This module defines the message format for WebSocket communication with the
 * Arora API, matching the `arora-websocket` crate (1.0). Messages are
 * serialized as JSON with a `type` field discriminator, and speak the Arora
 * data-layer vocabulary: values are written to and read from **keys**
 * (hierarchical paths into the store).
 */

import type { AroraType, AroraValue } from "./value";

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Metadata describing a key exposed by the runtime's data layer.
 * Keys represent controllable parameters or observable outputs.
 */
export type KeyInfo = {
  /** Hierarchical path identifier (e.g., "face/mouth/open") */
  path: string;
  /** Key kind/category (e.g., "input", "output", "computed") */
  kind?: string;
  /** The arora Type of the values this key accepts/produces */
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
  | { type: "write_values"; values: Record<string, AroraValue> }
  | { type: "read_values"; keys: string[] }
  | { type: "list_keys"; path?: string }
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
  | { type: "write_values_resp"; success: boolean; message?: string }
  | { type: "read_values_resp"; values: Record<string, AroraValue> }
  | { type: "list_keys_resp"; keys: KeyInfo[] }
  | { type: "list_methods_resp"; methods: MethodInfo[] }
  | {
      type: "invoke_resp";
      success: boolean;
      request_id?: string;
      value?: AroraValue;
      message?: string;
    }
  | { type: "error"; request_id?: string; message: string }
  | { type: "values_changed"; values: Record<string, AroraValue> };

// ============================================================================
// Type Guards
// ============================================================================

/** Check if message is a WriteValuesResp */
export function isWriteValuesResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "write_values_resp" }> {
  return msg.type === "write_values_resp";
}

/** Check if message is a ReadValuesResp */
export function isReadValuesResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "read_values_resp" }> {
  return msg.type === "read_values_resp";
}

/** Check if message is a ListKeysResp */
export function isListKeysResp(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "list_keys_resp" }> {
  return msg.type === "list_keys_resp";
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

/** Check if message is a ValuesChanged push */
export function isValuesChanged(
  msg: Outgoing,
): msg is Extract<Outgoing, { type: "values_changed" }> {
  return msg.type === "values_changed";
}

// ============================================================================
// Message Constructors
// ============================================================================

/**
 * Create a WriteValues message.
 */
export function createWriteValues(
  values: Record<string, AroraValue>,
): Incoming {
  return { type: "write_values", values };
}

/**
 * Create a ReadValues message.
 */
export function createReadValues(keys: string[]): Incoming {
  return { type: "read_values", keys };
}

/**
 * Create a ListKeys message.
 */
export function createListKeys(path?: string): Incoming {
  return { type: "list_keys", path };
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
