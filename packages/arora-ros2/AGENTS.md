# Agent Notes · arora-ros2

- Treat this crate as the ROS2 transport implementation for the shared Arora connection contract.
- Keep ROS2-specific discovery, topic naming, and service behavior here rather than pushing it into `arora-connection`.
- Coordinate contract changes with `arora-connection`, `apps/vizij-standalone`, and any ROS2 smoke or integration tests.
- Be careful with namespace, domain, and subscription lifecycle changes; this crate owns the ROS2 mapping details and cleanup behavior.

- Before handing off substantive changes, run:

  ```bash
  cargo check --manifest-path packages/arora-ros2/Cargo.toml
  cargo test --manifest-path packages/arora-ros2/Cargo.toml
  cargo test --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml --features ros2 --test ros2_smoke -- --ignored
  ```
