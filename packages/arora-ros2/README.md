# arora-ros2

> **ROS2 transport implementation for the Arora control protocol.**

`arora-ros2` implements `AroraConnection` on top of ROS2. It exposes Arora slots as ROS2 topics and Arora methods as ROS2 services so Vizij standalone can participate in ROS-native control flows without changing the runtime-facing contract.

---

## Overview

- Implements the shared `AroraConnection` trait from `arora-connection`.
- Maps input slots onto ROS2 topics.
- Maps registered methods onto ROS2 services.
- Uses ROS2 discovery in place of WebSocket-style `list_slots` / `list_methods` requests.
- Includes integration tests covering the ROS2 bridge behavior.

---

## Behavior Notes

- Input slots are exposed under `/{namespace}/slots/...`.
- Methods are exposed under `/{namespace}/methods/...`.
- Namespace and DDS domain are selected when constructing `AroraRos2Node`.
- `respond_slot_values()` is a no-op in this transport because ROS2 uses a push/discovery model rather than pending WebSocket request/response correlation.

This crate is currently an optional transport used by `vizij-standalone` when the `ros2` feature is enabled.

---

## Typical Usage

```rust,no_run
use arora_ros2::AroraRos2Node;
use arora_connection::{AroraConnection, CancellationToken};

# async fn example() {
let node = AroraRos2Node::new("vizij", 0);
let cancel = CancellationToken::new();
node.run(cancel).await.unwrap();
# }
```

In practice, this node is usually configured by the standalone app rather than launched directly by external consumers.

---

## Development & Testing

```bash
cargo check --manifest-path packages/arora-ros2/Cargo.toml
cargo test --manifest-path packages/arora-ros2/Cargo.toml
```

For higher-level validation, also use the ROS2 smoke coverage in `apps/vizij-standalone/src-tauri/tests/ros2_smoke.rs`.

---

## Related Packages

- [`../arora-connection/README.md`](../arora-connection/README.md) — shared transport contract.
- [`../arora-websocket/README.md`](../arora-websocket/README.md) — WebSocket transport using the same trait.
- [`../../apps/vizij-standalone/README.md`](../../apps/vizij-standalone/README.md) — current app surface that can start this node.
