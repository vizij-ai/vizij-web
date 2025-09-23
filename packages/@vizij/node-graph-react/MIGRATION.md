# Migration Guide — from NodeGraphProvider / useNodeGraph to GraphProvider + hooks

This document helps consumers migrate from the legacy `NodeGraphProvider` / `useNodeGraph` API to the new guide-compliant API implemented in this package: `GraphProvider`, `useGraphRuntime`, `useGraphOutputs`, `useGraphInput`, `useGraphInstance`, and `useGraphPlayback`.

This is a breaking change. The package currently includes a temporary compatibility shim (`src/compat.tsx`) to help with an incremental migration; however you should plan to update your app to the new API and remove the shim at your earliest convenience.

Contents

- Quick mapping: legacy -> new
- Key behavioral differences and rationale
- Migration recipes (examples)
  - Simple read of a node output
  - Controlled input (immediate eval)
  - setParam usage
  - Playback controls
  - Local graph instance (useGraphInstance)
- SSR, worker, and testing notes
- Recommended migration checklist & verification steps
- Troubleshooting and FAQs

---

Quick mapping: legacy -> new

- NodeGraphProvider -> GraphProvider
  - New prop: `spec` (object or JSON string). `autoStart` remains supported.
- useNodeGraph -> useGraphRuntime
  - Old runtime methods are present on the runtime object returned by `useGraphRuntime()`.
  - Prefer the fine-grained selectors (`useGraphOutputs`) for UI components.
- getNodeOutputSnapshot / getNodeOutput -> useGraphOutputs / useNodeOutput / useNodeOutputs
- stageInput -> runtime.stageInput or useGraphInput
- setParam -> runtime.setParam
- reload/loadGraph -> runtime.loadGraph
- Writes: useGraphOutputs(s => s.writes) or runtime.getWrites() / runtime.clearWrites()

Key behavioral differences and rationale

- useSyncExternalStore-based selectors:
  - `useGraphOutputs(selector)` subscribes only to derived slices of the provider snapshot. This reduces unnecessary re-renders.
- Staging model:
  - Host inputs are staged on the provider then applied before the next eval tick.
  - `useGraphInput(path, value, shape?, { immediateEval })` is a convenience that stages inputs for controlled components; `immediateEval: true` will apply staged inputs immediately and run an eval to provide fast UI feedback.
- Playback is explicit and pluggable:
  - `useGraphPlayback()` controls playback modes: `"manual" | "raf" | "interval"`. Use `runtime.setTime` for timecode-style control (explicit absolute time).
- Compatibility shim:
  - `src/compat.tsx` exposes legacy names for a transition period. It is recommended to migrate fully before removing the shim.

Migration recipes

1. Read a node output (legacy -> new)

Legacy:

```tsx
const ng = useNodeGraph();
const snapshot = ng.getNodeOutputSnapshot("const");
const value = snapshot?.value?.float;
```

New:

```tsx
import { useGraphOutputs } from "@vizij/node-graph-react";

function NodeValue({ nodeId = "const" }) {
  const port = useGraphOutputs((snap) => snap.nodes?.[nodeId]?.out ?? null);
  const val = port?.value?.float;
  return <span>{val ?? "--"}</span>;
}
```

Notes:

- Selector input to `useGraphOutputs` accepts the provider snapshot projection (nodes/writes/version).
- Provide an `equalityFn` if you need custom equality (not implemented on all helpers; consider wrapping selector).

2. Controlled input with immediate feedback

Use-case: a slider should immediately change graph outputs.

New recommended pattern:

```tsx
import { useGraphInput } from "@vizij/node-graph-react";

function FrequencySlider() {
  // returns a stage function (path, value, shape?, opts?)
  const stage = useGraphInput();
  return (
    <input
      type="range"
      min={0}
      max={10}
      step={0.1}
      onChange={(e) => {
        const v = Number(e.target.value);
        // Stage and eval immediately for responsive UI
        stage("oscillator/frequency", { float: v }, undefined, {
          immediateEval: true,
        });
      }}
    />
  );
}
```

If you use the runtime directly:

```tsx
const rt = useGraphRuntime();
rt.stageInput("oscillator/frequency", { float: v }, undefined, true); // immediateEval true
```

3. setParam / parameter updates (without reload)
   Legacy:

```tsx
ng.setParam("nodeId", "frequency", 1.5);
```

New:

```tsx
const rt = useGraphRuntime();
rt.setParam("nodeId", "frequency", 1.5);
// Optionally run an immediate eval for fast feedback:
rt.evalAll?.();
```

4. Playback control
   New:

```tsx
import { useGraphPlayback } from "@vizij/node-graph-react";

const pb = useGraphPlayback();
pb.start("raf"); // or pb.start("interval", 30);
pb.stop();
const mode = pb.getMode(); // reactive value from provider snapshot
```

Notes:

- `autoStart` and `autoMode` on `GraphProvider` allow starting playback on provider ready.
- For timeline/timecode workflows, use `runtime.setTime(t)` and then `runtime.evalAll()`.

5. Local Graph instance (useGraphInstance)
   If you previously created ephemeral graphs, the new hook `useGraphInstance(spec)` creates and tears down a local instance:

```tsx
const graph = useGraphInstance(spec, { normalize: true });
// graph is WASM Graph or null. Use it for isolated eval flows.
```

SSR, worker, and testing notes

- SSR: provider guards WASM init and requestAnimationFrame usage so server renders are safe. Consumer components should gate interactive rendering with `useGraphRuntime().ready` if needed.
- Worker: not implemented yet. Provider hooks are designed to allow swapping in a worker-backed Graph in future.
- Testing: tests in the package mock `@vizij/node-graph-wasm`. For consumer app tests, either:
  - Mock `@vizij/node-graph-wasm` similarly
  - Use the compatibility shim temporarily during migration

Recommended migration checklist

1. Replace imports and API usage:
   - Change `NodeGraphProvider` -> `GraphProvider(spec=...)`
   - Replace `useNodeGraph` with `useGraphRuntime` or `useGraphOutputs` where appropriate.
2. Prefer selectors:
   - Replace places that read the entire snapshot with `useGraphOutputs` selectors that return only what the component needs.
3. Update controlled inputs to `useGraphInput` or `runtime.stageInput`.
4. Run unit/integration tests across affected apps and components.
5. Remove `src/compat.tsx` once all consumers updated.
6. Bump major version and publish.

Troubleshooting & tips

- If components using `getPlaybackMode()` do not react to the mode change, migrate them to `useGraphPlayback()` (it subscribes to the provider snapshot) or read `useGraphOutputs(s => s.playbackMode)`.
- If `immediateEval` is used heavily and causes performance issues, debounce calls in the UI or use interval/raf playback instead of evaluating on every change.
- For large snapshots, use selectors to avoid passing heavy objects through props.

Examples & recipes (more)

- See README and test files for more usage patterns and the provider runtime shape.
- If you need a migration PR template for your repo, ask and I will prepare one.
