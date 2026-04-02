# arora-connection

> **Core Rust traits and shared types for Arora protocol connections.**

`arora-connection` defines the transport-agnostic interface used by Vizij’s standalone control surfaces. It is the shared contract layer for slot metadata, method metadata, value handling, and connection lifecycle hooks that concrete transports implement.

---

## Overview

- Defines the `AroraConnection` trait for async connection implementations.
- Exposes shared slot and method metadata types such as `SlotInfo`, `MethodInfo`, and `MethodParam`.
- Re-exports Arora value/type definitions for convenience.
- Provides handler type aliases for set-slot, get-slot, method-invoke, and client-connected callbacks.

This crate owns the abstract connection contract, not any specific transport protocol.

---

## What It Is For

Use this crate when you need to:

- define a new Arora transport implementation
- share slot and method metadata across transports
- write runtime code against the abstract connection interface rather than a concrete server

Current concrete users in this monorepo include:

- `arora-websocket`
- `arora-ros2`
- `apps/vizij-standalone/src-tauri`

---

## Example

```rust,ignore
use arora_connection::{AroraConnection, MethodInfo, SlotInfo};

struct MyConnection;

impl AroraConnection for MyConnection {
    // implement the async trait methods for your transport
}
```

The real implementations in this repo are better references than the minimal example above.

---

## Development Notes

- Keep the trait transport-agnostic.
- Add new metadata or lifecycle hooks here only when they are genuinely shared across transports.
- Validate contract changes against downstream implementations before landing them.

---

## Related Packages

- [`../arora-websocket/README.md`](../arora-websocket/README.md) — WebSocket transport implementation.
- [`../arora-ros2/README.md`](../arora-ros2/README.md) — ROS2 transport implementation.
- [`../../apps/vizij-standalone/README.md`](../../apps/vizij-standalone/README.md) — current app surface that consumes these transports.
