/**
 * Arora Value - matches Rust arora_schema::Value serde format.
 *
 * The Rust enum uses #[serde(rename = "...")] on variants with externally tagged
 * serialization (the default), which produces JSON like:
 * - Unit: "unit" (string literal for unit variant)
 * - F64(0.5): {"f64": 0.5}
 * - Boolean(true): {"bool": true}
 * - String("hello"): {"str": "hello"}
 */
export type AroraValue =
  | "unit" // Unit variant serializes as string literal
  | { bool: boolean }
  | { u8: number }
  | { u16: number }
  | { u32: number }
  | { u64: number }
  | { i8: number }
  | { i16: number }
  | { i32: number }
  | { i64: number }
  | { f32: number }
  | { f64: number }
  | { str: string }
  | { uuid: string }
  | { "v?": AroraValue | null } // Option<Value>
  | { struct: AroraStructure }
  | { enum: AroraEnumeration }
  | { keyvalue: AroraKeyValue }
  // Arrays
  | { "bool[]": boolean[] }
  | { "u8[]": number[] }
  | { "u16[]": number[] }
  | { "u32[]": number[] }
  | { "u64[]": number[] }
  | { "i8[]": number[] }
  | { "i16[]": number[] }
  | { "i32[]": number[] }
  | { "i64[]": number[] }
  | { "f32[]": number[] }
  | { "f64[]": number[] }
  | { "str[]": string[] }
  | { "value[]": AroraValue[] };

/**
 * Arora Type - matches Rust arora_schema::Type serde format.
 * Describes the type of a Value without holding data.
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
 * Structure - named struct representation
 */
export type AroraStructure = {
  id: string;
  fields: AroraStructureField[];
};

export type AroraStructureField = {
  id: string;
  value: AroraValue;
};

/**
 * Enumeration - sum type representation
 */
export type AroraEnumeration = {
  id: string;
  variant_id: string;
  value: AroraValue;
};

/**
 * KeyValue - key-value collection with UUID-based identity
 */
export type AroraKeyValue = {
  id: string;
  fields: Record<string, AroraKeyValueField>;
};

export type AroraKeyValueField = {
  id: string;
  name: string;
  value?: AroraValue;
};

// ============================================================================
// Value extractors
// ============================================================================

/**
 * Extract numeric value from any arora numeric type.
 * Returns null if the value is not numeric.
 */
export function extractNumericValue(value: AroraValue): number | null {
  if (value === "unit") return null;
  if (typeof value !== "object") return null;

  if ("f64" in value) return value.f64;
  if ("f32" in value) return value.f32;
  if ("i64" in value) return value.i64;
  if ("i32" in value) return value.i32;
  if ("i16" in value) return value.i16;
  if ("i8" in value) return value.i8;
  if ("u64" in value) return value.u64;
  if ("u32" in value) return value.u32;
  if ("u16" in value) return value.u16;
  if ("u8" in value) return value.u8;

  return null;
}

/**
 * Extract string value from an arora str type.
 * Returns null if the value is not a string.
 */
export function extractStringValue(value: AroraValue): string | null {
  if (value === "unit") return null;
  if (typeof value !== "object") return null;
  if ("str" in value) return value.str;
  return null;
}

/**
 * Extract boolean value from an arora bool type.
 * Returns null if the value is not a boolean.
 */
export function extractBooleanValue(value: AroraValue): boolean | null {
  if (value === "unit") return null;
  if (typeof value !== "object") return null;
  if ("bool" in value) return value.bool;
  return null;
}

/**
 * Extract UUID value from an arora uuid type.
 * Returns null if the value is not a UUID.
 */
export function extractUuidValue(value: AroraValue): string | null {
  if (value === "unit") return null;
  if (typeof value !== "object") return null;
  if ("uuid" in value) return value.uuid;
  return null;
}

/**
 * Extract inner value from an Option (v?).
 * Returns the inner value or null if None/not an Option.
 */
export function extractOptionValue(value: AroraValue): AroraValue | null {
  if (value === "unit") return null;
  if (typeof value !== "object") return null;
  if ("v?" in value) return value["v?"];
  return null;
}

// ============================================================================
// Value constructors
// ============================================================================

/** Create a unit Value */
export function unit(): AroraValue {
  return "unit";
}

/** Create an f64 Value */
export function f64(n: number): AroraValue {
  return { f64: n };
}

/** Create an f32 Value */
export function f32(n: number): AroraValue {
  return { f32: n };
}

/** Create an i64 Value */
export function i64(n: number): AroraValue {
  return { i64: n };
}

/** Create an i32 Value */
export function i32(n: number): AroraValue {
  return { i32: n };
}

/** Create a u64 Value */
export function u64(n: number): AroraValue {
  return { u64: n };
}

/** Create a u32 Value */
export function u32(n: number): AroraValue {
  return { u32: n };
}

/** Create a string Value */
export function str(s: string): AroraValue {
  return { str: s };
}

/** Create a boolean Value */
export function bool(b: boolean): AroraValue {
  return { bool: b };
}

/** Create a UUID Value */
export function uuid(id: string): AroraValue {
  return { uuid: id };
}

/** Create an Option (Some) Value */
export function some(value: AroraValue): AroraValue {
  return { "v?": value };
}

/** Create an Option (None) Value */
export function none(): AroraValue {
  return { "v?": null };
}

/** Create an f64 array Value */
export function f64Array(arr: number[]): AroraValue {
  return { "f64[]": arr };
}

/** Create an i32 array Value */
export function i32Array(arr: number[]): AroraValue {
  return { "i32[]": arr };
}

/** Create a string array Value */
export function strArray(arr: string[]): AroraValue {
  return { "str[]": arr };
}

/** Create a Value array */
export function valueArray(arr: AroraValue[]): AroraValue {
  return { "value[]": arr };
}

// ============================================================================
// Type guards
// ============================================================================

/** Check if value is numeric */
export function isNumeric(value: AroraValue): boolean {
  return extractNumericValue(value) !== null;
}

/** Check if value is a string */
export function isString(value: AroraValue): boolean {
  return extractStringValue(value) !== null;
}

/** Check if value is a boolean */
export function isBoolean(value: AroraValue): boolean {
  return extractBooleanValue(value) !== null;
}

/** Check if value is unit */
export function isUnit(value: AroraValue): value is "unit" {
  return value === "unit";
}

/** Check if value is an Option */
export function isOption(value: AroraValue): boolean {
  if (value === "unit") return false;
  if (typeof value !== "object") return false;
  return "v?" in value;
}
