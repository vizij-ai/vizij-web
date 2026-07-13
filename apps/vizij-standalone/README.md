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
- optional Studio Bridge registration when built with the `studio-bridge` feature (see [Studio Bridge](#studio-bridge-connect-this-app-to-semio-studio))
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

### Debugging the ROS2 connection

The transport layer logs its lifecycle through `log`/`env_logger`: subscription
setup, per-message receipt, subscription errors (with exponential backoff), and
the connection manager's state changes. Turn it on with:

```bash
RUST_LOG=arora_ros2=debug,vizij_standalone_lib=debug pnpm dev
```

Two example binaries exercise a slot topic across processes, without the app:

```bash
# terminal 1 — print every value received on a slot topic
cargo run --example subscribe_slot -- /vizij/slots/blink            # BestEffort
cargo run --example subscribe_slot -- /vizij/slots/blink --reliable # Reliable

# terminal 2 — publish a value to the slot topic
cargo run --example publish_slot -- /vizij/slots/blink 0.8
```

(run from `src-tauri/`; `ROS_DOMAIN_ID` selects the DDS domain, default `0`.)

Cross-implementation tests (CycloneDDS via a `ros:jazzy` Docker container
driving `ros2 topic pub` at the app's subscriptions, including a 270+-slot
stress case) are `#[ignore]`d in
[`../../../packages/arora-ros2/tests/tests.rs`](../../../packages/arora-ros2/tests/tests.rs);
run them explicitly with Docker available:

```bash
cargo test -p arora-ros2 -- --ignored
```

## Studio Bridge (connect this app to Semio Studio)

The standalone can register itself with **Semio Studio** so a Studio operator can
see it in their device list and claim it — the producer side of VIZ-67. This is
an **opt-in** build feature (`studio-bridge`), off by default when you build from
source. The APKs CI builds ship **with** it (see [CI](#ci-1) below).

How it works: the running app dials the Studio Bridge **outbound** over Zenoh
(TLS). Android can't host a WebSocket server or do UDP discovery, so the device
reaches *out* to the bridge rather than the other way round. It authenticates
**anonymously** with the public Firebase project and registers its device info.
It reuses the exact studio-bridge device client (`arora-studio-bridge-client`),
no second transport.

> Status: the bridge connects and the device registers (a Studio can see and
> claim it). Streaming the standalone's **live data** into Studio is the
> remaining VIZ-67 step — the runtime runs as `arora-web` wasm in the webview,
> and this native client is not yet attached to it.

### Building with the feature

```bash
# desktop
pnpm --filter vizij-standalone tauri build -- --no-default-features --features studio-bridge

# dev
pnpm --filter vizij-standalone dev -- -- --no-default-features    # then set --features via cargo, or:
cargo run --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml --no-default-features --features studio-bridge
```

(`--no-default-features` drops the desktop `ros2` feature; combine as needed.)

### Configuration

All Studio config is resolved with the precedence **runtime env / `.env` →
value baked at build time (`option_env!`) → built-in default**. So a shipped
build works out of the box, and you can still override any value at launch.

| Variable | Purpose | Default |
| --- | --- | --- |
| `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`, `FIREBASE_MEASUREMENT_ID` | Firebase project config (public — [safe to share](https://firebase.google.com/docs/projects/api-keys)) | baked in CI builds from repo secrets |
| `ZENOH_ENDPOINTS` | Comma-separated Zenoh router endpoint(s) | `tls/bridge.semio.ai:7447` (production bridge) |
| `DEVICE_OWNERS` | Comma-separated Studio user IDs (Firebase UIDs) that own the device | _unset_ (device registers unowned) |
| `DEVICE_NAME`, `DEVICE_DESCRIPTION`, `MODEL_FAMILY`, `HARDWARE_VERSION`, `SOFTWARE_VERSION` | Registered device metadata | _unset_ |
| `FIREBASE_*_EMULATOR_HOST` | Point auth/firestore/storage at local emulators | _unset_ |

### Register this device to your Studio account (the manual loop)

By default the device registers **unowned** — no Studio user can see it. To make
it show up in *your* Studio, register it with your user ID:

1. **Find your Studio user ID (Firebase UID).** Sign in to Semio Studio and copy
   your UID from the account/profile screen, or from the Firebase console
   (**Authentication → Users**) for the `semio-studio-deployment` project.
2. **Launch the app with your UID as an owner** (and a friendly name):

   ```bash
   DEVICE_OWNERS=<your-firebase-uid> \
   DEVICE_NAME="My Vizij Standalone" \
   MODEL_FAMILY=vizij \
   cargo run --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml \
     --no-default-features --features studio-bridge
   ```

   (or put those in a `.env` — see below — instead of inline.)
3. **Watch the logs.** With `RUST_LOG=info` you should see
   `studio-bridge: connecting to Semio Studio via Zenoh (endpoints: ["tls/bridge.semio.ai:7447"])`,
   then `studio-bridge: registered device info with Studio`.
4. **Open Semio Studio** signed in as that same user. The device appears in your
   device list; claim it to view/control it.

`DEVICE_OWNERS` accepts several comma-separated UIDs to share the device across
accounts.

### Testing against a local bridge

To develop against a local Studio Bridge instead of `bridge.semio.ai`:

1. Run a local bridge (Zenoh router) — see
   [`studio-bridge/README.md`](../../../studio-bridge/README.md); the dev router
   listens on `tcp/localhost:7447`.
2. Copy `studio-bridge/.env` next to the app (e.g.
   `apps/vizij-standalone/src-tauri/.env` — it is loaded at launch by `dotenvy`)
   and adapt it:
   - `ZENOH_ENDPOINTS=tcp/localhost:7447` (plain `tcp/`, no TLS, for the local router)
   - keep the public `FIREBASE_*` values
   - set the `FIREBASE_*_EMULATOR_HOST` lines if you run the Firebase emulators
   - `NODE_EXTRA_CA_CERTS` from `studio-bridge/.env` is only needed if you front
     the local router with the self-signed test certs; the plain-`tcp` dev router
     needs no CA.

The runtime `.env`/env always wins over the baked config, so a local `.env`
transparently redirects a studio-bridge build to your local stack.

### CI

Both the PR debug APK and the `main` release APK
([`.github/workflows/android.yml`](../../.github/workflows/android.yml)) are
built with `--features studio-bridge`. The public Firebase config is injected
from the `STUDIO_FIREBASE_*` repository secrets and baked via `option_env!`; the
bridge endpoint uses the in-code default. No per-user `DEVICE_OWNERS` is baked —
operators register the running app to their own account as above.

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

### Windows prerequisites

The default build includes the `ros2` feature, which pulls in `pnet` for low-level networking. On Windows, `pnet` requires `Packet.lib` from the Npcap SDK at link time.

If you see a linker error like `LNK1181: cannot open input file 'Packet.lib'`, you need two separate things — installing Npcap alone is **not enough**:

1. **Install Npcap** from [npcap.com](https://npcap.com/#download) (the runtime installer).
2. **Download the Npcap SDK** separately — it is a ZIP on the same page, not part of the installer. Extract it anywhere (e.g. `C:\npcap-sdk`).
3. **Copy `Packet.lib` into the pnet crate's lib folder**. Setting the `LIB` environment variable is the documented approach but may not work; copying the file directly is the reliable fix:

   ```text
   C:\npcap-sdk\Lib\x64\Packet.lib
     → %USERPROFILE%\.cargo\registry\src\<index-hash>\pnet-0.35.0\lib\x64\Packet.lib
   ```

   The `<index-hash>` folder is named something like `index.crates.io-1949cf8c6b5b557f`. You can find it under `%USERPROFILE%\.cargo\registry\src\`.

### Running without ROS2 (no Npcap required)

`arora-ros2` is an optional Cargo dependency behind the `ros2` feature, which is **off by default**. This means the standard dev and build commands require no Npcap installation.

To enable ROS2 support explicitly:

```bash
# dev without ROS2
pnpm --filter vizij-standalone dev -- --no-default-features

# production build without ROS2
pnpm --filter vizij-standalone tauri build -- --no-default-features
```

The `--ros2-domain-id` and `--ros2-namespace` CLI flags are compiled out when the `ros2` feature is not enabled.

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

## Android

The app also builds as an Android APK through Tauri's mobile support. The same
React shell runs inside a single WebView — there is no separate native Activity.

### GLB loading on Android (and desktop)

Picking a `.glb` copies it into the app's private storage
([`src/lib/modelStore.ts`](./src/lib/modelStore.ts), under `appLocalDataDir`), so
the model **auto-loads on the next launch**. To change models, tap the
fullscreen face to reveal the controls, tap **Switch model**, then pick a new
file from the in-app settings screen. This persistence is cross-platform — it
works on desktop too.

### Prerequisites

- Android SDK + an NDK (export `NDK_HOME`), JDK 17.
- Rust Android targets:

  ```bash
  rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```

- The default `ros2` feature does not cross-compile to Android, so the Android
  build drops it with `--no-default-features`.

### Dev / build

```bash
# live-reload on a connected device/emulator
pnpm --filter vizij-standalone exec tauri android dev -- --no-default-features

# debug APK (installable, auto-signed)
pnpm --filter vizij-standalone exec tauri android build --debug --apk -- --no-default-features

# release APK
pnpm --filter vizij-standalone exec tauri android build --apk -- --no-default-features
```

APKs land under `src-tauri/gen/android/app/build/outputs/apk/`. The generated
Android project is committed under `src-tauri/gen/android`; only its build output
is git-ignored.

### CI

[`.github/workflows/android.yml`](../../.github/workflows/android.yml):

- **pull requests** build a debug APK and run the instrumented launch smoke test
  ([`AppLaunchTest.kt`](./src-tauri/gen/android/app/src/androidTest/java/com/vizij/standalone/AppLaunchTest.kt))
  on an API-34 x86_64 emulator (`./gradlew connectedDebugAndroidTest`).
- **pushes to `main`** build a release APK — signed when the keystore secrets are
  present (see below), unsigned otherwise.

### Release signing

Signing is conditional: if `src-tauri/gen/android/keystore.properties` exists it
is used, otherwise the release APK is built unsigned. To enable signing in CI:

1. Create an upload keystore:

   ```bash
   keytool -genkey -v -keystore upload-keystore.jks \
     -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```

2. Add these GitHub repository secrets:
   - `ANDROID_KEY_ALIAS` — the key alias (e.g. `upload`)
   - `ANDROID_KEY_PASSWORD` — the keystore/key password
   - `ANDROID_KEY_BASE64` — the keystore, base64-encoded (`base64 -w0 upload-keystore.jks`)

Never commit `keystore.properties` or the `.jks` (both are git-ignored).

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
