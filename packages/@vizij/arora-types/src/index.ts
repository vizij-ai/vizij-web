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

// Protocol message types
export type {
  SlotInfo,
  NodeInfo,
  MethodParam,
  MethodInfo,
  Incoming,
  Outgoing,
} from "./messages";

export {
  // Type guards
  isSetSlotValuesResp,
  isGetSlotValuesResp,
  isListSlotsResp,
  isUpdateResp,
  isListNodesResp,
  isListMethodsResp,
  isInvokeResp,
  isError,
  // Message constructors
  createSetSlotValues,
  createGetSlotValues,
  createListSlots,
  createUpdate,
  createListNodes,
  createListMethods,
  createInvoke,
} from "./messages";
