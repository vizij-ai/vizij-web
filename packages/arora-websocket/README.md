# arora-websocket

> **WebSocket transport implementation for the Arora control protocol.**

`arora-websocket` implements the shared `AroraConnection` trait over JSON WebSocket messages. It includes protocol message types, a slot/method registry, and a ready-to-run server that can optionally expose a simple browser control panel on the same port.

---

## Overview

- Implements the `AroraConnection` contract from `arora-connection`.
- Defines canonical incoming and outgoing WebSocket message types.
- Includes a registry for slots and methods.
- Provides `AroraWSServer` for real server usage.
- Optionally serves a built-in browser control panel when enabled in `ServerConfig`.

---

## Protocol Shape

The canonical client message names are:

- `set_slot_values`
- `get_slot_values`
- `list_slots`
- `list_methods`
- `invoke`

Responses use matching canonical names such as:

- `set_slot_values_resp`
- `get_slot_values_resp`
- `list_slots_resp`
- `list_methods_resp`
- `invoke_resp`

This crate is the Rust-side transport implementation of the same slot-based contract surfaced to TypeScript through `@vizij/arora-types`.

---

## Typical Usage

```rust,no_run
use arora_websocket::{AroraWSServer, ServerConfig};
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() {
    let server = AroraWSServer::new(ServerConfig::with_port(9000));
    let cancel = CancellationToken::new();
    server.run(cancel).await.unwrap();
}
```

Common integration steps:

1. construct a server with `ServerConfig`
2. set slot and method handlers
3. register any callable methods
4. run until the provided cancellation token is cancelled

---

## Behavior Notes

- Supports at most one active client at a time.
- Can validate incoming slot updates against registered input slots.
- Can serve the built-in control panel on plain HTTP requests when configured.
- Binds to `0.0.0.0` by default unless `bind_address` is overridden.

The current highest-level consumer is `apps/vizij-standalone`, which layers app/runtime behavior on top of this transport.

---

## Related Packages

- [`../arora-connection/README.md`](../arora-connection/README.md) — shared transport-agnostic contract.
- [`../arora-ros2/README.md`](../arora-ros2/README.md) — alternative transport using the same contract.
- [`../@vizij/arora-types/README.md`](../@vizij/arora-types/README.md) — TypeScript-side contract helpers.
- [`../../apps/vizij-standalone/README.md`](../../apps/vizij-standalone/README.md) — current app surface that uses this server.
