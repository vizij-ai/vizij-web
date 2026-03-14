# Vizij Standalone

`vizij-standalone` is the desktop runtime app. It wraps `@vizij/runtime-react` in a Tauri shell, loads one face bundle at a time, exposes the runtime over local control surfaces, and optionally layers speech behavior on top when the loaded bundle includes `speechConfig`.

## Current Runtime Flow

At runtime the app:

1. loads a GLB from a CLI `--glb` source or the file picker
2. builds a `VizijAssetBundle` from either a URL or a local file blob
3. mounts `VizijRuntimeProvider` with `autostart` and `driveOrchestrator={true}`
4. mirrors runtime `inputConstraints`, speech state, and transport inventory back to the Rust side
5. applies incoming WebSocket or ROS2 control messages through the shared connection manager

Relevant files:

- [`src/App.tsx`](./src/App.tsx): runtime bootstrap + desktop UI shell
- [`src/hooks/useWebSocketSync.ts`](./src/hooks/useWebSocketSync.ts): runtime input sync with the Rust transport layer
- [`src/hooks/useSpeechController.ts`](./src/hooks/useSpeechController.ts): `@vizij/speech-react` integration on top of runtime-react
- [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs): CLI flags and transport startup

## Features

- load a bundled GLB from a path, URL, or interactive file picker
- runtime-react rendering via `VizijRuntimeFace`
- local WebSocket control server
- optional same-port web control panel unless disabled with `--no-web-control`
- transport inventory for bundled animations and procedural programs
- optional ROS2 control surface when built with the default `ros2` feature
- optional speech pipeline driven by bundle metadata plus CLI/env keys

## CLI

```text
vizij-standalone [OPTIONS]
vizij-standalone list-displays
```

Main options:

- `--glb`, `-g`: load a GLB path or URL on startup
- `--port`, `-p`: local control server port, default `9000`
- `--no-web-control`: disable the web control panel served on the same port
- `--fullscreen`, `-f`
- `--display`, `-d`
- `--width`, `-W`
- `--height`, `-H`
- `--no-decorations`
- `--always-on-top`
- `--deepgram-key`
- `--openai-key`
- `--api-url`
- `--auto-mic`
- `--speech-mode`
- `--ros2-domain-id`: DDS domain ID for the ROS2 surface
- `--ros2-namespace`: ROS2 namespace prefix for topics and services

Use `list-displays` to inspect monitor indices before launching fullscreen on a specific display.

## Web Control Panel

The app includes a built-in browser control panel served on the same port as the WebSocket server. That makes it easy to control the avatar from another machine or a phone without installing extra tooling.

Behavior highlights:

- auto-discovers available slots and builds the UI dynamically
- exposes speech controls when the corresponding methods are available
- exposes transport controls when bundled animations or programs are published
- follows the same exclusive-client policy as any other Arora client

To disable the panel, launch with `--no-web-control`.

## Local Control Surface

The app starts a local control endpoint on `ws://127.0.0.1:<port>` and, unless disabled, serves the browser control panel on `http://127.0.0.1:<port>/`.

The frontend runtime layer publishes:

- available slots from `inputConstraints`
- current transport catalog for animations/programs
- speech state updates

The Rust connection manager then exposes those over the Arora protocol surface. For protocol details, inspect:

- [`src-tauri/src/connection_manager.rs`](./src-tauri/src/connection_manager.rs)
- [`packages/@vizij/arora-types`](../../packages/@vizij/arora-types)

For quick manual testing:

```bash
npx wscat -c ws://localhost:9000
```

The server binds to `0.0.0.0`, so LAN clients can connect as well; treat it as a local-control endpoint and only expose it on trusted networks.

## ROS2 Control Surface

When built with the default `ros2` feature, the Tauri app also starts an `AroraRos2Node` alongside the WebSocket server.

Current behavior:

- input slots are exposed as ROS2 topics under `/{namespace}/slots/...`
- methods are exposed as ROS2 services under `/{namespace}/methods/...`
- the namespace defaults to `vizij`
- the DDS domain defaults to `0`

Relevant files:

- [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)
- [`src-tauri/tests/ros2_smoke.rs`](./src-tauri/tests/ros2_smoke.rs)
- [`../../../packages/arora-ros2/src/lib.rs`](../../../packages/arora-ros2/src/lib.rs)

## Speech Support

Speech is optional and bundle-driven.

When the loaded face bundle exposes `bundle.metadata.speechConfig`, the app can layer on:

- Deepgram STT
- optional OpenAI conversation turns
- TTS/viseme playback through `@vizij/speech-react`
- runtime input writes for speaking, thinking, and emotion channels

### Speech key and config precedence

The app resolves speech-related configuration from multiple layers. Current precedence is:

1. CLI flags from Tauri startup:
   - `--deepgram-key`
   - `--openai-key`
   - `--api-url`
   - `--auto-mic`
   - `--speech-mode`
2. Browser env/local persistence used by the React hooks:
   - `VITE_DEEPGRAM_API_KEY` or stored localStorage key for Deepgram
   - `VITE_OPENAI_API_KEY` or stored localStorage key for OpenAI
   - `VITE_API_URL` for the TTS API base URL
3. Bundle metadata from `bundle.metadata.speechConfig`
4. Hook defaults

Practical interpretation:

- CLI flags win when present and are also persisted into localStorage for the browser-side hooks.
- Deepgram and OpenAI keys fall back to `VITE_DEEPGRAM_API_KEY` / `VITE_OPENAI_API_KEY`, then to the stored browser values.
- API base URL resolves as CLI `--api-url`, then `speechConfig.apiBaseUrl`, then `VITE_API_URL`.
- Speech mode resolves as CLI `--speech-mode`, then `speechConfig.mode`, then `"echo"`.
- Auto-mic resolves from CLI `--auto-mic` when provided, otherwise from `speechConfig.autoActivateMic`.

If speech looks half-configured, check both the Tauri CLI flags and the browser-side env/localStorage state before debugging the runtime layer itself.

## Development

From the repo root:

```bash
pnpm install
pnpm --filter vizij-standalone dev
```

`pnpm --filter vizij-standalone dev` is the normal development entry point because
Tauri dev mode loads the React frontend from `http://localhost:1420`.
That frontend server is started automatically by the `beforeDevCommand` in
[`src-tauri/tauri.conf.json`](./src-tauri/tauri.conf.json).

Passing CLI arguments through `pnpm tauri dev`:

```bash
pnpm --filter vizij-standalone dev -- -- --glb /path/to/avatar.glb --fullscreen
```

Example with explicit speech flags:

```bash
pnpm --filter vizij-standalone dev -- -- \
  --glb /path/to/avatar.glb \
  --deepgram-key YOUR_DEEPGRAM_KEY \
  --openai-key YOUR_OPENAI_KEY \
  --api-url http://localhost:3001 \
  --speech-mode conversation
```

## Build

```bash
pnpm --filter vizij-standalone build
pnpm --filter vizij-standalone tauri build
```

Build outputs land under `apps/vizij-standalone/src-tauri/target/`.

## Manual Checks

WebSocket/manual panel checks:

- launch the app with a known GLB and verify the browser control panel lists slots
- call `reset` from the panel or `wscat`
- if a bundle contains transport items, verify the Transport tab can list, play, pause, and stop them

ROS2 smoke check:

```bash
cargo test --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml --features ros2 --test ros2_smoke -- --ignored
```

The smoke test requires a built frontend and a display because it launches the Tauri app.

Direct `cargo run` note:

- running `cargo run --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml ...`
  launches the Tauri Rust binary directly
- in debug/dev mode that binary still expects the frontend at `http://localhost:1420`
- `--no-web-control` only disables the separate browser control panel on the Arora port;
  it does not disable the main Tauri window frontend
- if you want to use direct `cargo run`, start a frontend server first, for example:

```bash
pnpm --filter vizij-standalone build
python3 -m http.server 1420 -d apps/vizij-standalone/dist

RUST_LOG=info cargo run --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml --features ros2 -- \
  --no-web-control \
  --ros2-domain-id 201 \
  --ros2-namespace smoke_debug \
  --port 19191
```

If you only need the app with the correct frontend wiring, prefer:

```bash
pnpm --filter vizij-standalone dev -- -- \
  --ros2-domain-id 201 \
  --ros2-namespace smoke_debug \
  --port 19191
```

## Notes

- The standalone app is currently a runtime consumer, not a separate runtime implementation.
- If runtime-react contracts change, this app usually needs README and transport-layer updates together.
