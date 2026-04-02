# Agent Notes · vizij-standalone

## Purpose

Desktop Vizij runtime surface built on Tauri. This app loads a bundle, mounts `@vizij/runtime-react`, and exposes local control surfaces over Arora WebSocket and optional ROS2 transports, with optional speech behavior layered on top.

## Runbook

- Dev entrypoint: `pnpm --filter vizij-standalone dev`
- Frontend build: `pnpm --filter vizij-standalone build`
- Desktop build: `pnpm --filter vizij-standalone tauri build`
- Rust-side checks live under `src-tauri`; use targeted cargo commands when touching transport or Tauri code.

## Integration Tips

- Coordinate changes with `@vizij/runtime-react`, `@vizij/speech-react`, `@vizij/arora-types`, `packages/arora-websocket`, and `packages/arora-ros2`.
- Keep CLI flags, transport behavior, and README docs aligned; this app is the main integration reference for the standalone/control stack.
- Treat the WebSocket and ROS2 surfaces as real operator/control interfaces, not only local dev helpers.
- When changing bundle loading, speech config precedence, or transport inventory behavior, update the README because it is already the main operator-facing reference.

## Validation Notes

- Prefer `pnpm --filter vizij-standalone dev` for end-to-end checks because it preserves the intended Tauri + frontend wiring.
- For protocol work, also validate the browser control panel or a simple WebSocket client.
- For ROS2-specific changes, use the existing smoke coverage when the environment supports it and call out any skipped checks.
