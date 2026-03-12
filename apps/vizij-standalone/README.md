# Vizij Standalone

`vizij-standalone` is the desktop runtime app. It wraps `@vizij/runtime-react` in a Tauri shell, loads one face bundle at a time, exposes the runtime inputs over a local WebSocket/Arora control surface, and optionally layers speech behavior on top when the loaded bundle includes `speechConfig`.

## Current Runtime Flow

At runtime the app:

1. loads a GLB from a CLI `--glb` source or the file picker
2. builds a `VizijAssetBundle` from either a URL or a local file blob
3. mounts `VizijRuntimeProvider` with `autostart` and `driveOrchestrator={true}`
4. mirrors runtime `inputConstraints` and transport inventory back to the Rust side
5. applies incoming WebSocket control messages through `setInput()`

Relevant files:

- [`src/App.tsx`](./src/App.tsx): runtime bootstrap + desktop UI shell
- [`src/hooks/useWebSocketSync.ts`](./src/hooks/useWebSocketSync.ts): runtime input sync with the Rust transport layer
- [`src/hooks/useSpeechController.ts`](./src/hooks/useSpeechController.ts): `@vizij/speech-react` integration on top of runtime-react
- [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs): CLI flags and Tauri-side connection startup

## Features

- load a bundled GLB from a path, URL, or interactive file picker
- runtime-react rendering via `VizijRuntimeFace`
- local WebSocket control server
- optional same-port web control panel unless disabled with `--no-web-control`
- transport inventory for bundled animations and procedural programs
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

Use `list-displays` to inspect monitor indices before launching fullscreen on a specific display.

## Local Control Surface

The app starts a local control endpoint on `ws://127.0.0.1:<port>` and, unless disabled, serves the browser control panel on `http://127.0.0.1:<port>/`.

The frontend runtime layer publishes:

- available slots from `inputConstraints`
- current transport catalog for animations/programs
- speech state updates

The Rust connection manager then exposes those over the Arora protocol surface.

For protocol details, inspect:

- [`src-tauri/src/connection_manager.rs`](./src-tauri/src/connection_manager.rs)
- [`packages/@vizij/arora-types`](../../packages/@vizij/arora-types)

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

## Notes

- The standalone app is currently a runtime consumer, not a separate runtime implementation.
- If runtime-react contracts change, this app usually needs README and transport-layer updates together.
