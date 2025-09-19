# @vizij/node-graph-react

React bindings for the Vizij node-graph runtime. Wraps `@vizij/node-graph-wasm` with a provider, selector hooks, and helpers so React apps can load, evaluate, and interact with Vizij graphs.

What’s included

- NodeGraphProvider: initializes wasm, runs an optional RAF loop, exposes a stable context API
- Selector hooks: subscribe to per-node outputs and writes
- Utilities: coercion helpers to read `ValueJSON`/`PortSnapshot` into primitives

Installation

```bash
npm install @vizij/node-graph-react @vizij/node-graph-wasm
```

Quick start (samples)

```tsx
import React from "react";
import {
  NodeGraphProvider,
  useNodeGraph,
  useNodeOutput,
} from "@vizij/node-graph-react";
import { vectorPlayground, type GraphSpec } from "@vizij/node-graph-wasm";

const spec: GraphSpec = vectorPlayground;

function SumPanel() {
  const sum = useNodeOutput("out_sum"); // uses OutputPanel pattern below in real apps
  return <div>sum: {sum?.value?.vector?.join(", ")}</div>;
}

export default function App() {
  return (
    <NodeGraphProvider spec={spec} autostart updateHz={60}>
      <SumPanel />
    </NodeGraphProvider>
  );
}
```

Context API (`useNodeGraph`)

- `ready`: true once wasm has initialized and the initial spec is loaded.
- `setParam(nodeId, key, value)`: update a node parameter and re-evaluate immediately.
- `reload(spec)`: replace the graph spec at runtime (object or JSON string).
- `setTime(t)`: set absolute evaluation time (seconds) and re-evaluate.
- `stageInput(path, value, declaredShape?, immediateEval?)`:
  - Stages a typed value keyed by `TypedPath` for consumption by `Input` nodes.
  - If `immediateEval` (default true), the Provider calls `evalAll()` to reflect the update in UI; otherwise it will appear on the next evaluation tick.
- `subscribeToNode(nodeId, cb)` / `getNodeOutputSnapshot(nodeId, key?)` / `getNodeOutput(nodeId)`
- `subscribeToWrites(cb)` / `getWrites()` / `clearWrites()`
- `getLastDt()`: returns the dt (seconds) of the most recent step.

Epochs and input staging (important)

- The core advances an input “epoch” at the start of every evaluation (via `evaluate_all`).
- Inputs staged are visible only for the next epoch and then dropped. To keep inputs visible while playing, the host must restage them each frame.
- NodeGraphProvider persists staged inputs and re-stages them automatically every RAF tick before calling `evalAll()`. This keeps `Input` nodes fed while playing.
- When paused (`autostart=false`), no RAF loop runs. If you call `stageInput(..., immediateEval=true)` while paused, the Provider will perform a one-shot eval so outputs reflect your change.

Recommended input pattern

- Keep a host-side state map keyed by `TypedPath` for all input values your UI controls.
- On each edit, update your map and call `stageInput` for all inputs (the edited path with `immediateEval=true` for snappy feedback, others `false`).
- Example:

```tsx
const { stageInput } = useNodeGraph();
const [inputs, setInputs] = useState<Record<string, ValueJSON>>({});

function onEdit(path: string, next: ValueJSON, declared?: ShapeJSON) {
  setInputs((prev) => {
    const nextState = { ...prev, [path]: next };
    Object.entries(nextState).forEach(([p, val]) => {
      const immediate = p === path;
      stageInput(p, val, declared, immediate);
    });
    return nextState;
  });
}
```

Avoid React hook order errors (OutputPanel pattern)

- Don’t call hooks inside array maps when the number of calls may change across renders (e.g., switching graphs with different IO counts).
- Instead, render a child component that encapsulates the hook:

```tsx
function OutputPanel({ nodeId }: { nodeId: string }) {
  const snapshot = useNodeOutput(nodeId, "out");
  // ... render value/shape
  return <div>{JSON.stringify(snapshot?.value)}</div>;
}

// Then map to <OutputPanel key={node.id} nodeId={node.id} />
```

Provider props
| Prop | Description |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| `spec` | Graph spec (`GraphSpec` or JSON string) loaded on mount and when the reference changes. |
| `autostart` | When `true` (default) runs an internal RAF loop that calls `step(dt)` and `evalAll()` automatically each frame. |
| `updateHz` | Optional throttle in Hz for UI notifications (e.g. `30` → ~33 ms). |

Selector hooks

- `useNodeOutput(nodeId, key = "out")` → `PortSnapshot | undefined`
- `useNodeOutputs(nodeId)` → `Record<string, PortSnapshot> | undefined`
- `useGraphWrites()` → `WriteOpJSON[]`
- `PortSnapshot` is `{ value: ValueJSON, shape: ShapeJSON }`.

Utilities

- `valueAsNumber`, `valueAsVector`, `valueAsVec3`, `valueAsBool` — helper coercions for `ValueJSON`/`PortSnapshot` into UI-friendly primitives.

Troubleshooting

- “Outputs don’t update when playing”:
  - Confirm the Provider logs show “RAF re-stage” and your inputs are being staged every frame.
  - Ensure your `TypedPath` matches the `Input` node’s `params.path`.
- “Values revert when paused”:
  - While paused, use `stageInput(..., true)` for a one-shot eval after staging. If you maintain a local input state, you can re-stage all current values once on pause.
- “Hook order warnings when switching graphs”:
  - Use the `OutputPanel` child component to encapsulate `useNodeOutput` so hook order stays consistent even as output counts change.

Notes

- This package assumes `@vizij/node-graph-wasm` is properly built (tsc) and its `pkg/` artifacts exist (wasm-pack build). In a monorepo with symlinks, ensure Vite configuration preserves symlinks or that dependencies are installed in-place.
- For a minimal example app using this provider, see `vizij-web/apps/demo-graph` in this repo.
