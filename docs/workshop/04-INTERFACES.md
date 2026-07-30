# Interfaces — every surface Vizij exposes

_A complete catalog of the ways something can touch Vizij: apps, packages, CLIs, wire
protocols, file formats, and namespaces. Verified against `main` @ `418d7f2f`.
This is the "how many front doors do we have?" document._

---

## 1. Human interfaces (apps)

### In `vizij-web`

| App                                                          | What it is                                                                                                                                                                                                      | Status                                                          | Audience                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| **`vizij-authoring`**                                        | The authoring tool. Single-page IDE-style workspace (not URL-routed). React 19, Zustand, ReactFlow 11, Three.js 0.170, Radix/Base UI, Tailwind 4, Vite. Deployed to Firebase Hosting (target `vizij-workspace`) | Active, monolithic (`App.tsx` = 4,632 lines)                    | Rig Author, Motion Designer, Interaction Designer |
| **`vizij-showcase`**                                         | The multi-surface runtime demo. Several face experiences in one app, each on its own runtime, throttled when out of view. **The reference consumer for runtime-react orchestration**                            | Active                                                          | Demos, and anyone learning the runtime            |
| **`vizij-standalone`**                                       | Tauri desktop runtime. Wraps `runtime-react`, loads one bundle, exposes it over local control surfaces                                                                                                          | **Maintenance-only** — superseded by native `vizij`. Fixes only | Operators, demo installs                          |
| **`demo-vizij-player`**                                      | Face player demo                                                                                                                                                                                                | Active                                                          | Consumers                                         |
| **`tutorial-fullscreen-face`**                               | The smallest end-to-end `runtime-react` example: one GLB, one provider, one face, plus mouse-gaze and pose-hotkey hooks. **The canonical minimal tutorial**                                                     | Active                                                          | New integrators                                   |
| **`tutorial-agent-face`**                                    | Next step up from fullscreen-face                                                                                                                                                                               | Active                                                          | New integrators                                   |
| **`demo-graph-studio`**                                      | Node-graph editor demo on `node-graph-react`                                                                                                                                                                    | Active                                                          | Graph authors                                     |
| **`demo-animation-studio`**                                  | Animation editor demo                                                                                                                                                                                           | Active                                                          | Clip authors                                      |
| **`minimal-demo-graph` / `-animation` / `-animation-graph`** | Minimal engine demos                                                                                                                                                                                            | Active                                                          | Engine debugging                                  |
| **`vizij-ws-app`**                                           | WebSocket app surface                                                                                                                                                                                           | Active                                                          | Live control                                      |

### Outside `vizij-web`

| Surface                          | What it is                                                                                                                                                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`vizij` (native, `vizij-rs`)** | **The primary runtime app now.** `cargo run` shows Vizij running an arora. Animation module + clip transport, program autoplay, neutral staging. Flags: `--headless` (frame capture + visual-regression), `--ros2`, `--studio`, `--no-ros4hri`. Bridges compose directly onto the one device |
| **`vizij-bundle` (CLI)**         | Bundle tooling. `add-standard` embeds a standard profile into a GLB; Quori JSON sidecar support                                                                                                                                                                                              |
| **`vizij-ir-report` (CLI)**      | Shipped by `@vizij/node-graph-authoring` — IR reporting                                                                                                                                                                                                                                      |
| **Semio Studio**                 | Separate product; connects to a Vizij runtime over the Studio Bridge to view live data (VIZ-67)                                                                                                                                                                                              |

**Count: 11 apps in this repo + 2 CLIs + 1 native app + 1 external product.**
That is a lot of front doors for a team this size, and consolidating them is a
legitimate workshop topic.

---

## 2. Programmatic interfaces (packages)

### Workspace packages (`packages/@vizij/*`)

| Package                           | Version | The interface it exposes                                                                                                                                                                                                                                                       |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`@vizij/runtime-react`**        | 0.3.0   | **The de-facto reuse unit.** `VizijRuntimeProvider`, `VizijRuntimeFace`, `useVizijRuntime`, `useAnimationTransport`, `useMotionGraphNamespace`, `useSpeechPlayback`; `setGraphBundle()` hot-swap, `apply(GraphDiff)` in-place recompose, `transformOutputWrite()` output remap |
| **`@vizij/render`**               | 0.1.1   | Renderer + scene store: `createVizijStore` / `VizijContext` / `useVizijStore*` (Zustand `world` / `animatables` / `values`), `loadGLTFFromBlobWithBundle`, `exportScene`, `applyVizijBundle`; types `World`, `Feature`, `VizijBundleExtension`                                 |
| **`@vizij/node-graph-authoring`** | 0.2.0   | Authoring-time compiler: `buildRigGraphSpec`, `compileIrGraph`, `bindingToDefinition`, `createDefaultBinding`; `BindingMap`, `IrGraph`, `MachineReport`; the `vizij-ir-report` CLI                                                                                             |
| **`@vizij/utils`**                | 0.1.0   | The shared value vocabulary: `AnimatableNumber/Color/…`, `StandardRigInput`, `RawValue`, namespace + id helpers                                                                                                                                                                |
| **`@vizij/speech-react`**         | 0.1.1   | Speech pipeline as React hooks                                                                                                                                                                                                                                                 |
| **`@vizij/animation-react`**      | 0.2.0   | Animation React bindings                                                                                                                                                                                                                                                       |
| **`@vizij/node-graph-react`**     | 0.2.0   | `init()` (WASM init) + `getNodeSchemas()` (palette catalog)                                                                                                                                                                                                                    |
| **`@vizij/minimal-demo-ui`**      | 0.1.0   | Shared UI for the minimal demos                                                                                                                                                                                                                                                |

### Published runtime packages (external)

| Package                       | Version                     | Note                                                                                                                                            |
| ----------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@vizij/runtime`**          | ^2.1.0 (2.2.0 for profiles) | The arora device compiled to WASM. Also exposes `standardProfiles()` and `standardProfile(id, rigPrefix)`. **Formerly `@vizij/arora-web-wasm`** |
| **`@vizij/node-graph`**       | ^0.7.0                      | Graph evaluation + `normalizeGraphSpec`. **Formerly `@vizij/node-graph-wasm`**                                                                  |
| **`@vizij/animation`**        | ^0.4.0                      | Keyframe playback. **Formerly `@vizij/animation-wasm`**                                                                                         |
| **`@vizij/animation-module`** | ^0.2.0                      | The animation module `runtime-react` consumes                                                                                                   |
| **`@vizij/value-json`**       | ^0.2.0                      | The value wire format — tagged-union JSON, tuple vectors `[x,y,z]`, decoded via `valueAs*`. **Absorbed `@vizij/arora-types`**                   |

Published from CI (VIZ-89 for npm, VIZ-88 for crates.io).

### Deleted / renamed — do not cite

`@vizij/orchestrator-wasm`, `@vizij/orchestrator-react`, `@vizij/arora-types`,
`@vizij/arora-web-wasm`, `@vizij/node-graph-wasm`, `@vizij/animation-wasm`,
`packages/arora-connection`, `packages/arora-websocket`, the `bevy_vizij_*` crates.
Older docs (including PR #65's inventory) reference several of these.

### Local alias, not a package

`@vizij/authoring-shared` → `apps/vizij-authoring/src/shared/index.ts` — a Vite alias
re-exporting `useDialogQueue`, `useBundleAudit`, `usePoseGraphImport`, `useVizijExport`,
`useGraphPlaybackControls`, `fileIO`, `standardInputPaths`. **This is an extraction
boundary that was never extracted.**

### The missing packages

| Proposed            | What it would be                                                                                                                      | Status                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `@vizij/face-core`  | Framework-agnostic `FaceRuntime` controller (load → compose → step → get/set inputs → resolve controls → transport). No React, no DOM | Scaffold on PR #86 only              |
| `@vizij/components` | Functional, runtime-wired React components extracted from the authoring app                                                           | Doesn't exist                        |
| `@vizij/face-embed` | `<vizij-face>` custom element + `<script>` + COOP/COEP-aware iframe fallback                                                          | **Doesn't exist. The headline gap.** |
| `@vizij/editor-*`   | timeline / program / pose / rig-inspector / control-map / checkup                                                                     | Doesn't exist                        |

---

## 3. Wire interfaces (live control)

### The store vocabulary

Everything reduces to reading and writing values at canonical paths. The
`vizij-standalone` WebSocket bridge established the verbs:

```text
  write_values   read_values   list_keys   list_methods   invoke
                      ← server pushes → values_changed
```

**Note the asymmetry:** `list_methods` / `invoke` exist in the wire vocabulary, but per
the arora notes only Update / Get / ListKeys ops are actually implemented on the web
side — device method invocation (`callDevice`) plus claim/release are unbuilt
(tracked as ARORA-62). So the protocol is wider than the implementation.

### The bridges

| Bridge                | Transport                                                                                                                   | Where                                                               | Status |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------ |
| **Local / WebSocket** | WS on `--port` (default 9000), plus a same-port browser control panel unless `--no-web-control`                             | `vizij-standalone`; native `vizij` has an open local bridge         | ●      |
| **ROS 2**             | `arora-bridge-ros2` (published, 4.0 line). DDS and Zenoh backends (VIZ-15)                                                  | native `vizij --ros2`; `vizij-standalone` `ros2` feature            | ●      |
| **Studio / Zenoh**    | `arora-studio-bridge-client` (6.0 line) — remote-operator channel                                                           | native `vizij --studio`; `vizij-standalone` `studio-bridge` feature | ●      |
| **ROS4HRI topics**    | `hri_msgs` incl. `FacialActionUnits`, mapped through the `ros4hri` profile. Topics only — services and actions out of scope | native `vizij` (on by default)                                      | ●      |

**The important architectural change:** bridges now attach to **the device**, not to a
mirrored copy of its store. `vizij-standalone`'s webview↔native mirror was a workaround
that the native app dissolves (VIZ-74).

---

## 4. File-format interfaces (the artifact)

### The Face Package

A **GLB** with an embedded **`VIZIJ_bundle`** glTF extension
(`packages/@vizij/render/src/types/vizij-bundle.ts`). It carries:

- rig graph(s) + IR
- pose config, pose graph, pose IR + diagnostics
- animation clips (`AnimationClipIR`, schemaVersion 1)
- motion-graph programs
- **embedded standard profiles** under stable ids like `standard::ros4hri`
- metadata — including `activeMotionGraphId`, so a face "just starts behaving" on load
- optional `speechConfig`

**Round-trippable.** Import → edit → export must preserve everything, including graph
kinds the app didn't author (this was broken; PR #100 fixes it).

**Precedence rule:** at deploy, an embedded profile copy **overrides** the runtime's
built-in mapping of the same id.

### Other formats

| Format                                  | Purpose                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `.graph.json`                           | Rig graph spec, importable/exportable                                                        |
| `.ir.json`                              | Compiled IR                                                                                  |
| Pose graph / pose config / pose IR JSON | Legacy/advanced pose exchange; `POSE_RIG_CONFIG_VERSION = 1`, `POSE_RIG_IR_VERSION = 1`      |
| `profiles/ros4hri.json`                 | The canonical profile asset — 674 nodes. Regenerable from the builder; a test fails on drift |
| Quori JSON sidecar                      | `vizij-bundle` output                                                                        |
| Machine report JSON                     | Graph diagnostics, pasteable into the diagnostics panel                                      |

---

## 5. Namespace interfaces (the paths)

The most consequential interface in the system, because it's the only one with no
compiler checking it. See [`01-MENTAL-MODELS.md`](./01-MENTAL-MODELS.md) §2.

| Namespace                                                       | Owner                   | Notes                                                            |
| --------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------- |
| `rig/{faceId}/...`                                              | authored controls       | The main authoring space                                         |
| `rig/{faceId}/poses/{poseId}.weight`                            | pose plane              | Expression weights                                               |
| `rig/{faceId}/pose/control/{inputId}`                           | pose plane              | Control as driven by poses                                       |
| `/pose/groups/{id}.output`, `/pose/stages/{id}.output`          | derived                 | Layering outputs                                                 |
| `/standard/{namespace}/{channel}/{track}/{attribute}`           | Standard Feature Spaces | e.g. `/standard/semio/left_eye/pos/x`                            |
| `standard/ros4hri/*`                                            | the ROS4HRI profile     | Driven by ROS topics                                             |
| `/speech/speaking`, `/speech/user_speaking`, `/speech/thinking` | speech                  | Plus emotion + viseme groups                                     |
| `arora/*`                                                       | runtime built-ins       | **Should never be user-visible** — VIZ-72 tracks remaining leaks |

### The face-standard vocabulary (new)

Under `standard`, the runtime now ships a semantic layer:

- de-facto **gaze** and **lid** paths
- `expression/<name>` — ROS4HRI's 25
- `viseme/<shape>` — the industry 15
- a **muscle tier** cherry-picked from **FACS** action units (so
  `hri_msgs/FacialActionUnits` maps losslessly) and **ARKit** blendshapes (for
  lateralization and the names off-the-shelf assets actually use)

This is a _standards-body-shaped_ interface. It's the most externally-facing thing
Vizij has ever shipped, and no one in `vizij-authoring` can currently browse it.

---

## 6. Environment interfaces (constraints on hosts)

| Constraint                 | Detail                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cross-origin isolation** | WASM requires COOP `same-origin` + COEP `require-corp`. Set in `vite.config.ts` (dev) and `firebase.json` (prod). **This is why a framework-agnostic embed needs an iframe fallback** — most host sites can't set these headers |
| **Bundler**                | Must emit `.wasm` assets and allow async WASM loading. Next.js needs `experiments.asyncWebAssembly` + an `asset/resource` rule for `.wasm`. Pass plain string URLs to init helpers — not `RelativeURL` wrappers                 |
| **Node**                   | Pinned to 24 via `.nvmrc`                                                                                                                                                                                                       |
| **Release lines**          | `@vizij/runtime-react`, `@vizij/render`, and `@vizij/runtime` should stay on the same workspace/release line                                                                                                                    |
| **Hosting**                | `vizij-authoring` → Firebase Hosting, target `vizij-workspace`, static only. No server database                                                                                                                                 |
| **rAF throttling**         | A browser pane that is occluded stops receiving animation frames entirely — a real cause of "the face is frozen"                                                                                                                |

---

## 7. Interface inventory summary

| Category                              |                                          Count |
| ------------------------------------- | ---------------------------------------------: |
| Apps in `vizij-web`                   |                                             11 |
| CLIs                                  |          2 (`vizij-bundle`, `vizij-ir-report`) |
| Native hosts                          | 1 (`vizij`), 1 deprecated (`vizij-standalone`) |
| Workspace npm packages                |                                              8 |
| Published runtime npm packages        |                                              5 |
| Missing/proposed packages             |                                              4 |
| Live-control bridges                  |                                              4 |
| Wire verbs                            |                               5 + 1 push event |
| File formats                          |                                              6 |
| Path namespaces                       |                                              8 |
| Deleted-but-still-documented packages |                                              9 |

**The workshop question this begs:** which of these are _interfaces we commit to_ and
which are _incidental_? Nothing in the repo currently distinguishes them, so every one
of them is a de-facto contract.
