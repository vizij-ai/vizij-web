// Value types and utilities
export type {
  AroraValue,
  AroraType,
  AroraStructure,
  AroraStructureField,
  AroraEnumeration,
  AroraKeyValue,
  AroraKeyValueField,
} from "./value";

export {
  // Extractors
  extractNumericValue,
  extractStringValue,
  extractBooleanValue,
  extractUuidValue,
  extractOptionValue,
  // Constructors
  unit,
  f64,
  f32,
  i64,
  i32,
  u64,
  u32,
  str,
  bool,
  uuid,
  some,
  none,
  f64Array,
  i32Array,
  strArray,
  valueArray,
  // Type guards
  isNumeric,
  isString,
  isBoolean,
  isUnit,
  isOption,
} from "./value";

// Message types
export type { AroraUpdate, AroraAck } from "./messages";

export { createUpdate, createSuccessAck, createErrorAck } from "./messages";
