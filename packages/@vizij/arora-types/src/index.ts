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

// Wire-format message types
export type {
  KeyInfo,
  MethodParam,
  MethodInfo,
  Incoming,
  Outgoing,
} from "./messages";

export {
  // Type guards
  isWriteValuesResp,
  isReadValuesResp,
  isListKeysResp,
  isListMethodsResp,
  isInvokeResp,
  isError,
  isValuesChanged,
  // Message constructors
  createWriteValues,
  createReadValues,
  createListKeys,
  createListMethods,
  createInvoke,
} from "./messages";
