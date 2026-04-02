# Agent Notes · arora-websocket

- Treat this crate as the WebSocket transport layer for the Arora protocol, not as the source of truth for shared contract semantics.
- Keep canonical message names aligned with `@vizij/arora-types` and shared trait expectations from `arora-connection`.
- Preserve the single-active-client behavior and optional built-in control-panel behavior unless the product intent changes explicitly.
- When changing server behavior, verify the impact on `apps/vizij-standalone`, especially connection management, slot validation, and browser control flows.

- Before handing off substantive changes, run:

  ```bash
  cargo check --manifest-path packages/arora-websocket/Cargo.toml
  cargo check --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml
  ```
