# Node-Graph-React Refactor Implementation Plan

[Overview]
Rebuild @vizij/node-graph-react with a guide-compliant API and architecture centered on a GraphProvider and composable hooks (useGraphInstance, useGraphPlayback, useGraphOutputs, useGraphInput), replacing the current monolithic NodeGraphProvider and selector utilities.

The scope includes refactoring the package to align with the React integration guides (GUIDE1.MD and GUIDE2.MD), establishing a clean provider + hooks surface, implementing an internal evaluation store with useSyncExternalStore, and updating tests accordingly. The plan preserves the existing package name but introduces breaking API changes matching the guides’ recommended exports and patterns. No consuming app changes are included in this work; those will follow later.

[Types]  
Introduce strongly-typed provider/Hook configs and re-export WASM types to keep app type usage aligned.

- Re-exports (from @vizij/node-graph-wasm):
  - Graph, init, normalizeGraphSpec, getNodeSchemas
  - Types: GraphSpec, EvalResult, ValueJSON, ShapeJSON, WriteOpJSON, PortSnapshot, InitInput, Registry, Value
- New local types:
  - PlaybackMode = "manual" | "raf" | "interval" | "timecode"
  - PlaybackConfig
    - mode: PlaybackMode (default "raf")
    - tickMs?: number (interval ms for "interval", default 16)
    - updateHz?: number (UI notify rate in Hz; undefined => every frame)
  - GraphProviderProps
    - children: React.ReactNode
    - initialSpec?: GraphSpec | string
    - autoStart?: boolean (default true)
    - wasmInitInput?: InitInput
    - updateHz?: number (UI notify rate in Hz; mirrors PlaybackConfig.updateHz)
    - stepStrategy?: { mode: PlaybackMode; tickMs?: number }
  - GraphRuntimeContextValue
    - ready: boolean
    - graph: Graph | null
    - loadGraph(spec: GraphSpec | string): Promise<void>
    - setTime(t: number): void
    - step(dt: number): void
    - setParam(nodeId: string, key: string, value: Value): void
    - stageInput(path: string, value: ValueJSON | Value, shape?: ShapeJSON, immediateEval?: boolean): void
    - getLastDt(): number
    - status?: "idle" | "loading" | "ready" | "error"
  - EvalStoreSnapshot
    - nodes: Record<string, Record<string, PortSnapshot>>
    - writes: WriteOpJSON[]
    - version: number
  - Selector<T> = (result: EvalResult) => T
  - NodeId = string
  - NodeOutputs = Record<string, PortSnapshot>

Validation rules:

- PlaybackConfig.tickMs must be > 0 for interval; default 16 otherwise.
- updateHz, if set, is clamped to [1, 240].
- shape envelopes passed to stageInput should be optional; Value arrays are encoded via toValueJSON semantics in wasm package.

[Files]
Refactor to a multi-file structure with clear separation of provider, context, hooks, and utils.

- New files to be created:
  - src/GraphContext.ts
    - Exports React context for GraphRuntimeContextValue.
  - src/GraphProvider.tsx
    - Implements GraphProvider; calls init() once; owns Graph ref; manages lifecycle; optional playback loop; provides runtime API and replays staged inputs.
  - src/useGraphRuntime.ts
    - Hook to access GraphRuntimeContextValue; throws if used outside provider.
  - src/useGraphInstance.ts
    - Memoizes/constructs a Graph per normalized spec; uses provider graph when present; supports reload on spec changes.
  - src/useGraphPlayback.ts
    - Drives evaluation according to PlaybackConfig; exposes { isPlaying, lastDt, snapshot?, start, stop, step }.
  - src/useGraphOutputs.ts
    - Selector subscription using useSyncExternalStore; exports:
      - useGraphOutputs<T>(selector: Selector<T>, equalityFn?: (a: T, b: T) => boolean): T
      - useNodeOutput(nodeId: string, key?: string): PortSnapshot | undefined
      - useNodeOutputs(nodeId: string): NodeOutputs | undefined
  - src/useGraphInput.ts
    - Stages host inputs via provider’s stageInput; small wrapper hook for controlled UIs.
  - src/utils/createGraphStore.ts
    - Internal minimal store around latest EvalResult mapped to snapshot shape (nodes/writes/version), with subscribe/getSnapshot/setSnapshot.
  - src/utils/normalizeSpec.ts
    - Thin helper wrapping normalizeGraphSpec and fallback JSON parse.
  - src/index.ts
    - Barrel exports of all above, re-exports of types/functions from @vizij/node-graph-wasm, typed helpers (valueAsNumber, valueAsVec3, valueAsVector, valueAsBool).
- Existing files to be modified:
  - src/index.tsx
    - Replace with new src/index.ts barrel (remove monolithic provider/logic).
- Files to be deleted or moved:
  - Remove src/index.tsx (migrate content into GraphProvider.tsx, hooks, and utils).
- Configuration file updates:
  - package.json: update "exports" to point to ./dist/index.js and types to ./dist/index.d.ts (already set); consider setting "sideEffects": false.
  - tsconfig.json: no changes required; ensure JSX config compatible for .tsx files; include all new src/\*_/_.ts,tsx.

[Functions]
Replace legacy functions with guide-compliant hooks and provider methods.

- New functions/hooks:
  - GraphProvider (component) – src/GraphProvider.tsx
    - Props: GraphProviderProps
    - Purpose: Initialize WASM once, own a single Graph instance, optionally start playback loop (raf/interval/timecode), expose runtime methods via context, manage staged inputs, publish evaluation snapshots to store.
  - useGraphRuntime – src/useGraphRuntime.ts
    - Signature: () => GraphRuntimeContextValue
    - Purpose: Access provider API; throw if missing.
  - useGraphInstance – src/useGraphInstance.ts
    - Signature: (spec: GraphSpec | string | null, options?: { normalize?: boolean }) => Graph | null
    - Purpose: Create/retain Graph per spec; normalize spec if requested; reload on change; teardown on unmount.
  - useGraphPlayback – src/useGraphPlayback.ts
    - Signature: (config?: Partial<PlaybackConfig>) => {
      isPlaying: boolean; lastDt: number;
      snapshot: EvalResult | null;
      start: () => void; stop: () => void; step: (dt: number) => void;
      }
    - Purpose: Drive evaluation cadence and expose last snapshot for consumers not using fine-grained selectors.
  - useGraphOutputs – src/useGraphOutputs.ts
    - Signature: <T>(selector: Selector<T>, equalityFn?: (a: T, b: T) => boolean) => T
    - Purpose: Subscribe to derived slices from EvalResult using useSyncExternalStore; minimal re-renders.
  - useNodeOutput – src/useGraphOutputs.ts
    - Signature: (nodeId: string, key?: string) => PortSnapshot | undefined
    - Purpose: Convenience to read one port snapshot.
  - useNodeOutputs – src/useGraphOutputs.ts
    - Signature: (nodeId: string) => Record<string, PortSnapshot> | undefined
    - Purpose: Convenience to read all outputs for a node id.
  - useGraphInput – src/useGraphInput.ts
    - Signature: (path: string, value: ValueJSON | Value, shape?: ShapeJSON, opts?: { immediateEval?: boolean }) => void
    - Purpose: Stage inputs from controlled UI state.
  - value helpers (ported):
    - valueAsNumber, valueAsVec3, valueAsVector, valueAsBool – src/index.ts (or src/utils/value.ts)
- Modified functions:
  - N/A in legacy; legacy provider methods (setParam, stageInput, setTime) are reintroduced through context with consistent signatures and typing.
- Removed functions:
  - NodeGraphProvider, useNodeGraph (legacy)
    - Migration: Use GraphProvider and useGraphRuntime; selector hooks via useGraphOutputs/useNodeOutput.

[Classes]
No new classes beyond wasm Graph; the design centers on functional components and hooks.

- New classes: None
- Modified classes: None
- Removed classes: None

[Dependencies]
No new runtime dependencies; stay minimal and hook-based. Keep dev tooling as-is.

- Runtime:
  - react (peer) – already present
  - @vizij/node-graph-wasm – already present
- Dev:
  - vitest, @testing-library/react, jsdom, @types/react – already present
- Optional (not added in this implementation):
  - Zustand/Jotai for external stores; Worker support could come later as an alternative provider.

[Testing]
Create comprehensive unit tests for provider lifecycle, staging, playback modes, and selector hooks using mocks.

- Test files to add/modify (src/**tests**/):
  - graph-provider.test.tsx
    - Ensures init() called once, Graph constructed once, ready state toggles, loadGraph(normalized) called on initialSpec, cleanup cancels RAF/interval.
  - use-graph-input.test.ts
    - Stages inputs on value change; respects immediateEval flag; verifies evalAll triggered when immediate.
  - use-graph-outputs.test.ts
    - Selector hook re-renders only on derived changes; node output hooks update when matching nodeId’s ports change.
  - use-graph-playback.test.ts
    - RAF and interval modes tick Graph.step and publish snapshots; timecode mode sets absolute time then evals.
  - migrate existing node-graph-provider.test.tsx
    - Update to import { GraphProvider, useGraphRuntime, useGraphOutputs, useGraphInput } and validate parity with prior expectations (value helpers, writes clearing).
- Validation strategies:
  - Mock @vizij/node-graph-wasm Graph methods (init, Graph ctor, normalizeGraphSpec).
  - Assert minimal re-renders via render counts in selector tests.
  - Cover teardown (cancelAnimationFrame/clearInterval) to avoid leaks.

[Implementation Order]
Implement provider and store first, then hooks, finalize exports, and update tests in one refactor branch.

1. Scaffolding
   - Add new files: GraphContext.ts, utils/createGraphStore.ts, utils/normalizeSpec.ts, GraphProvider.tsx skeleton.
   - Create barrel src/index.ts with planned exports.
2. Provider core
   - Implement GraphProvider lifecycle: init(), Graph ref, loadGraph(normalized), setTime/step/setParam, staged input persistence, evalAll publishing, updateHz throttling.
   - Add playback loop strategies: "raf" and "interval"; define "manual" path; wire stepStrategy in props.
3. Store + selectors
   - Implement createGraphStore (subscribe/getSnapshot/setSnapshot) with versioning; wire provider to publish snapshots.
   - Implement useGraphOutputs with useSyncExternalStore and selector support; add useNodeOutput/useNodeOutputs.
4. Input hook
   - Implement useGraphInput; ensure it stages with optional shape; immediateEval option.
5. Instance hook
   - Implement useGraphInstance that supports normalized spec and reload on change; integrates with provider Graph or creates a local one (document local case).
6. Barrels and re-exports
   - Ensure src/index.ts re-exports all hooks, GraphProvider, value helpers, and WASM types.
   - Remove src/index.tsx monolith; update imports accordingly.
7. Tests
   - Update existing test to new API names; add new tests for playback, inputs, selectors.
8. Polish
   - Update package.json "sideEffects": false (optional), README (future), ensure types build (tsc).
   - Verify build: npm run build; ensure dist outputs d.ts and index.js
9. Breaking change summary
   - Document breaking API changes in CHANGELOG (future): NodeGraphProvider/useNodeGraph replaced by GraphProvider/useGraphRuntime and new hooks.
