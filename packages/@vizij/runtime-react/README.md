# @vizij/runtime-react

High-level runtime harness that combines the Vizij renderer with orchestrator controllers for React apps. Drop in an asset bundle and the provider wires loading, orchestration, and rendering for you.

> **Status:** experimental. Surface area may change ahead of the first stable release.

## Installation

```bash
pnpm add @vizij/runtime-react @vizij/render @vizij/orchestrator-react react react-dom
```

Those three Vizij packages must stay in lock-step; always upgrade them together.

## Getting Started

```tsx
import {
  VizijRuntimeFace,
  VizijRuntimeProvider,
  useVizijRuntime,
} from "@vizij/runtime-react";

import rigGraph from "./rig.graph.json";

const assetBundle = {
  namespace: "demo",
  glb: { kind: "url", src: new URL("./face.glb", import.meta.url).href },
  rig: { id: "rig:demo", spec: rigGraph },
  initialInputs: {
    "pose/blinkLeft": { float: 0.2 },
    "pose/blinkRight": { float: 0.2 },
  },
};

export function App() {
  return (
    <VizijRuntimeProvider assetBundle={assetBundle} autostart>
      <RuntimeHud />
      <VizijRuntimeFace />
    </VizijRuntimeProvider>
  );
}

function RuntimeHud() {
  const { loading, error, namespace } = useVizijRuntime();
  if (loading) return <p>Loading bundle...</p>;
  if (error) return <p>Failed to load runtime: {error.message}</p>;
  return <p>Runtime online for namespace {namespace}</p>;
}
```

The provider creates a renderer store, boots the orchestrator, registers the supplied bundle, then renders the face once bounds are available.

## Asset Bundle Anatomy

`VizijRuntimeProvider` expects a `VizijAssetBundle`:

- `glb`: required. Either `{ kind: "url", src }`, `{ kind: "blob", blob }`, or `{ kind: "world", world, animatables }`. URL/blob variants can opt into `aggressiveImport` for tooling builds and provide `rootBounds` overrides when the GLB lacks metadata.
- `rig`: required. Graph specification describing inputs/outputs for the orchestrator (`id` must be unique within the namespace).
- `pose`: optional. Supply authoring pose graph/config so the runtime can neutralise the rig before you drive it.
- `animations`: optional array. Each item defines channels that map to runtime input paths. Use `playAnimation` to trigger them.
- `initialInputs`: optional map of ValueJSON that seeds inputs before autostart.
- `metadata`: free-form dictionary you can read back through `useVizijRuntime().assetBundle.metadata`.

Namespace defaults to `assetBundle.namespace ?? "default"`. Face id falls back to the bundle pose config when omitted.

## Provider Props

- `assetBundle`: bundle described above.
- `namespace` / `faceId`: override bundle values to reuse the same assets under multiple namespaces or faces.
- `autoCreate` + `createOptions`: forwarded to `OrchestratorProvider`. Leave `autoCreate` enabled unless you need manual control over WASM creation.
- `autostart`: when true, the orchestrator starts ticking as soon as assets register.
- `mergeStrategy`: orchestrator merge strategy, defaults to additive for outputs/intermediate values.
- `onRegisterControllers(ids)`: observe graph and animation controller ids that were registered.
- `onStatusChange(status)`: gets every status update (loading events, errors, controller updates).

The provider exposes context via `useVizijRuntime()` once `loading` flips to `false`.

## Hooks and Helpers

- `useVizijRuntime()`: returns the full runtime context (status, setters, animation helpers, and the original asset bundle). Common properties:
  - `loading`, `ready`, `error`, `errors`: lifecycle state.
  - `namespace`, `faceId`, `rootId`: resolved IDs the renderer/orchestrator share.
  - `outputPaths`: list of output signal paths detected in the registered graphs.
  - `controllers`: `{ graphs, anims }` that were installed.
  - `setInput(path, value)`, `setValue(id, namespace, value)`: talk directly to the orchestrator or renderer store.
  - `stagePoseNeutral(force)`: restore the neutral pose captured at export.
  - `animateValue(path, target, options)`, `cancelAnimation(path)`: tween rig values with built-in easing.
  - `playAnimation(id, options)`, `stopAnimation(id)`: drive bundle animations that were provided in `animations`.
  - `step(dt)` / `advanceAnimations(dt)`: manually tick the orchestrator if you run outside `autostart`.
- `useRigInput(path)`: returns `[value, setter]` for a single rig input. The setter writes through the orchestrator while the value mirrors the renderer store.
- `useVizijOutputs(paths)`: subscribes to renderer output paths (`RawValue` map) for UI or logging.
- `registerInputDriver(id, factory)`: attach custom drivers (speech-to-anim, sensors). The factory receives `setInput` and `setRendererValue` helpers and must return `{ start, stop, dispose }`.

## Components

- `<VizijRuntimeFace />`: renders a `<Vizij>` once `rootId` is known. Pass any renderer props (camera controls, overlays, etc.). Use `namespaceOverride` to inspect another namespace while keeping the runtime context intact.
- Compose your own UI with the renderer primitives exported from `@vizij/render`. The runtime only handles wiring and state.

## Error Handling

Errors are captured with phase metadata. `status.error` is the most recent failure; `status.errors` keeps history for observability panels. Typical phases:

- `assets`: bundle loading issues (bad GLB URL, malformed rig spec).
- `registration`: orchestrator graph registration problems.
- `driver`: input driver lifecycle exceptions.
- `animation`: failures while sampling clip tracks.

Watch `onStatusChange` for realtime updates and implement retries or fallbacks in your UI.

## Working With Animations

Animations are defined alongside rig inputs. Each track maps to an input path (`animation/<id>/<channel>`). When `playAnimation` runs, the runtime schedules frames and writes values back through the orchestrator merge strategy. Use `options.reset` to restart clips, `options.weight` to blend multiple clips, and `stopAnimation` to cut a clip immediately.

For ad-hoc gestures, use `animateValue` with duration/easing. If you need custom easing, pass a function `(t) => number`.

## Asset Bundling Workflow

1. Export an authoring scene to GLB with Vizij metadata intact (bounds, animatable ids).
2. Export orchestrator graphs (rig, pose, optional animation graphs) to JSON.
3. Package everything under a namespace in a `VizijAssetBundle`.
4. Host GLB URLs or include them via bundler asset imports (`new URL("./face.glb", import.meta.url).href`).

The runtime tolerates incremental bundles; swap `assetBundle` props to hot-reload assets in dev builds.

## Development Scripts

```bash
pnpm --filter "@vizij/runtime-react" build      # tsup compile to dist/
pnpm --filter "@vizij/runtime-react" test       # vitest
pnpm --filter "@vizij/runtime-react" typecheck  # tsc --noEmit
pnpm --filter "@vizij/runtime-react" lint       # eslint
pnpm --filter "@vizij/runtime-react" dev        # tsup watch build
```

Changes to orchestrator or renderer packages often require coordinated updates here; run the fullscreen tutorial app (`apps/tutorial-fullscreen-face`) to validate.

## Publishing

When ready to publish:

1. `pnpm changeset` and follow the prompts.
2. `pnpm version:packages` and `pnpm install` to sync lockfiles.
3. Build, test, and pack the runtime filter (`pnpm --filter "@vizij/runtime-react" build`, `pnpm --filter "@vizij/runtime-react" test`, `pnpm --filter "@vizij/runtime-react" exec npm pack --dry-run`).
4. Push a tag named `npm-runtime-react-vX.Y.Z`. The shared GitHub Action handles `npm publish`.
