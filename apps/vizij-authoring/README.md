# vizij-authoring

`vizij-authoring` is the runtime-truthful authoring surface for Vizij assets. It lets you load a face, author bindings/poses/graphs, validate them against the same runtime stack used by downstream apps, and export the resulting bundled GLB.

## Why `runtime-truthful`

The app is built around `@vizij/runtime-react`, not a separate preview-only renderer path.

That matters because the main viewer is exercising the same runtime contracts that downstream consumers rely on:

- bundle-first face loading
- canonical rig input paths
- pose-driver and animation registration
- renderer output bridging
- transport behavior for authored clips/programs

In practice, authoring uses runtime-react in more advanced ways than the simpler demos:

- `setGraphBundle()` hot-swaps rig/pose/animation/program payloads without always reloading the underlying GLB
- `transformOutputWrite()` filters/remaps runtime outputs before they hit the renderer store
- reference-face surfaces run on their own runtime, stepped only while visible

See [`src/components/app/Viewer.tsx`](./src/components/app/Viewer.tsx) and [`src/components/app/ReferenceFaceRuntime.tsx`](./src/components/app/ReferenceFaceRuntime.tsx).

## Core Workflows

- load a local GLB, URL, bundled GLB, or imported graph payload
- inspect hierarchy, properties, bindings, and live runtime values
- author expressions, drivers, and pose rigs
- validate authored output against runtime behavior
- export a bundled GLB as the primary runtime target

## Notable Current Features

- expression authoring with arithmetic, boolean logic, and validation feedback
- inline label curation and slot remapping
- auto-generated standard-input drivers with enable/disable and round-trip metadata
- grouped pose workflow with canonical pose-weight paths: `rig/{face}/poses/{poseId}.weight`
- graph import face-id safety and remapping
- live IR stats and report export hooks

## Standard Feature Spaces Editor

The Standard Feature Spaces Editor is the main interoperability workflow for standard inputs.

High-level flow:

1. load the main face
2. optionally load a reference face
3. manage the standard channel hierarchy in the Channels tab
4. author bindings in the Mapping tab

Path shape:

```text
/standard/{namespace}/{channel}/{track}/{attribute}
```

Example:

```text
/standard/semio/left_eye/pos/x
```

## Export Model

Primary target:

- bundled GLB with GraphSpec + IR + assets for runtime consumers

Additional exports:

- graph/subgraph JSON
- IR snapshots

Validation rules:

- export is blocked when GraphSpec normalization/build fails
- export may proceed when IR is unhealthy, but the runtime keeps using the last known good graph payload

## Scripts

```bash
pnpm --filter vizij-authoring dev
pnpm --filter vizij-authoring build
pnpm --filter vizij-authoring preview
pnpm --filter vizij-authoring typecheck
pnpm --filter vizij-authoring lint
pnpm --filter vizij-authoring test
pnpm --filter vizij-authoring validate
pnpm --filter vizij-authoring test:e2e:smoke
```

The checked-in sample assets currently live under [`public/assets`](./public/assets).

## Docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Runtime/truth contracts: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- UI behavior contract: [`docs/UI_DESIGN.md`](./docs/UI_DESIGN.md)
- Program planning/status: [`docs/plans/ROADMAP.md`](./docs/plans/ROADMAP.md), [`docs/plans/TRACKER.md`](./docs/plans/TRACKER.md)

## Deployment

Firebase hosting commands:

```bash
pnpm --dir apps/vizij-authoring exec firebase hosting:channel:deploy staging --only hosting:vizij-workspace
pnpm --dir apps/vizij-authoring exec firebase deploy --only hosting:vizij-workspace
```

The app’s Firebase config points Hosting at `dist/`, keeps the wasm-related headers in place, and rewrites routes to `index.html`.
