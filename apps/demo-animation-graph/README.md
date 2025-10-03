# Demo: Animation × Node Graph

This app showcases the `@vizij/animation-react` and `@vizij/node-graph-react` packages working together. Two interactive panels are included:

1. URDF IK target — Streams an animation target into a graph that embeds a `urdfikposition` node. Use the "URDF Loader & IK Controls" panel to upload a robot URDF, pick root/tip links, tweak solver parameters, and inspect the resolved joint record. A small sample (`vizij_three_link`) lives under `src/data/urdf-samples/keep-small-urdfs/` for quick experimentation.
2. Slew + Damp visualiser — Drives a noisy scalar track through `slew` and `damp` nodes. Live controls update `max_rate` and `half_life` via `runtime.setParam`, and plots stay aligned thanks to the synchronized series helper.

## New: GraphProvider readiness, declarative seeds, and safe defaults

`@vizij/node-graph-react@0.2.x` adds a safe default behavior optimized for both lightweight and heavyweight (WASM-backed) graphs:

- Safe default: `waitForGraph={true}` when a `spec` is provided.
  - The provider will await `runtime.loadGraph(spec)`, apply any `initialParams` and `initialInputs` once, then resolve a readiness promise and begin evaluation (if `autoStart`).
- Readiness API:
  - `runtime.graphLoaded: boolean`
  - `runtime.waitForGraphReady(): Promise<void>`
  - `runtime.on/off('graphLoaded' | 'graphLoadError')`
- Declarative seeding:
  - `initialParams?: Record<string, Record<string, ValueJSON>>`
  - `initialInputs?: Record<string, ValueJSON>`
- Timeout: `graphLoadTimeoutMs?: number | null` (default 60000ms; set `null` to disable)

Example (declarative usage):

```tsx
<GraphProvider
  spec={ikGraphSpec}
  waitForGraph
  initialParams={{
    fk: { urdf_xml: sampleUrdf, root_link: "base_link", tip_link: "tool" },
    ik_solver: {
      urdf_xml: sampleUrdf,
      root_link: "base_link",
      tip_link: "tool",
    },
  }}
  initialInputs={{
    [ikPaths.jointInput]: { vector: [0, 0, 0, 0, 0, 0] },
  }}
  autoStart={false}
/>
```

Awaiting readiness in a component:

```ts
import { useGraphRuntime, useGraphLoaded } from "@vizij/node-graph-react";

const rt = useGraphRuntime();
const { graphLoaded, waitForGraphReady } = useGraphLoaded();

useEffect(() => {
  (async () => {
    await waitForGraphReady();
    // Safe to stage/eval:
    rt.stageInput(ikPaths.jointInput, { vector: jointValues });
    rt.evalAll?.();
  })();
}, [waitForGraphReady, rt]);
```

Optional helper for convenience:

```ts
import { useSafeEval } from "@vizij/node-graph-react";
const { stageAndEval } = useSafeEval();
// Will await readiness if available:
await stageAndEval(ikPaths.jointInput, { vector: jointValues });
```

## Current status & best practices

### Slew / Damp demo

- Works end-to-end using the stock GraphProvider props (`spec`, `autoStart`, `autoMode="raf"`).
- Uses `useGraphOutputs` selectors for plotting and `runtime.setParam` for the UI controls; this pattern is stable and a good reference for other scalar demos.

### IK demo (recommended usage)

- The animation → FK → IK pipeline relies on a heavyweight WASM graph. The new provider defaults make this safe by waiting for WASM graph construction and applying seeds before the loop runs.
- We now use declarative `spec`, `initialParams`, and `initialInputs` on the provider and await `waitForGraphReady()` before any imperative calls.
- Keep FK and IK nodes consistent (seed both `fk` and `ik_solver` with matching URDF/root/tip).
- Stage animation joints each tick, then `evalAll()` (or rely on auto-started playback).

URDF size guidance:

- Keep URDF payloads reasonably small for demos. As a rule of thumb, prefer ≤ 1MB (MAX_URDF_BYTES) to avoid slow parsing and large network payloads.

## Migration notes

If you previously manually loaded graphs in effects:

- You can now supply `spec` to the provider and keep `waitForGraph={true}` (default).
- Move your one-time seeds into `initialParams`/`initialInputs`.
- Use `useGraphLoaded().waitForGraphReady()` only for imperative code that must block until the graph is ready (e.g., first live stage/eval sequences).

Legacy opt-out:

- If you need the previous behavior for a demo (start ticking immediately even while loading), set `waitForGraph={false}`.

Dev server notes:

- Import from the package name (`@vizij/node-graph-react`). Avoid deep source imports in demos.
- If you ever deep-import during development, ensure your Vite config allows the WASM package paths and excludes `@vizij/node-graph-wasm` from optimizeDeps.

## Development

```
pnpm install
pnpm --filter demo-animation-graph dev
```

The Vite dev server watches the local packages. Build the node-graph-react package first if you’ve changed it:

```
pnpm --filter "@vizij/node-graph-react" build
```

## Testing & checks

- `pnpm --filter demo-animation-graph build` — Type-checks and builds the production bundle.
