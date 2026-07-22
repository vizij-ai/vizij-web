/**
 * App-local slot-descriptor protocol for the native `set_slots` command.
 *
 * These shapes were the WebSocket-metadata half of the retired
 * `@vizij/arora-types` package. Only the pieces vizij-standalone actually sends
 * to the Tauri backend live here now; the value serde half folded into
 * `@vizij/value-json` (`AroraValueJSON` and the `valueAs*` accessors).
 */
import type { AroraValueJSON } from "@vizij/value-json";

/**
 * Arora Type tag — mirrors `arora_types::value::Type`'s serde form. Names the
 * kind of value a slot accepts/produces without carrying any data.
 */
export type AroraType =
  | "unit"
  | "bool"
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "i8"
  | "i16"
  | "i32"
  | "i64"
  | "f32"
  | "f64"
  | "str"
  | "uuid"
  | "v?"
  | "struct"
  | "enum"
  | "keyvalue"
  | "bool[]"
  | "u8[]"
  | "u16[]"
  | "u32[]"
  | "u64[]"
  | "i8[]"
  | "i16[]"
  | "i32[]"
  | "i64[]"
  | "f32[]"
  | "f64[]"
  | "str[]"
  | "value[]"
  | "struct[]"
  | "enum[]";

/**
 * Metadata describing a controllable slot, as sent to the native backend via
 * the `set_slots` command. Slots represent controllable inputs or observable
 * outputs.
 */
export type NodeInfo = {
  /** Hierarchical path identifier (e.g. "standard/vizij/mouth/morph/jaw_open"). */
  path: string;
  /** Slot kind/category (e.g. "input", "output"). */
  kind?: string;
  /** The arora Type this slot accepts/produces. */
  value_type?: AroraType;
  /** Minimum value constraint (for numeric types). */
  min?: number;
  /** Maximum value constraint (for numeric types). */
  max?: number;
  /** Default value, in arora serde form. */
  default_value?: AroraValueJSON;
};
