# @vizij/arora-types

> **TypeScript value and message helpers for the Arora control protocol.**

`@vizij/arora-types` provides the TypeScript-side value shapes, protocol message types, constructors, and response guards used by Vizij standalone and related control clients. It is the lightweight contract package for talking to the current Arora WebSocket surface without pulling in app-specific runtime code.

---

## Table of Contents

1. [Overview](#overview)
2. [What It Covers](#what-it-covers)
3. [Quick Start](#quick-start)
4. [Compatibility Notes](#compatibility-notes)
5. [Development & Testing](#development--testing)
6. [Related Packages](#related-packages)

---

## Overview

- Exposes TypeScript representations of Arora values and value types.
- Defines the current canonical message names for the WebSocket protocol.
- Includes helper constructors for common client messages.
- Retains compatibility aliases for older callsites that still use node-oriented names.

This package is intentionally small. It owns the contract shape, not the transport implementation or application behavior.

---

## What It Covers

### Value layer

- `AroraValue`
- `AroraType`
- structured forms such as records, enums, and key-value objects
- constructors like `f64()`, `str()`, `bool()`, `uuid()`, `some()`, `none()`
- extractors and type guards for common runtime use

### Message layer

- canonical incoming messages such as `set_slot_values`, `get_slot_values`, `list_slots`, `list_methods`, and `invoke`
- canonical outgoing responses such as `set_slot_values_resp`, `get_slot_values_resp`, `list_slots_resp`, and `invoke_resp`
- metadata types like `SlotInfo` and `MethodInfo`
- response guards and message constructors for client-side tooling

---

## Quick Start

```ts
import {
  createSetSlotValues,
  createGetSlotValues,
  createInvoke,
  f64,
  extractNumericValue,
} from "@vizij/arora-types";

const updateMsg = createSetSlotValues({
  "face/mouth/open": f64(0.5),
});

const getMsg = createGetSlotValues(["face/mouth/open"]);
const invokeMsg = createInvoke("reset");

// Later, when a response arrives:
const value = extractNumericValue({ f64: 0.5 });
```

Common usage patterns:

- build client messages before sending JSON over WebSocket
- type-check response payloads in standalone or browser control UIs
- normalize older helper usage onto the canonical slot-based contract

---

## Compatibility Notes

The canonical protocol now uses slot-oriented names:

- `set_slot_values`
- `get_slot_values`
- `list_slots`

For older clients, this package still exposes compatibility aliases such as:

- `createUpdate()` → emits `set_slot_values`
- `createListNodes()` → emits `list_slots`
- `NodeInfo` → alias of `SlotInfo`
- `isUpdateResp()` / `isListNodesResp()` → canonical response guards

New code should prefer the canonical slot-based helpers and types.

---

## Development & Testing

```bash
pnpm --filter "@vizij/arora-types" build
pnpm --filter "@vizij/arora-types" test
pnpm --filter "@vizij/arora-types" typecheck
```

The contract test in `src/messages.contract.test.ts` is the main guardrail for message-name drift between canonical helpers and compatibility aliases.

---

## Related Packages

- [`../../apps/vizij-standalone/README.md`](../../apps/vizij-standalone/README.md) — current app surface that consumes this package.
- [`../../../vizij-docs/active_projects/runtime/standalone_ws/standalone_ws-plan.md`](../../../vizij-docs/active_projects/runtime/standalone_ws/standalone_ws-plan.md) — cross-repo status and protocol extraction context.
- `packages/arora-connection` and `packages/arora-websocket` — Rust-side protocol surfaces in the same monorepo.
