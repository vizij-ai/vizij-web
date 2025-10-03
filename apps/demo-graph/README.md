# demo-graph

A minimal browser demo for running a Vizij node graph (WASM) and interactively editing inputs to see outputs update in real time.

What this demo shows

- Load and run GraphSpec samples from @vizij/node-graph-wasm (plus one local URDF sample).
- Simple Input editors for Input nodes (leaf-focused: float, vec3, vector, tuple, transform.pos).
- Output panels for Output nodes (values are displayed numerically or as JSON).
- Play/Pause control that toggles an internal RAF loop.
- Load/save GraphSpec JSON.

## New in 0.2.x: Provider readiness + per-frame input re-staging

This demo now uses the new `@vizij/node-graph-react` provider API:

- `GraphProvider` with safe defaults for WASM-backed graphs:
  - `waitForGraph` default true, so playback starts only after `loadGraph(spec)` finishes and seeds are applied.
  - `initialParams`, `initialInputs`, and `graphLoadTimeoutMs` are available.
- Readiness API surfaced on the runtime:
  - `graphLoaded` boolean and `waitForGraphReady()` promise.
  - `on/off('graphLoaded'|'graphLoadError')` event helpers.

Host input behavior (per-frame re-staging)

- While Playing (`autoStart=true`), this demo re-stages the current input values each frame before the provider evaluates the graph. This guarantees Input nodes always see the latest host-provided values on every evaluation tick.
- When Paused (`autoStart=false`), the demo re-stages all input values once and triggers a single immediate evaluation so outputs “lock” to the current state.

Notes

- You can also rely on “latched” inputs (last staged values persist) depending on your design; this demo chooses explicit per-frame re-staging to make staging semantics visible and predictable in a simple app.
- For larger apps, you may throttle re-staging or only re-stage changed inputs for performance.

Run the app

1. Build wasm package and link/ensure available (from repo root):
   - node vizij-rs/scripts/build-graph-wasm.mjs
   - cd vizij-rs/npm/@vizij/node-graph-wasm && pnpm run build
   - Optionally `pnpm link --global`; otherwise ensure vizij-web installs it

2. Start the demo:
   - pnpm install
   - pnpm --filter demo-graph dev
   - Open the printed Local URL (e.g., http://localhost:5173).

How it works (updated)

- Samples:
  - The demo loads graph samples exported by @vizij/node-graph-wasm (vector-playground, oscillator-basics, logic-gate, tuple-spring-damp-slew).
  - A single local URDF IK Position sample is included (getLocalUrdfSpec) for convenience.
- Input editors:
  - The demo enumerates Input nodes in the current GraphSpec and renders a minimal ValueEditor per input path.
  - The editor is controlled by a single local state map keyed by TypedPath, so edited values remain in the UI and are not tied to static spec defaults.
  - On every edit, all inputs are staged to the runtime; when paused we trigger an immediate eval for responsiveness, while playing we let the provider’s loop evaluate on the next tick.
- Output panels:
  - Each Output node is rendered by a dedicated OutputPanel component which subscribes to its output using useNodeOutput.
  - This avoids React hook order issues when switching between graphs with different numbers of outputs.
- Play/Pause semantics:
  - When playing, the demo re-stages inputs every frame before the provider’s eval tick.
  - When pausing, the demo re-stages all current input values once and performs a single immediate eval to “lock” the outputs for the static view.

Epoch semantics (why re-staging may be needed)

- Many host-driven graph designs expect inputs to be “present” each evaluation.
- The demo ensures host-side values are supplied at each frame while playing; when paused, a one-shot restage produces a stable snapshot.

UI overview

- Play / Pause: toggles the internal RAF loop. While playing, inputs are re-staged every frame; when paused, inputs are re-staged once.
- Graph file: choose a local JSON file; the loader accepts GraphSpec-like shapes documented below.
- Sample: pick a sample from the wasm package, or the local “urdf-ik-position”.
- Inputs: dynamically generated controls for all Input nodes detected in the graph.
- Outputs: panels showing each Output node’s “out” port.

Supported JSON file formats

- GraphSpec:
  {
  "nodes": [...],
  "edges": [...]
  }
- Editor-presets (demo-node-graph):
  {
  "n": [...], // nodes
  "e": [...] // edges
  }
- Wrapped spec:
  {
  "spec": { "nodes": [...], "edges": [...] }
  }

Key files

- src/App.tsx
  - Renders Input editors and Output panels.
  - Maintains inputState keyed by TypedPath; stages all inputs on change/spec load/pause; re-stages each frame while playing.
  - Uses a dedicated OutputPanel component per output to prevent React hook order warnings.
- src/utils/graph-default.ts
  - Selects a default sample from the wasm package (vectorPlayground) or a local fallback (URDF).
- src/assets/graph-presets.ts
  - Local URDF sample (only local sample retained).

Troubleshooting

- If you see errors about the @vizij/node-graph-wasm entry:
  - Ensure the package is built (tsc) and pkg/ exists (wasm-pack).
  - The package.json in @vizij/node-graph-wasm must point to dist/src/index.js and export the ESM entry.
- If outputs don’t update when playing:
  - Confirm the frame restage effect is running (see frameVersion-based effect above).
  - Ensure your edited inputs correspond to Input nodes with valid TypedPath in the current graph.
- If switching between graphs triggers React hook errors:
  - The demo uses an OutputPanel component that encapsulates useNodeOutput, avoiding hook reordering. If you copy patterns from the demo, avoid calling hooks inside arrays where the number of calls can change across renders.

Notes

- This demo is intentionally small and focused on staging behavior and the mechanics of editing inputs and seeing outputs update.
- For a full node editor experience (graph visualization, drag/links, etc.), see the demo-node-graph app in this repo.
