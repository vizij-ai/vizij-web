# @vizij/arora-types

All notable changes to this package are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0/).

## [0.1.0] - 2026-02-05

Initial release. TypeScript types and helpers mirroring the Rust `arora-types`
serde format, so browser clients and the arora websocket protocol share one
value and message model.

### Added

- Value model: `AroraValue`, `AroraType`, `AroraStructure`, `AroraStructureField`,
  `AroraEnumeration`, `AroraKeyValue`, and `AroraKeyValueField` types.
- Value constructors (`unit`, `f64`, `f32`, `i64`, `i32`, `u64`, `u32`, `str`,
  `bool`, `uuid`, `some`, `none`, `f64Array`, `i32Array`, `strArray`,
  `valueArray`), extractors (`extractNumericValue`, `extractStringValue`,
  `extractBooleanValue`, `extractUuidValue`, `extractOptionValue`), and value
  type guards (`isNumeric`, `isString`, `isBoolean`, `isUnit`, `isOption`).
- Protocol message model: `Incoming`/`Outgoing` messages carrying `NodeInfo`,
  `MethodInfo`, `MethodParam`, and `SlotInfo` payloads; message constructors
  (`createUpdate`, `createListNodes`, `createListMethods`, `createInvoke`); and
  response type guards (`isUpdateResp`, `isListNodesResp`, `isListMethodsResp`,
  `isInvokeResp`, `isError`).
- Slot operations: `createSetSlotValues`, `createGetSlotValues`, and
  `createListSlots` constructors with matching `isSetSlotValuesResp`,
  `isGetSlotValuesResp`, and `isListSlotsResp` guards, aligned with the Rust
  websocket naming and request-id flow.
- Protocol contract test asserting the TypeScript message shapes stay in sync
  with the Rust wire format.
