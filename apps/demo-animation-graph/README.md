# Demo: Animation × Node Graph

This app showcases the `@vizij/animation-react` and `@vizij/node-graph-react`
packages working together. Two interactive panels are included:

1. **URDF IK target** — Streams an animation target into a graph that embeds a
   `urdfikposition` node. Use the "URDF Loader & IK Controls" panel to upload a
   robot URDF, pick root/tip links, tweak solver parameters, and inspect the
   resolved joint record. A small sample (`vizij_three_link`) lives under
   `src/data/urdf-samples/keep-small-urdfs/` for quick experimentation.
2. **Slew + Damp visualiser** — Drives a noisy scalar track through `slew` and
   `damp` nodes. Live controls update `max_rate` and `half_life` via
   `runtime.setParam`, and plots stay aligned thanks to the synchronized series
   helper.

## Current Status & Gotchas

### Slew / Damp demo

- ✅ Works end-to-end using the stock `GraphProvider` props (`spec`, `autoStart`,
  `autoMode="raf"`).
- ✅ Uses `useGraphOutputs` selectors for plotting and `runtime.setParam` for the
  UI controls; this pattern is stable and a good reference for other scalar demos.

### IK demo (recommended setup and best practices)

- Summary: The animation → FK → IK pipeline works but requires explicit control
  over graph instantiation and initial parameter seeding because the WASM-backed
  node graph is heavyweight and constructed asynchronously.

- Load the graph manually after runtime.ready:
  - In this demo we call `await runtime.loadGraph(ikGraphSpec)` inside an
    effect once `runtime.ready` is true and then set a `graphLoaded` flag.
  - This avoids the race where `<GraphProvider spec={...} autoStart />` may begin
    its RAF loop before the WASM graph instance exists, which causes
    `[GraphProvider] evalTick: no graph loaded` warnings and null eval results.

- Use GraphProvider with `autoStart={false}` for heavy graphs:
  - Either omit `spec` or set `autoStart={false}`, then call `runtime.loadGraph(...)` manually.
  - After load completes you can call `runtime.evalAll()` and enable any periodic evaluation loop.
  - Keep `spec`+`autoStart` only for lightweight graphs where the WASM constructor is fast.

- Gate calls to `runtime.setParam`, `runtime.stageInput`, and `runtime.evalAll`:
  - Do not call `runtime.evalAll()` until `runtime.loadGraph(...)` has resolved.
  - The demo uses:
    - a `graphLoaded` boolean to indicate the loaded graph
    - a `seededRef` to ensure URDF / `root_link` / `tip_link` params are seeded exactly once
    - guards around staging inputs and eval calls so they only run once the graph exists.

- Seed FK and IK nodes consistently:
  - Seed both the `fk` and `ik_solver` node params with the same URDF, root
    link, and tip link (the demo copies the URDF into both nodes and seeds them
    once after load). This keeps the forward and inverse kinematics nodes in
    sync.
  - Validate seed and weight vector lengths against the URDF joint list before calling `runtime.evalAll()`; mismatches can prevent the solver from exposing joints.

- Stage inputs and evaluate in the correct order:
  - Stage the animation joint vector into the `joint_input` node each tick.
  - After staging, call `runtime.evalAll()` (or rely on a guarded RAF loop) so
    outputs (FK pos/rot and IK joint outputs) are updated and `useGraphOutputs`
    selectors observe fresh values.

- URDF size & parsing considerations:
  - The URDF panel enforces a ~1 MB limit (see `MAX_URDF_BYTES`) to avoid
    extremely large payloads. For large robot models, prefer a trimmed URDF or
    split examples into smaller fixtures.
  - The panel parses optional `weights` and `seed` text fields as comma/space
    separated numbers — invalid tokens will block load and surface an error.

- Solver parameters and performance:
  - Provide sensible `max_iters` and `tol_pos` defaults (the demo uses 128 and
    0.005). Tight tolerances or very high iteration counts increase CPU cost;
    test performance on target hardware and prefer conservative defaults for demos.

- Error handling and user feedback:
  - The `UrdfIkPanel` reports load/eval failures and exposes a success message
    showing how many joints the solver exposed. Use these messages to help
    diagnose invalid URDFs, incorrect root/tip names, or seed/weight length
    issues.

- Quick checklist to instantiate an IK-capable graph reliably:
  1. Wait for `runtime.ready`.
  2. Call `await runtime.loadGraph(yourSpec)` and set a `graphLoaded` flag.
  3. Seed params (URDF, `root_link`, `tip_link`, optional `weights`/`seed`) once.
  4. Stage live inputs (joint vectors / targets) each tick.
  5. After staging, call `runtime.evalAll()` (or enable a guarded RAF loop).
  6. Use `useGraphOutputs` to read FK/IK outputs, and guard selectors until
     `graphLoaded` to avoid reading null results.

- When to rely on `GraphProvider` wiring:
  - Prefer the Slew/Damp `spec` + `autoStart` pattern for simple, fast-to-construct graphs.
  - For FK/IK and other WASM-heavy graphs, prefer manual load + gated seeding as documented above.

## Development

```
npm install
npm run dev --workspace demo-animation-graph
```

The Vite dev server watches the local WASM packages; run
`npm run link:wasm` from `vizij-web/` to symlink the latest builds from
`vizij-rs/npm/`.

## Testing & Checks

- `npm run build --workspace demo-animation-graph` — Type-checks and builds the
  production bundle.
- WASM + npm sanity checks live in `vizij-rs/` (`cargo test -p vizij-graph-wasm`
  and `npm test --workspace @vizij/node-graph-wasm`).
