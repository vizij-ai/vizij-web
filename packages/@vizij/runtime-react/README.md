# @vizij/runtime-react

`@vizij/runtime-react` is the bundle-first React runtime for Vizij faces. It loads a GLB or prebuilt world, extracts embedded Vizij metadata, composes the rig/pose/program graphs into the behavior of an Arora device ([`@vizij/runtime`](https://www.npmjs.com/package/@vizij/runtime) — an Arora runtime compiled to WebAssembly), mirrors resolved values into the renderer store, and exposes a React-friendly control surface for apps.

The package is intentionally aimed at app authors. If your app wants to render a Vizij face and drive it through authored rig inputs, this is the layer to build on.

> Status: experimental. Public API is still moving with the runtime/export pipeline.

## What It Handles

- load a face from a GLB URL, a `Blob`, or an already loaded world
- extract the embedded `VIZIJ_bundle` payload when present
- merge explicit `rig`, `pose`, `animations`, and `programs` with discovered bundle content
- compose the registered graphs into the device's behavior and drive its step loop
- expose runtime status, controls, diagnostics, and update hooks through React context
- render the resolved face with `VizijRuntimeFace`

## Installation

```bash
pnpm add @vizij/runtime-react react react-dom
```

If your app also imports lower-level renderer or engine APIs directly, install those packages too:

```bash
pnpm add @vizij/render @vizij/runtime
```

`@vizij/runtime-react`, `@vizij/render`, and `@vizij/runtime` should stay on the same workspace/release line.

### Bundler Notes

The runtime depends on Vizij wasm packages transitively. Your bundler needs to emit `.wasm` assets and allow async wasm loading.

Example `next.config.js`:

```js
module.exports = {
  webpack: (config) => {
    config.experiments = {
      ...(config.experiments ?? {}),
      asyncWebAssembly: true,
    };
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });
    return config;
  },
};
```

If you override wasm URLs manually, pass plain string URLs to the underlying init helpers. Avoid wrappers that turn them into `RelativeURL` objects.

## Quick Start

```tsx
import {
  VizijRuntimeFace,
  VizijRuntimeProvider,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";

const faceAssetUrl = new URL("./face.glb", import.meta.url).href;

const assetBundle: VizijAssetBundle = {
  namespace: "demo-face",
  glb: {
    kind: "url",
    src: faceAssetUrl,
    aggressiveImport: true,
  },
  pose: {
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};

export function App() {
  return (
    <VizijRuntimeProvider assetBundle={assetBundle} autostart>
      <RuntimeStage />
    </VizijRuntimeProvider>
  );
}

function RuntimeStage() {
  const { loading, ready, error, stagePoseNeutral } = useVizijRuntime();

  if (loading) return <p>Loading face…</p>;
  if (error) return <p>Runtime failed: {error.message}</p>;
  if (!ready) return <p>Preparing runtime…</p>;

  return (
    <div>
      <button onClick={() => stagePoseNeutral(true)}>Reset pose</button>
      <VizijRuntimeFace className="face-canvas" showSafeArea={false} />
    </div>
  );
}
```

The provider resolves the face bundle, boots its Arora device with the composed graphs as the device's behavior, and publishes the merged runtime state through `useVizijRuntime()`.

## Core Concepts

### Bundle-first runtime

The main contract is `VizijAssetBundle`. In the default workflow you hand the runtime one GLB and let it discover as much as possible from the embedded `VIZIJ_bundle`.

Explicit overrides still work. If you provide `rig`, `pose`, `animations`, or `programs`, the runtime merges them with embedded bundle data and deduplicates animations/programs by id.

### One device per provider

Each `VizijRuntimeProvider` owns one Arora device. The device runs the
composed graph as its behavior on a shared key/value store: graph `input`
nodes read store paths each tick, graph outputs write back, and the provider
mirrors changed values into the renderer store after every step. Providers
are fully isolated from each other — multiple faces mean multiple devices,
and namespacing keeps their store keys apart.

`driveRuntime={false}` mounts a runtime that does not step its device
from its own loop; use it for surfaces that are stepped manually (see
[Manual stepping](#manual-stepping)) or at a background cadence.

### Where the composed graph comes from

The device runs **one** graph, composed from several sources
(`composeGraphSpecs`; the live list is `graphSourcesRef` in
`VizijRuntimeProvider`). Each source has a distinct provenance:

- **Rig graph** — shipped in the loaded GLB/asset bundle (`VIZIJ_bundle`'s
  rig, or the explicit `rig` override). It maps rig input paths to the
  face's morph/bone/material writes: this is the face itself.
- **Pose-driver graph** — the bundle's `pose` graph (or the
  `pose-driver`/`pose` graph discovered in the bundle). It turns high-level
  pose controls into rig-input writes, which the rig source reads back
  through the shared store paths on the next tick.
- **Program graphs** — one source per _playing_ program: procedural graphs
  from the bundle's `programs` started via the transport, and (in
  `vizij-authoring`) the motiongraph editor's graph, published as a program
  so it evaluates on the device like everything else.
- **Animations** — a single source, composed whenever any clip is playing.
  It is an `ExternalFunction` node that steps the **animation module**
  ([`@vizij/animation-module`](https://www.npmjs.com/package/@vizij/animation-module))
  every device tick off the golden `arora/dt`. Clips register into the module
  as data (through its call surface), the module samples them **inside the
  device**, and its per-track outputs are routed on to the rig-input store
  paths (VIZ-61 Stage B — the JS clip pipeline no longer samples clips).

Sources are namespaced by id (`source::node`) so nodes can't collide;
**store paths are deliberately shared** — that is the cross-source contract.

### Animations and the device

Playback ticks inside the device. `play`/`pause`/`stop` map to the
animations source's lifecycle plus the module's player: play loads the clip
and registers the source, pause drops the source (holding the last pose),
stop tears the player down and clears the outputs to neutral.

The 0.1.0 module is ticking-and-loop only. These transport semantics are
**not implemented by the module and are not faked in JS** — each warns once
and is reported honestly (tracked for module-side transport, VIZ-61 Stage C):

- **seek** — `seekAnimation` is a no-op (no module seek); scrubbing and a
  live playhead in `vizij-authoring` are unavailable on the device path.
- **playhead feedback** — `getAnimationState().time` is always `0` (the
  module emits no time feedback); `duration`, `playing`, `loop` are known.
- **one-shot** — clips play in Loop mode only; `setAnimationLoop(false)` is
  not honored.
- **speed / weight** — `playAnimation({ speed, weight })` are ignored (the
  module has no post-add control).
- **keypoint transitions** — the module's keypoint carries no per-keypoint
  timing, so authored linear/step/cubic transitions are dropped; the engine
  samples with its default ease.

### Asset reloads vs graph re-registration

When you swap the `assetBundle` prop, the runtime decides whether it needs to reload assets or only re-register controllers. That behavior is controlled by `updateTier` and is also exposed as `resolveRuntimeUpdatePlan()`.

This matters for tooling apps like `vizij-authoring`, where graphs/animations can change without replacing the face asset itself.

## `VizijAssetBundle`

```ts
type VizijAssetBundle = {
  namespace?: string;
  faceId?: string;
  glb: VizijGlbAsset;
  rig?: VizijGraphAsset;
  pose?: {
    graph?: VizijGraphAsset;
    config?: PoseRigConfig;
    stageNeutralFilter?: (id: string, path: string) => boolean;
  };
  animations?: VizijAnimationAsset[];
  programs?: VizijProgramAsset[];
  initialInputs?: Record<string, ValueJSON>;
  metadata?: Record<string, unknown>;
  bundle?: VizijBundleExtension | null;
};
```

### `glb`

Required. One of:

- `{ kind: "url", src, aggressiveImport?, rootBounds? }`
- `{ kind: "blob", blob, aggressiveImport?, rootBounds? }`
- `{ kind: "world", world, animatables, bundle? }`

Use `kind: "world"` when your app already loaded the scene and wants runtime-react to wire only the engine/runtime layer.

### `rig`

Optional `VizijGraphAsset` for the main rig graph. When omitted, the runtime looks for a compatible graph in the embedded bundle.

### `pose`

Optional pose graph/config surface:

- `graph`: pose-driver graph override
- `config`: `PoseRigConfig` used by pose-aware UIs and pose-blending configuration
- `stageNeutralFilter`: lets you skip specific neutral writes, for example baked color channels

`PoseRigConfig.poseGroups` defines how subsets of poses are grouped for local blend behavior and wider composition. Group labels such as `viseme` or `emotion` are not runtime path segments. Runtime-facing pose writes still use canonical per-pose paths.

### `animations`

Optional authored clips. These merge with embedded bundle animations and extracted GLTF animation clips.

### `programs`

Optional procedural programs. These merge with embedded bundle `motiongraph` entries.

### `initialInputs`

Optional `ValueJSON` map staged before autostart/manual stepping.

### `metadata`

Arbitrary app metadata. The runtime keeps it attached to the resolved `assetBundle`.

### `bundle`

Optional pre-parsed `VizijBundleExtension`. Useful when you already decoded bundle metadata yourself.

## Provider Props

`VizijRuntimeProviderProps`:

- `assetBundle`: required runtime bundle
- `namespace`, `faceId`: override resolved ids without mutating the incoming bundle
- `updateTier`: `"auto"` (default), `"assets"`, or `"graphs"`
- `autoCreate`: load the engine wasm and boot the device automatically on mount
- `autostart`: start the runtime loop automatically after registration
- `driveRuntime`: whether this runtime instance should call `step()` during its loop
- `mergeStrategy`: forwarded to graph registration
- `transformOutputWrite(write)`: intercept or drop output writes before they hit the renderer store
- `onRegisterControllers(ids)`: receive registered graph/animation ids
- `onStatusChange(status)`: subscribe to runtime status changes

### Important runtime flags

- `autostart` controls whether the device begins stepping automatically once ready.
- `driveRuntime={false}` is useful for faces stepped manually or at a background cadence.
- `transformOutputWrite` is the hook to remap or suppress specific runtime outputs before they update renderer state.

## Runtime Context API

Use `useVizijRuntime()` inside the provider tree.

### Status and identity

- `loading`, `ready`
- `error`, `errors`
- `namespace`, `faceId`, `rootId`
- `controllers.graphs`, `controllers.anims`
- `outputPaths`
- `stepHz`
- `assetBundle`
- `inputConstraints`

`inputConstraints` is built from graph metadata and is the right source for slider defaults/ranges in tooling UIs.

### Input and renderer writes

- `setInput(path, value, shape?)`
- `getValueSnapshot(path)` — the current engine-store value of a path (reads your own writes)
- `setValue(id, namespace, value)`
- `stagePoseNeutral(force?)`

### Runtime graph updates

- `setGraphBundle(bundle, options?)`

`setGraphBundle()` lets you swap `rig`, `pose`, `animations`, and `programs` at runtime. This is the API that tooling apps use when the face asset stays the same but the authored runtime bundle changes.

### Value animation helpers

- `animateValue(path, target, options?)`
- `cancelAnimation(path)`
- `setAnimationActive(active)`
- `isAnimationActive()`

`animateValue()` is the simple way to tween a single rig input path with built-in easing.

### Clip transport

- `playAnimation(id, options?)`
- `pauseAnimation(id)`
- `seekAnimation(id, timeSeconds)`
- `setAnimationLoop(id, enabled)`
- `getAnimationState(id)`
- `stopAnimation(id, options?)`

### Program transport

- `playProgram(id)`
- `pauseProgram(id)`
- `stopProgram(id, options?)`
- `getProgramState(id)`

### Manual stepping

- `step(dt, opts?)`
- `advanceAnimations(dt)`

Use manual stepping when you do not want the provider to own the runtime loop or when hidden/shared faces need low-frequency background stepping.

### Driver registration

- `registerInputDriver(id, factory)`

Custom input drivers receive:

- `setInput(path, value, shape?)`
- `setRendererValue(id, namespace, valueOrUpdater)`
- `namespace`
- `faceId`

Return `{ start, stop, dispose }`.

## Hooks

### `useVizijRuntime()`

Throws when used outside the provider.

### `useOptionalVizijRuntime()`

Returns `null` when no provider is present. This is useful for shared components that can operate with or without a runtime.

### `useRigInput(path)`

Returns `[value, setValue]` for a single runtime input path. The setter writes into the device's store, while the value mirrors the renderer store.

### `useVizijOutputs(paths)`

Subscribes to renderer output values for the current namespace and returns a path-to-value map.

## Components

### `VizijRuntimeFace`

`VizijRuntimeFace` renders the resolved face using the current runtime namespace and root id.

It accepts normal `Vizij` renderer props except `rootId` and `namespace`, which are owned by the runtime. It also supports `namespaceOverride` when you need to inspect another namespace while keeping the current runtime context.

## Exported Utilities

### Pose path helpers

- `buildRigInputPath(faceId, path)`
- `buildPoseWeightInputPathSegment(poseId)`
- `buildPoseWeightRelativePath(poseId)`
- `buildPoseWeightPathMap(poses, faceId)`

These are the canonical helpers for pose-weight paths. The current runtime/export contract is:

```text
rig/{faceId}/poses/{poseId}.weight
```

That contract does not change when the pose belongs to a group labeled `viseme` or `emotion`. Group membership exists to control blend behavior, not to build a different input path family.

### Pose semantics helpers

- `normalizePoseSemanticKey()`
- `getPoseSemanticKey()`
- `resolvePoseMembership()`
- `resolvePoseSemantics()`
- `filterPosesBySemanticKind()`
- `buildSemanticPoseWeightPathMap()`
- constants such as `VISEME_POSE_KEYS`, `EMOTION_POSE_KEYS`, and `EXPRESSIVE_EMOTION_POSE_KEYS`

These helpers are convenience utilities for example apps that need to order or match current poses without hard-coding face-specific names. Pose groups themselves still exist to control blending/composition, and these helpers do not introduce paths such as `rig/{faceId}/visemes/...`.

### Automatic input-path detection and pose-control bridging

Runtime-react also auto-detects the actual rig input paths it needs from the registered rig graph:

1. `collectInputPathMap()` scans `input` nodes and records aliases for authored channel ids.
2. When both direct rig inputs and `pose/control` inputs exist, the direct rig input path is preferred for bare channel ids.
3. Compiled pose graphs still emit internal pose-control outputs on:

   ```text
   rig/{faceId}/pose/control/{inputId}
   ```

4. The provider bridges those internal outputs back onto the detected rig input path when possible and falls back to the native `pose/control` path only when necessary.

This is why dependent apps should prefer runtime-react helpers and resolved metadata over hard-coded face-specific input paths.

### Face control helpers

- `resolveFaceControls(assetBundle, runtimeFaceId?, inputConstraints?)`
- `mapNormalizedControlValue(control, value)`
- `mapUnitControlValue(control, value)`

Use these when you want to build gaze/blink/eyelid controls from runtime metadata rather than hard-coded paths.

### Update policy helpers

- `resolveRuntimeUpdatePlan(previous, next, tier)`

This is the same policy used internally by the provider to decide between:

- reloading assets
- only re-registering graphs/animations/programs
- doing nothing

## Common Patterns

### Multiple faces in one app

Mount one `VizijRuntimeProvider` per face; each owns its device. Give hidden or non-driver faces `driveRuntime={false}` and step them at a background cadence (see `vizij-showcase`'s `HiddenStepController`).

### Bundle-first player

See [`apps/demo-vizij-player`](../../../apps/demo-vizij-player/README.md) for the reference “one bundled GLB in, runtime UI out” flow.

### Fullscreen face tutorials

See:

- [`apps/tutorial-fullscreen-face/tutorial.md`](../../../apps/tutorial-fullscreen-face/tutorial.md)
- [`apps/tutorial-agent-face/tutorial.md`](../../../apps/tutorial-agent-face/tutorial.md)

### Runtime-truthful authoring

See [`apps/vizij-authoring/README.md`](../../../apps/vizij-authoring/README.md) for the `setGraphBundle()` and `transformOutputWrite()` tooling workflow.

## Development

```bash
pnpm --filter "@vizij/runtime-react" build
pnpm --filter "@vizij/runtime-react" test
pnpm --filter "@vizij/runtime-react" typecheck
pnpm --filter "@vizij/runtime-react" lint
pnpm --filter "@vizij/runtime-react" dev
```

When you change runtime behavior, validate at least one bundle-first app and one shared-runtime app. In this repo the fastest pair is usually:

- `demo-vizij-player`
- `vizij-showcase` or `vizij-authoring`
