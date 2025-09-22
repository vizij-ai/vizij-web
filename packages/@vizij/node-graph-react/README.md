# @vizij/node-graph-react (guide-compliant refactor)

This package provides a React-first wrapper around the @vizij/node-graph-wasm runtime.  
It replaces the previous monolithic `NodeGraphProvider`/`useNodeGraph` surface with a provider + hooks API that follows the official integration guides.

Status

- Core provider + hooks implemented: `GraphProvider`, `useGraphRuntime`, `useGraphOutputs`, `useGraphInput`, `useGraphInstance`, `useGraphPlayback`.
- Lightweight internal store implemented with `useSyncExternalStore`-compatible API.
- Compatibility shim exists (temporary) to ease migration: `compat.tsx` exports legacy names.
- Unit tests present for provider, playback, and selectors. Tests and TypeScript build pass locally.
- Remaining work: packaging polish, exhaustive typing across the public surface, extra edge-case tests, final migration removal of shim (see TODOs below).

Quickstart (new API)

1. Wrap your app (or subtree) with the provider:

```tsx
import { GraphProvider } from "@vizij/node-graph-react";

<GraphProvider spec={myGraphJson} autoStart>
  <MyApp />
</GraphProvider>;
```

2. Read outputs with a selector:

```tsx
import { useGraphOutputs } from "@vizij/node-graph-react";

function NodeValue({ nodeId }) {
  const val = useGraphOutputs((snap) => snap.nodes?.[nodeId]?.out ?? null);
  return <span>{String(val?.value?.float ?? "")}</span>;
}
```

3. Stage inputs (controlled UI):

```tsx
import { useGraphInput } from "@vizij/node-graph-react";

function FrequencySlider() {
  const stage = useGraphInput("osc/frequency", { float: 1.0 });
  return (
    <input
      type="range"
      onChange={(e) =>
        stage(Number(e.target.value), undefined, { immediateEval: true })
      }
    />
  );
}
```

4. Control playback:

```tsx
import { useGraphPlayback } from "@vizij/node-graph-react";

const pb = useGraphPlayback();
pb.start("interval", 30); // interval @ 30 Hz
pb.stop();
```

Migration guide (legacy -> new)
This section explains how to move from the old `NodeGraphProvider` / `useNodeGraph` surface to the new API.

Legacy example (old):

```tsx
import { NodeGraphProvider, useNodeGraph } from "@vizij/node-graph-react";

function OldComp() {
  const ng = useNodeGraph();
  const out = ng.getNodeOutputSnapshot("const");
  return <div>{out?.value?.float}</div>;
}
```

New API equivalent:

```tsx
import { GraphProvider, useGraphOutputs } from "@vizij/node-graph-react";

function NewComp() {
  const val = useGraphOutputs((snap) => snap.nodes?.["const"]?.out ?? null);
  return <div>{val?.value?.float}</div>;
}
```

Key mapping

- NodeGraphProvider -> GraphProvider (prop `spec` or `initialSpec`; `autoStart` remains)
- useNodeGraph -> useGraphRuntime (runtime methods are available on the returned object)
  - setParam -> runtime.setParam(nodeId, key, value)
  - stageInput -> runtime.stageInput(path, value, shape?, immediateEval?)
  - loadGraph -> runtime.loadGraph(spec)
- getNodeOutputSnapshot/getNodeOutput -> useGraphOutputs or useNodeOutput/useNodeOutputs
- Playback control:
  - legacy internal loops -> useGraphPlayback (modes: "manual" | "raf" | "interval")
- Writes: useGraphOutputs(snap => snap.writes) or runtime.getWrites/clearWrites

Compatibility shim

- A small compatibility file `src/compat.tsx` is present and exports `NodeGraphProvider`, `useNodeGraph`, and a small set of legacy helpers. This is intended as a temporary transitional aid for existing consumers and tests.
- Plan: remove shim when consumers are migrated and a major version bump is published.

Testing & TypeScript

- The package has unit tests that mock `@vizij/node-graph-wasm` and cover core provider behavior, playback loops, and selector hooks.
- Run locally:
  - Tests: `cd vizij-web/packages/@vizij/node-graph-react && npm test`
  - Build: `cd vizij-web/packages/@vizij/node-graph-react && npm run build`

Current limitations & TODOs

- Stronger exported TypeScript surface: there is still opportunity to tighten some `any` usages (the core runtime edge boundaries are typed, but a final review is recommended).
- Add tests for:
  - input staging immediateEval edge cases (rapid updates / debounce)
  - teardown / `graph.free()` and resource cleanup
  - timecode mode (explicit setTime-driven playback) and interval throttling correctness
  - selector equalityFn effectiveness and render-count profiling
- Decide whether to keep the compatibility shim for one release or remove it immediately. If removing, update downstream consumers and bump major version.
- Packaging polish: consider `sideEffects: false`, update exports in package.json, and publish notes.

Recommended next actions (I can do any of these)

- Draft a dedicated CHANGELOG + consumer migration guide file (MIGRATION.md) for the release notes.
- Remove the compatibility shim and update tests/consumers to hard-break to the new API (prepare PR).
- Add the remaining tests listed above.

If you want me to proceed, pick one action and I will implement it and run tests/build before returning.
