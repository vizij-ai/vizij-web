# @vizij/node-graph-react

> **React provider and hook suite for Vizij node graphs – load WASM specs, stage inputs, and consume outputs with idiomatic patterns.**

This package wraps `@vizij/node-graph-wasm` in a declarative React API. It handles WASM initialisation, graph loading, readiness promises, staged inputs, playback loops, and `useSyncExternalStore`-friendly subscriptions.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Core Concepts](#core-concepts)
5. [Hooks Reference](#hooks-reference)
6. [Development & Testing](#development--testing)
7. [Related Packages](#related-packages)

---

## Overview

- `GraphProvider` wraps your component tree with a graph runtime derived from `@vizij/node-graph-wasm`.
- Hooks such as `useGraphRuntime`, `useGraphOutputs`, `useNodeOutput`, `useGraphPlayback`, and `useGraphInput` expose runtime controls and derived state.
- Built-in readiness flow (`waitForGraph`, `waitForGraphReady`) ensures initial parameters and staged inputs land before evaluations begin.
- Managed staged input store prevents redundant allocations and guards against invalid cleanups – `stageInput(path, undefined, …)` now removes entries safely.
- A compatibility shim (`compat.tsx`) exports legacy names to ease incremental migration from earlier APIs.

---

## Installation

```bash
npm install @vizij/node-graph-react @vizij/node-graph-wasm react react-dom
```

When consuming linked WASM packages during development, configure Vite (or your bundler) to preserve symlinks and exclude the wasm shim from prebundling. See the [vizij-web README](../../README.md#local-wasm-development) for details.

---

## Quick Start

```tsx
import { GraphProvider, useGraphOutputs } from "@vizij/node-graph-react";
import graphSpec from "./graph.json";

function NodeValue({ nodeId }: { nodeId: string }) {
  const out = useGraphOutputs(
    (snap) => snap?.evalResult?.nodes?.[nodeId]?.out ?? null,
  );
  return <span>{out?.value?.float?.toFixed?.(2) ?? "—"}</span>;
}

export function App() {
  return (
    <GraphProvider spec={graphSpec} waitForGraph autoStart>
      <NodeValue nodeId="oscillator" />
    </GraphProvider>
  );
}
```

Stage a value from a controlled input:

```tsx
import { useGraphRuntime } from "@vizij/node-graph-react";

function FrequencySlider() {
  const rt = useGraphRuntime();
  return (
    <input
      type="range"
      min={0}
      max={5}
      step={0.1}
      onChange={(event) => {
        rt.stageInput(
          "nodes.frequency.inputs.in",
          { float: Number(event.target.value) },
          undefined,
          true, // immediate eval
        );
      }}
    />
  );
}
```

Await readiness before streaming inputs:

```tsx
import { useEffect } from "react";
import { useGraphRuntime } from "@vizij/node-graph-react";

function Awaiter() {
  const rt = useGraphRuntime();
  useEffect(() => {
    (async () => {
      if (rt.waitForGraphReady) {
        await rt.waitForGraphReady();
      }
      rt.stageInput("nodes.inputA.inputs.in", { float: 1 });
      rt.evalAll?.();
    })();
  }, [rt]);
  return null;
}
```

---

## Core Concepts

### GraphProvider Props

- `spec?: GraphSpec | string` – Graph to load; JSON strings are normalised automatically.
- `waitForGraph` (default `true`) – Await `loadGraph` + initial seeding before marking the runtime ready or starting playback.
- `graphLoadTimeoutMs` (default `60000`) – Rejects readiness if the graph fails to load in the allotted time (`null` disables).
- `initialParams` / `initialInputs` – One-shot seeds applied after `loadGraph` succeeds.
- `autoStart` / `autoMode` / `updateHz` – Control playback loops (`"manual"`, `"raf"`, `"interval"`).
- `exposeGraphReadyPromise` (default `true`) – Expose `waitForGraphReady`, `on`, and `off` helpers on the runtime.
- `wasmInitInput` – Forwards optional init input to `@vizij/node-graph-wasm.init`.

### Runtime Surface

`useGraphRuntime` returns an object with:

- Control methods: `loadGraph`, `unloadGraph`, `evalAll`, `stageInput`, `applyStagedInputs`, `clearStagedInputs`, `setParam`, `step`, `setTime`, `startPlayback`, `stopPlayback`, `getWrites`, `clearWrites`.
- Registry helpers: `normalizeGraphSpec?(spec)` and `getNodeSchemas?()` forward to the underlying WASM bindings so editors can fetch canonical specs and the node palette (including new controllers such as `case`, `default-blend`, and the weighted blend family).
- Readiness helpers: `ready`, `graphLoaded`, `waitForGraphReady?`, `on?`, `off?`.
- Snapshot utilities: `getSnapshot`, `subscribe`, `getVersion`.
- Improved staging semantics: passing `undefined` now removes entries instead of staging invalid payloads, and typed paths are validated (no whitespace, trimmed) before staging to avoid runtime panics.

### Internal Store

- Built on a tiny `createGraphStore` helper that implements `subscribe`, `getSnapshot`, `setSnapshot`, and `getVersion`.
- Works with `useSyncExternalStore` to deliver consistent cross-render behaviour.
- Keeps staged inputs in a ref (`stagedInputsRef`) to avoid prop-state churn.

### WASM Initialisation (0.2.4+)

- `GraphProvider` and `useGraphInstance` both await `@vizij/node-graph-wasm.init()` before constructing graphs.
- `normalizeSpec` is awaited before invoking wasm constructors to avoid passing unresolved promises (previous versions produced `{}` specs and confusing errors).

---

## Hooks Reference

| Hook                                                     | Purpose                                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `useGraphRuntime()`                                      | Access the imperative runtime API described above.                                                                                              |
| `useGraphOutputs(selector, equalityFn?)`                 | Subscribe to derived data from the store using `useSyncExternalStore`.                                                                          |
| `useNodeOutputs(nodeId)`                                 | Convenience wrapper returning an entire node output map.                                                                                        |
| `useNodeOutput(nodeId, key?)`                            | Subscribe to a single output value.                                                                                                             |
| `useGraphInput(path, value, shape?, { immediateEval? })` | Declarative staging hook; cleans up by removing staged inputs.                                                                                  |
| `useGraphPlayback()`                                     | Control and query playback mode (`manual`, `raf`, `interval`).                                                                                  |
| `useGraphInstance(spec?, options?)`                      | Manage an isolated graph instance outside the provider – ideal for tooling or tests. Normalises specs async and guarantees wasm initialisation. |

The legacy API remains available via `compat.tsx`, but new development should target the hooks above.

---

## Development & Testing

This package uses pnpm workspaces. Typical commands from the repo root:

```bash
pnpm --filter "@vizij/node-graph-react" dev
pnpm --filter "@vizij/node-graph-react" test
pnpm --filter "@vizij/node-graph-react" build
pnpm --filter "@vizij/node-graph-react" typecheck
```

Tests run under Vitest with the wasm layer mocked to keep CI fast. To exercise the real WASM runtime end-to-end, rebuild the wrapper in `vizij-rs` and run one of the demo apps (e.g., `apps/demo-graph`).

---

## Related Packages

- [`@vizij/node-graph-wasm`](../../../vizij-rs/npm/@vizij/node-graph-wasm/README.md) – wasm wrapper consumed by this package.
- [`vizij-graph-wasm`](../../../vizij-rs/crates/node-graph/vizij-graph-wasm/README.md) – Rust crate providing the wasm binding.
- [`vizij-graph-core`](../../../vizij-rs/crates/node-graph/vizij-graph-core/README.md) – Core evaluator that ultimately runs the graph.
- [`@vizij/orchestrator-react`](../@vizij/orchestrator-react/README.md) – React provider for coordinating graphs and animations together.

Need help or spot something missing? File an issue in the Vizij repo—consistent docs keep our integration story sharp. ⚙️
