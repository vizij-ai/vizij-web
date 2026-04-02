# Agent Notes · arora-connection

- Treat this crate as the abstract Arora contract layer: traits, shared metadata, and handler types live here; transport behavior does not.
- Keep the `AroraConnection` trait transport-agnostic so both WebSocket and ROS2 implementations can evolve against the same interface.
- Coordinate any trait or metadata changes with `arora-websocket`, `arora-ros2`, `@vizij/arora-types`, and `apps/vizij-standalone`.
- Prefer adding transport-specific behavior downstream rather than baking it into the shared trait unless multiple transports require it.

- Before handing off substantive changes, run:

  ```bash
  cargo check --manifest-path packages/arora-connection/Cargo.toml
  cargo check --manifest-path packages/arora-websocket/Cargo.toml
  cargo check --manifest-path packages/arora-ros2/Cargo.toml
  ```
