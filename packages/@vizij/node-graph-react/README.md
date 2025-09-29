# @vizij/node-graph-react (guide-compliant refactor)

This package provides a React-first wrapper around the @vizij/node-graph-wasm runtime.
It replaces the previous monolithic `NodeGraphProvider`/`useNodeGraph` surface with a provider + hooks API that follows the official integration guides.

Status

- Core provider + hooks implemented: `GraphProvider`, `useGraphRuntime`, `useGraphOutputs`, `useGraphInput`, `useGraphInstance`, `useGraphPlayback`.
- Lightweight internal store implemented with `useSyncExternalStore`-compatible API.
- Compatibility shim exists (temporary) to ease migration: `compat.tsx` exports legacy names.
- Type surface aligned to runtime surface (readiness fields on the runtime).
- Remaining work: extra edge-case tests and final migration removal of shim (see TODOs below).

## New in 0.2.x: Readiness, declarative seeding, and safe defaults

0.2.x adds a safe default behavior optimized for both lightweight and heavyweight (WASM-backed) graphs:

GraphProvider (new props)

- `waitForGraph?: boolean` (default: true)
  - When a `spec` is provided, the provider awaits `runtime.loadGraph(spec)` and applies any seeds before starting playback.
- `graphLoadTimeoutMs?: number | null` (default: 60000; `null` disables timeout)
  - Readiness promise rejects on timeout if the graph fails to load.
- `initialParams?: Record<string, Record<string, ValueJSON>>`
  - One-shot parameter seeding by node/param after graph load completes.
- `initialInputs?: Record<string, ValueJSON>`
  - One-shot input staging after graph load completes.
- `exposeGraphReadyPromise?: boolean` (default: true)
  - If true, the provider surfaces a readiness promise and on/off events on the runtime.

Runtime (readiness fields exposed by provider)

- `graphLoaded: boolean`
- `waitForGraphReady?: () => Promise<void>`
- `on?: (event: "graphLoaded" | "graphLoadError", cb: (info?: any) => void) => void`
- `off?: (event: "graphLoaded" | "graphLoadError", cb: (info?: any) => void) => void`

Example (declarative usage)

```tsx
import { GraphProvider } from "@vizij/node-graph-react";
import { ikGraphSpec } from "./ikGraph";
import { sampleUrdf } from "./urdf";

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
    "nodes.joint_input.inputs.in": { vector: [0, 0, 0, 0, 0, 0] },
  }}
  autoStart={false}
/>;
```

Awaiting readiness in a component

```tsx
import { useGraphRuntime, useGraphLoaded } from "@vizij/node-graph-react";

function MyComp() {
  const rt = useGraphRuntime();
  const { waitForGraphReady } = useGraphLoaded();
  useEffect(() => {
    (async () => {
      await waitForGraphReady();
      rt.stageInput("nodes.inputA.inputs.in", { float: 1.0 });
      rt.evalAll?.();
    })();
  }, [waitForGraphReady, rt]);
  return null;
}
```

Convenience helpers

```tsx
import { useSafeEval } from "@vizij/node-graph-react";
const { stageAndEval, safeEvalAll } = useSafeEval();
// Automatically awaits readiness if available
await stageAndEval("nodes.inputA.inputs.in", { vector: [1, 2, 3] });
```

Semantics & notes

- The provider applies a safe default (`waitForGraph=true`) so the eval loop does not begin until the graph has been constructed and one-time seeds have been applied.
- No automatic buffering/replay of live stage/eval calls is added; use `waitForGraphReady()` for imperative flows or gate your streaming logic.
- Staged host inputs are applied at the start of each eval. Your app can choose to:
  - Re-stage inputs every frame when playing (e.g., demos that model host-driven Input nodes), or
  - Rely on the last staged inputs (latched until changed) depending on your design.

## Quickstart (new API)

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

function NodeValue({ nodeId }: { nodeId: string }) {
  const val = useGraphOutputs(
    (snap: any) => snap?.evalResult?.nodes?.[nodeId]?.out ?? null,
  );
  return <span>{String(val?.value?.float ?? "")}</span>;
}
```

3. Stage inputs (controlled UI):

```tsx
import { useGraphRuntime } from "@vizij/node-graph-react";
function FrequencySlider() {
  const rt = useGraphRuntime();
  return (
    <input
      type="range"
      onChange={(e) => {
        rt.stageInput(
          "nodes.inputA.inputs.in",
          { float: Number(e.target.value) },
          undefined,
          true,
        );
      }}
    />
  );
}
```

4. Control playback:

```tsx
import { useGraphPlayback } from "@vizij/node-graph-react";

const pb = useGraphPlayback();
pb.start("interval", 30);
pb.stop();
```

## Migration guide (legacy -> new)

Legacy example (old)

```tsx
import { NodeGraphProvider, useNodeGraph } from "@vizij/node-graph-react";

function OldComp() {
  const ng = useNodeGraph();
  const out = ng.getNodeOutputSnapshot("const");
  return <div>{out?.value?.float}</div>;
}
```

New API equivalent

```tsx
import { GraphProvider, useGraphOutputs } from "@vizij/node-graph-react";

function NewComp() {
  const val = useGraphOutputs(
    (snap: any) => snap?.evalResult?.nodes?.["const"]?.out ?? null,
  );
  return <div>{val?.value?.float}</div>;
}
```

Key mapping

- NodeGraphProvider -> GraphProvider (prop `spec`, `autoStart`, `waitForGraph` etc.)
- useNodeGraph -> useGraphRuntime (runtime methods are available on the returned object)
  - setParam -> runtime.setParam(nodeId, key, value)
  - stageInput -> runtime.stageInput(path, value, shape?, immediateEval?)
  - loadGraph -> runtime.loadGraph(spec)
- getNodeOutputSnapshot/getNodeOutput -> useGraphOutputs or useNodeOutput/useNodeOutputs
- Playback control:
  - legacy internal loops -> useGraphPlayback (modes: "manual" | "raf" | "interval")
- Writes: useGraphOutputs(snap => snap.writes) or runtime.getWrites/clearWrites

Compatibility shim

- A small compatibility file `src/compat.tsx` is present and exports `NodeGraphProvider`, `useNodeGraph`, and legacy helpers. This is intended as a temporary transitional aid.

## Testing & TypeScript

- The package includes unit tests for provider readiness and error handling (mocked WASM).
- Run locally:
  - Tests: `cd vizij-web/packages/@vizij/node-graph-react && npm test`
  - Build: `cd vizij-web/packages/@vizij/node-graph-react && npm run build`

## Current limitations & TODOs

- Add tests for:
  - Input staging immediateEval edge cases (rapid updates)
  - Teardown / `graph.free()` and resource cleanup
  - Timecode mode (explicit setTime-driven playback) and interval throttling correctness
  - Selector equalityFn effectiveness and render-count profiling
- Decide whether to keep the compatibility shim for one release or remove it in a major bump.
- Packaging polish: consider `sideEffects: false`, update exports in package.json, and publish notes.
