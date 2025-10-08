# demo-animation-graph

> **Showcases animation and node-graph runtimes working together.**  
> Streams animation tracks into a Vizij graph (including URDF IK) and visualises how graph parameters affect the output.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Panels](#panels)
4. [Provider Defaults & Readiness](#provider-defaults--readiness)
5. [Best Practices](#best-practices)
6. [Development](#development)

---

## Overview

- Built with Vite + React.
- Uses both `@vizij/animation-react` and `@vizij/node-graph-react` providers.
- Demonstrates how animation outputs (joint targets) feed graph nodes that perform FK/IK or smoothing operations.
- Highlights the readiness/declarative seeding features introduced in `@vizij/node-graph-react@0.2.x`.

---

## Quick Start

```bash
pnpm install

# Ensure local packages are built if you are linking them
pnpm --filter "@vizij/animation-react" build
pnpm --filter "@vizij/node-graph-react" build

# Launch the demo
pnpm --filter demo-animation-graph dev
```

---

## Panels

### URDF IK Target

- Upload a URDF, select root/tip links, and adjust solver parameters.
- Animation targets drive an FK node; the graph uses `urdfikposition` to solve for joint angles.
- A sample URDF (`vizij_three_link`) lives in `src/data/urdf-samples/keep-small-urdfs`.

### Slew + Damp Visualiser

- A noisy scalar animation feeds into `slew` and `damp` nodes.
- UI controls call `runtime.setParam` to update `max_rate` and `half_life` in real time.
- Charts update synchronously to show input vs. filtered output.

---

## Provider Defaults & Readiness

`@vizij/node-graph-react` now ships with safe defaults for WASM graphs:

- `waitForGraph` defaults to `true` when `spec` is provided.
- Declarative seeding via `initialParams` / `initialInputs`.
- Readiness helpers: `graphLoaded`, `waitForGraphReady()`, `on/off('graphLoaded'|'graphLoadError')`.
- `graphLoadTimeoutMs` (default 60s) can be customised or disabled with `null`.

Example:

```tsx
<GraphProvider
  spec={ikGraphSpec}
  initialParams={{
    fk: { urdf_xml: sampleUrdf, root_link: "base_link", tip_link: "tool" },
    ik_solver: {
      urdf_xml: sampleUrdf,
      root_link: "base_link",
      tip_link: "tool",
    },
  }}
  initialInputs={{
    [ikPaths.jointInput]: { vector: Array(6).fill(0) },
  }}
  autoStart={false}
/>
```

Await readiness when you need imperative access:

```ts
const rt = useGraphRuntime();
const { waitForGraphReady } = useGraphLoaded();

useEffect(() => {
  (async () => {
    await waitForGraphReady();
    rt.stageInput(ikPaths.jointInput, { vector: jointValues });
    rt.evalAll?.();
  })();
}, [rt, waitForGraphReady]);
```

`useSafeEval()` is also available for convenience and handles readiness internally.

---

## Best Practices

- Keep FK and IK node parameters in sync (URDF XML, root/tip links, seeds).
- Stage animation-derived joint values every tick before evaluation.
- For larger URDF assets, stay under ~1 MB to avoid slow parsing during demos.
- If you need pre-0.2 behaviour (evaluation starts immediately even while loading), set `waitForGraph={false}`.
- Import from package entry points (`@vizij/animation-react`, `@vizij/node-graph-react`) rather than deep paths so Vite can honour the WASM loaders and symlinks.

---

## Development

```bash
pnpm --filter demo-animation-graph dev            # start Vite dev server
pnpm --filter demo-animation-graph build          # type-check & build production bundle
```

Ensure any linked packages are rebuilt before launching the demo. The Vite config already skips pre-bundling the wasm packages and preserves symlinks for linked development.

Enjoy experimenting with the animation × graph pipeline! 🎛️
