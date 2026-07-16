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

The app hosts a small **multi-bridge host**: one shared `arora_simple_data_store::SimpleDataStore`
blackboard with several `arora_bridge::Bridge` endpoints attached to it — a
WebSocket bridge ([`arora-bridge-ws`]), an optional ROS 2 data-topic bridge
([`arora-bridge-ros2`]), and (opt-in) the Studio Zenoh bridge. All share the
**same** store, so a value written on any bridge fans out to every other and to
Studio's live-data view.

The app starts the WebSocket endpoint on `ws://127.0.0.1:<port>` and, unless
disabled, serves the browser control panel on `http://127.0.0.1:<port>/`.

The webview runtime:

- advertises its **key catalog** (from `inputConstraints`) via the `set_slots`
  Tauri command — the host mirrors it onto the WS registry (driving `list_keys`
  and the `write_values` allow-list) and seeds default values into the store;
- **continuously mirrors** its live values into the store via the
  `publish_values` command (10 Hz), which is what feeds live data out to WS,
  ROS 2, and Studio;
- applies inbound writes it receives (as the `update-values` Tauri event) back
  into the wasm runtime.

The WebSocket wire vocabulary is the `arora-bridge-ws` data layer: clients
`write_values` / `read_values` at **keys**, `list_keys`, `list_methods`, and
`invoke` methods; the server pushes live state as unsolicited `values_changed`.
(This is the current vocabulary — the older `set_slot_values` / `SlotInfo`
naming is gone.)

For protocol details, inspect:

- [`src-tauri/src/host.rs`](./src-tauri/src/host.rs) — the multi-bridge pump
- [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs) — the Tauri commands + method surface

For quick manual testing (the built-in control panel speaks this vocabulary too):

```bash
npx wscat -c ws://localhost:9000
# > {"type":"list_keys"}
# > {"type":"write_values","values":{"<key>":{"f64":0.5}}}
# > {"type":"read_values","keys":["<key>"]}
# > {"type":"invoke","method":"reset","request_id":"r1"}
```

The server binds loopback by default; expose it only on trusted networks.

## ROS2 Control Surface

When built with the default `ros2` feature, the host also attaches an
`arora-bridge-ros2` bridge sharing the same store.

Current behavior:

- keys are exposed as ROS 2 topics under `/{namespace}/keys/...` — the device
  **publishes** each changed key to its topic and **subscribes** to the input
  keys (the input topics are declared up front from the key catalog, so the
  ROS 2 bridge is rebuilt when the catalog changes)
- **data topics only** — there is **no** ROS 2 method/service surface. The
  `reset` / `speak` / `mute` / `transport` methods stay on the WebSocket (and
  Studio) bridge. Restoring ROS 2 method parity is tracked in **ARORA-62**.
- the namespace defaults to `vizij`; the DDS domain defaults to `0`

Relevant files:

- [`src-tauri/src/lib.rs`](./src-tauri/src/lib.rs)
- [`src-tauri/src/host.rs`](./src-tauri/src/host.rs)

### Debugging the ROS2 connection

Turn on logs with:

```bash
RUST_LOG=arora_bridge_ros2=debug,vizij_standalone_lib=debug pnpm dev
```

Two example binaries exercise a key topic across processes, without the app:

```bash
# terminal 1 — print every value received on a key topic
cargo run --example subscribe_slot -- /vizij/keys/blink            # BestEffort
cargo run --example subscribe_slot -- /vizij/keys/blink --reliable # Reliable

# terminal 2 — publish a value to the key topic
cargo run --example publish_slot -- /vizij/keys/blink 0.8
```

(run from `src-tauri/`; `ROS_DOMAIN_ID` selects the DDS domain, default `0`.)

## Studio Bridge (connect this app to Semio Studio)

The standalone can register itself with **Semio Studio** so a Studio operator can
see it in their device list and claim it — the producer side of VIZ-67. This is
an **opt-in** build feature (`studio-bridge`), off by default when you build from
source. The APKs CI builds ship **with** it (see [CI](#ci-1) below).

How it works: the running app dials the Studio Bridge **outbound** over Zenoh.
Android can't host a WebSocket server or do UDP discovery, so the device reaches
_out_ to the bridge rather than the other way round. It authenticates
**anonymously** with the public Firebase project and registers its device info.
It reuses the exact studio-bridge device client (`arora-studio-bridge-client`),
no second transport.

**On first run the app prompts, in its own UI, for the Studio user ID (Firebase
UID) that should own the device.** The device connects and registers regardless
of the answer — only _which Studio account(s) can see and claim it_ depends on
it. The choice is remembered (persisted app-side), so it asks only once. Setting
the `DEVICE_OWNERS` env var overrides the prompt entirely (see below).

The public Firebase config and the production bridge endpoint are **baked into
`arora-studio-bridge-client` (v3.1+)** itself, so the feature is **zero-config** —
there is nothing to set up to reach production Studio. Runtime env still
overrides: `STUDIO_BRIDGE_ENDPOINT` for a non-production bridge, `FIREBASE_*` for
a different project/emulator.

> Status: the bridge connects, the device registers (an owning Studio user can
> see and claim it), **and it now streams live data**. The Studio bridge is a
> third `arora_bridge::Bridge` sharing the multi-bridge host's `SimpleDataStore`,
> so the webview's mirrored values (via `publish_values`) fan out to Studio like
> any other bridge, and Studio's writes flow back into the webview — closing the
> VIZ-67 live-data gap.

### Running with the feature

The feature is a build flag, so you pass it to the same `dev`/`build` commands
(the frontend is served automatically — don't use a bare `cargo run`, which has
no frontend). `--no-default-features` drops the desktop-only `ros2` feature.

```bash
# dev (live reload) — from the repo root
pnpm --filter vizij-standalone dev -- --no-default-features --features studio-bridge

# production build — outputs land under src-tauri/target/release/
pnpm --filter vizij-standalone tauri build -- --no-default-features --features studio-bridge
```

To confirm it connected, run with logging and watch for the registration line:

```bash
RUST_LOG=info pnpm --filter vizij-standalone dev -- --no-default-features --features studio-bridge
# → studio-bridge: connecting to Semio Studio via the baked-in bridge endpoint
# → studio-bridge: registered device "vizij-<random>" with Studio
```

That's the whole setup — the app connects to production Studio with **no env
vars**. The device info is self-generated: name `vizij-<random>` (a stable suffix
per launch), model family `Vizij`, software version `vizij-standalone-<crate
version>`, hardware version empty. The one thing the app needs to make the device
show up under _your_ account — the owning Firebase UID — it asks for **in its own
UI on first run** (see [Register this device](#register-this-device-to-your-studio-account)
below). The variables below are **optional**: `DEVICE_OWNERS` pre-answers the
prompt for headless/scripted runs, the others point at a non-production stack.

| Variable                                  | Purpose                                                                                                                                                                               | Default                                      |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `DEVICE_OWNERS`                           | Comma-separated Studio user IDs (Firebase UIDs) that own — and can therefore see and claim — the device. When set (non-empty) it **overrides** the in-UI prompt and is not persisted. | _unset_ (the app prompts in-UI on first run) |
| `STUDIO_BRIDGE_ENDPOINT`                  | Point the client at a non-production bridge (first entry wins), e.g. `tcp/localhost:7447`                                                                                             | _unset_ (baked-in production endpoint)       |
| `FIREBASE_*` / `FIREBASE_*_EMULATOR_HOST` | Override the baked Firebase config / point auth/firestore/storage at local emulators                                                                                                  | _unset_ (baked-in config)                    |

### Register this device to your Studio account

By default the device connects but is owned by no one until you say so. The app
asks for the owner **in its own UI**:

1. **Find your Studio user ID (Firebase UID).** Sign in to Semio Studio and copy
   your UID from the account/profile screen, or from the Firebase console
   (**Authentication → Users**) for the `semio-studio-deployment` project.
2. **Launch the app** (any platform — desktop or Android):

   ```bash
   pnpm --filter vizij-standalone dev -- --no-default-features --features studio-bridge
   ```

3. **Answer the prompt.** On first run a modal appears asking for the Studio user
   ID. Paste your UID (several comma-separated UIDs share the device across
   accounts) and press **Register**, or **Skip (register unowned)** to leave it
   unclaimed. The choice is persisted, so the app won't ask again; the device is
   re-registered live, no restart needed.
4. **Open Semio Studio** signed in as that same user. The device appears in your
   device list; claim it to view/control it.

To change the owner later, delete the persisted `studio_owners.json` from the
app's local data directory (so the prompt returns), or launch once with
`DEVICE_OWNERS` set.

**Headless / scripted runs** can skip the prompt by setting `DEVICE_OWNERS`
(env, or a `.env` next to the app — loaded at launch by `dotenvy`), which
overrides the UI and persists nothing:

```bash
DEVICE_OWNERS=<your-firebase-uid> \
cargo run --manifest-path apps/vizij-standalone/src-tauri/Cargo.toml \
  --no-default-features --features studio-bridge
```

### Testing against a local bridge

To develop against a local Studio Bridge instead of the production one:

1. Run a local bridge (Zenoh router) — see
   [`studio-bridge/README.md`](../../../studio-bridge/README.md); the dev router
   listens on `tcp/localhost:7447`.
2. Launch with `STUDIO_BRIDGE_ENDPOINT=tcp/localhost:7447` (env or a `.env` next to the
   app). Add `FIREBASE_*_EMULATOR_HOST` if you run the Firebase emulators. Both
   override the baked-in defaults, so a studio-bridge build transparently targets
   your local stack.

### CI

Both the PR debug APK and the `main` release APK
([`.github/workflows/android.yml`](../../.github/workflows/android.yml)) are
built with `--features studio-bridge` — **zero-config**, since the client crate
bakes in the Firebase config and bridge endpoint. No secrets injected, no
per-user `DEVICE_OWNERS` baked — each operator answers the in-UI owner prompt on
first launch to register the app to their own account (as above).

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

`arora-bridge-ros2` is an optional Cargo dependency behind the `ros2` feature. Building without it (`--no-default-features`) requires no Npcap installation.

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
   - `ANDROID_KEY_BASE64` — the keystore, base64-encoded (`base64 -w0 upload-keystore.jks`)
   - `ANDROID_KEY_PASSWORD` — only if the keystore has a password (omit for a
     passwordless keystore; the same value is used for the store and the key)

Never commit `keystore.properties` or the `.jks` (both are git-ignored).
Back the keystore up somewhere durable: it is the app's update identity —
losing it means installed devices can never update to a new build.

### Release process

Releases are cut from `main` by bumping the app version — nothing else:

1. Bump `version` in `src-tauri/tauri.conf.json` (semver). Android's
   `versionCode` is derived from it, so never reuse or lower a version.
2. Merge to `main`. The `android.yml` workflow sees that no
   `vizij-standalone-v<version>` GitHub release exists yet, builds the
   **signed** release APK, and publishes it as release
   `vizij-standalone-v<version>` with the APK attached. The per-app tag
   prefix keeps releases distinct in this monorepo.
3. A push to `main` without a version bump produces no release (the existing
   tag short-circuits the build).

The release build **fails** if `ANDROID_KEY_BASE64` is missing — published
APKs are always signed. Verify a download with
`apksigner verify --print-certs <apk>`.

## Manual Checks

WebSocket/manual panel checks:

- launch the app with a known GLB and verify the browser control panel lists keys (`{"type":"list_keys"}`)
- call `reset` from the panel or `wscat`
- if a bundle contains transport items, verify the Transport tab can list, play, pause, and stop them

ROS2 data-topic check (data topics only — no method services; see ARORA-62):

```bash
# with the app running (default `ros2` feature), from src-tauri/:
cargo run --example list_topics                          # see /vizij/keys/... topics
cargo run --example subscribe_slot -- /vizij/keys/<key>  # observe a published key
cargo run --example publish_slot   -- /vizij/keys/<key> 0.8  # drive an input key
```

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
