# vizij-authoring Pre-Phase Code Quality Audit

This audit documents systemic issues that will hinder the next phase of vizij-authoring (object/material authoring, Blender-style duplication, richer UI) and proposes concrete, architecture-focused remediations.

---

## 1. App Shell & `useRigController` Monolith

### Problem

- `App` now passes only identifiers + driver capture props into the animatable panel, and both the import/export + pose-rig workbenches fetch their own state. However, cross-workbench flows (file imports, audit kickoffs, wizard coordination) still live in `App` (`apps/vizij-authoring/src/App.tsx:200-360`). When those flows change we still have to touch the shell, so regression risk remains.
- `useRigController` used to be a 2,100-line hook owning every domain; after the latest work it no longer returns any state directly, but it still acts as the coordinator that syncs renderer/binding/selection data into the new stores.

### Proposal & Architecture Notes

1. **Keep logic in slice stores:** Ensure future domains (e.g., scene editing, pose rig IO) follow the same store/provider pattern so we never regress to a monolith.
2. **Add reducer-level tests:** Unit-test the new store logic (graph runtime, binding authoring, selection) so we can evolve them confidently.
3. **Continue slimming `App`:** Shift remaining props (graph state, selection commands, binding handlers) to the selector hooks where possible so the shell only passes down identifiers/context.

### Implementation Notes

- Introduced `GraphRuntimeStoreProvider`, `BindingAuthoringStoreProvider`, and `SelectionStoreProvider`, each with a selector-friendly hook (`useGraphRuntime`, `useBindingAuthoring`, `useSelectionStore`). Consumers now subscribe to the slices they need.
- `useRigController` just orchestrates: it feeds renderer data into the graph store, binding data/handlers into the binding store, and selection state into the selection store. Its public API is intentionally trimmed to avoid duplication.
- `AnimatableValuesPanel` now pulls graph/binding/selection data directly from the stores, so `App` only passes `namespace` plus optional driver-capture props.
- `ImportExportWorkbench` owns its `useAuthoringFileNames`, `useVizijExport`, audit runners, and include toggles; it reads graph/binding/selection slices itself and only receives loader-specific bits (`rootId`, `sourceName`, bundle handles).
- GLB and rig-graph import controllers also live inside `ImportExportWorkbench`, so asset loading and graph normalization no longer touch `App`.
- Introduced `PoseRigProvider`/`usePoseRig`, so pose workbenches and export flows share a single pose-rig state without a prop waterfall.
- `App` still handles the global file-import loops (GLB, graph, pose graph) and wizard entrypoints because they need loader + dialog context; those flows remain centralized.
- **Remaining tasks:**
  - _App-only flows_ – Extract the remaining cross-cutting controllers (graph import prompts, bundle diff helpers) into focused hooks so App limits itself to routing/layout.
  - _Store unit tests_ – Add Vitest suites for the new stores (graph runtime playback, binding mutations, selection focus handling).
  - _Auto-inputs & feature flags_ – Carve those domains into their own store/hooks for consistency.
  - _Controller maintenance_ – Keep `useRigController` limited to orchestration duties and move any new logic into dedicated stores/services immediately.

---

## 2. RobotData Audit Still Reprocesses Full Scenes on the Main Thread

### Problem

- `useRobotDataAuditRunner` now wraps the audit behind manual controls, but it still iterates every renderable on the main thread using `requestIdleCallback` batches. Large GLBs spend dozens of frames crunching through `createRobotDataAuditTask` even though only a few nodes changed (`apps/vizij-authoring/src/hooks/useRobotDataAuditRunner.ts:45-190`, `apps/vizij-authoring/src/utils/robotDataAudit.ts:270-357`).
- Audit results are marked stale only when the `world` or `animatables` object references change. `useVizijStore` mutates those objects in place (see `packages/@vizij/render/src/store.ts:333-386`), so upcoming scene-editing operations would never flip the stale flag even though RobotData no longer matches the mesh.
- There is no hashing or cache per node/material version, so rerunning the audit after a minor tweak still reprocesses every node, negating the progress tracker.

### Proposal & Architecture Notes

1. **Add scene versioning & hashing:** Track a monotonically increasing scene/version counter (or per-node hashes) so edits inside `useVizijStore` increment versions even when object references stay stable. Use those hashes both to set the stale flag and to skip unchanged nodes.
2. **Offload traversal to workers:** Move the heavy comparison loop to a Web Worker (or a capped pool) so the main thread stays responsive while long audits run. Keep the idle-batch fallback for environments without workers.
3. **Cache incremental results:** Persist per-node RobotData results keyed by `[nodeId, versionHash]` so the runner can resume from cached sections and surface “unchanged” rows immediately.

### Implementation Notes

- Refactored `auditRobotData` into an incremental task generator and added tests to ensure chunked execution matches the legacy synchronous result (`apps/vizij-authoring/src/utils/robotDataAudit.ts`, `apps/vizij-authoring/src/utils/robotDataAudit.test.ts`).
- Introduced `useRobotDataAuditRunner`, a cancellable controller that schedules batches via `requestIdleCallback`, tracks progress/state, and exposes run/cancel commands (`apps/vizij-authoring/src/hooks/useRobotDataAuditRunner.ts`).
- Updated `ImportExportWorkbench` and `RobotDataAuditPanel` so audits are triggered explicitly, show progress, and warn when results go stale (`apps/vizij-authoring/src/components/app/ImportExportWorkbench.tsx`, `apps/vizij-authoring/src/components/app/RobotDataAuditPanel.tsx`). `App` now consumes the runner hook and feeds its state into the panel.

---

## 3. Bundle Audit Recompiles Everything Serially

### Problem

- `useBundleAudit` auto-runs whenever the bundle or valid targets change, and `auditBundleGraphs` recompiles every IR graph sequentially, diffing specs and collecting outputs (`apps/vizij-authoring/src/hooks/useBundleAudit.ts:15`, `apps/vizij-authoring/src/utils/bundleAudit.ts:45`).
- Each audit clones payloads via JSON, normalizes specs, and diff-checks up to 400 entries, which already stalls the UI on big bundles and will worsen once we add per-material graphs or multiple faces.

### Proposal & Architecture Notes

1. **Adopt a work queue:** Convert `auditBundleGraphs` to return async iterators or chunked promises so the UI can render interim results (e.g., show audit rows as soon as each graph finishes).
2. **Parallelize compilation/diffs:** Use `Promise.allSettled` with a concurrency limiter or dispatch work to Web Workers, keeping the main thread free for UI interactions.
3. **Introduce caching:** Hash each graph’s `spec`/`ir`; reuse prior compiled specs and diffs when hashes match to avoid recomputation when toggling unrelated UI.
4. **Add audit controller API:** Panels should request audits explicitly (with stale indicators) rather than rely on `useEffect`, so heavy operations only run when the user intends to reconcile bundles.

---

## 4. JSON-Based Cloning Drops Critical Data

### Problem

- `cloneSerializable` uses `JSON.parse(JSON.stringify(...))` for deep copies (`apps/vizij-authoring/src/utils/serialization.ts:1`).
- This helper is used when overwriting bundle graphs, remapping outputs, and prepping imports (`apps/vizij-authoring/src/App.tsx:337-425`, `apps/vizij-authoring/src/utils/graphImport.ts:1-90`), which silently strips typed arrays, dates, Maps, and any future material/texture metadata we plan to surface.

### Proposal & Architecture Notes

1. **Implement schema-aware cloning:** Introduce a cloning utility that delegates to `structuredClone` when available and falls back to a traversal that preserves arrays, Maps, Sets, typed arrays, and `Date`s.
2. **Limit clone scope:** Instead of cloning entire bundles, clone only the fields that must be mutated (e.g., IR nodes or metadata objects) to reduce GC pressure.
3. **Back test with fixtures:** Add fixtures containing typed arrays/material parameters and write regression tests to ensure import/export pipelines preserve them.
4. **Document serialization guarantees:** Specify in the README/AGENT doc which data structures are safe to mutate so future material editors rely on stable behaviour.

---

## 5. Pose Rig Hook Lacks Modularity & Tests

### Problem

- `usePoseRigAuthoring` is a 1,006-line hook that combines pose CRUD, snapshot math, file-name heuristics, config parsing, and IO in a single closure (`apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts:1-1006`).
- We now have a React-based test harness for the hook plus a few shared hook tests (`apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.test.tsx`, `apps/vizij-authoring/src/hooks/__tests__/useDialogQueue.test.tsx`), but they spin up React DOM and cover only happy paths. Core math/persistence helpers (`apps/vizij-authoring/src/poseRig/persistence.ts`, `apps/vizij-authoring/src/poseRig/graphBuilder.ts`) still lack focused unit tests, and there is no reducer/store layer to exercise in isolation.
- As we add Blender-like duplication/deletion and material-aware poses, the hook’s state coupling will cause widespread re-renders and make bugs hard to isolate.

### Proposal & Architecture Notes

1. **Extract a Pose Rig store:** Move pose state into a reducer/Zustand slice that exposes commands (`createPose`, `captureFromSnapshot`, `applyConfig`). Keep React hooks thin selectors over this store.
2. **Separate IO adapters:** Parse/write pose configs and graph specs via standalone modules so they can be reused by future CLI or automation flows.
3. **Add neutral math utilities:** Export pure helpers for normalization/clamping so they can be unit-tested independently of React.
4. **Expand tests:** Cover pose CRUD, snapshot capture, config round-trips, and default naming to ensure regressions are caught before UI changes.

### Implementation Notes

- Added a Vitest harness for `usePoseRigAuthoring` that exercises pose CRUD, config import, and grouping flows, but it still relies on rendering the full hook and doesn’t give us unit-level coverage for the persistence/mutation helpers (`apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.test.tsx`).

---

## 6. Scene Editing APIs Are Read-Only

### Problem

- `useVizijAssetLoader` loads GLBs into the Vizij store but exposes no mutation surface beyond resetting the store (`apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts:4`).
- `Viewer` simply renders `<Vizij>` with a pointer-miss handler; there are no helpers for creating, duplicating, or editing nodes/materials (`apps/vizij-authoring/src/components/app/Viewer.tsx:1`).
- Upcoming features (object duplication, material editing) currently require reaching into renderer internals or Three.js refs, risking divergence across components.

### Proposal & Architecture Notes

1. **Design a `SceneComposer` API:** Build a domain service around `useVizijStore` that exposes commands like `createNode`, `duplicateSubtree`, `updateMaterial`, and `removeNode`, returning metadata for undo/redo.
2. **Add transaction history:** Wrap mutations in a command log (with IDs, timestamps, inverse ops) so UI panels can implement undo/redo and multi-step workflows safely.
3. **Expose capability hooks:** `Viewer` should obtain editing capabilities via context (e.g., `useSceneComposer`) instead of touching refs directly, enabling object/material editors to share a consistent contract.
4. **Validate via integration tests:** Once the API exists, add Vitest/integration coverage that loads a sample GLB, creates objects, edits materials, and verifies the bundle/export pipeline still works.

---

## 7. Custom Virtualization Adds Maintenance Burden

### Problem

- `StandardInputsSection` implements a custom virtualized list with manual height tracking, `ResizeObserver`, and scroll math spanning ~300 lines (`apps/vizij-authoring/src/components/animatable-panel/StandardInputsSection.tsx:2092`, `apps/vizij-authoring/src/components/animatable-panel/StandardInputsSection.tsx:2115`, `apps/vizij-authoring/src/components/animatable-panel/StandardInputsSection.tsx:2232`).
- Any change to input cards or new controls risks breaking virtualization, and debugging layout issues is already costly. Future UI for materials/objects will likely need similar virtualization, duplicating effort.

### Proposal & Architecture Notes

1. **Adopt a battle-tested virtualization lib:** Replace the bespoke implementation with `@tanstack/react-virtual` or `react-aria` virtualizer, delegating scroll/height logic to a maintained library.
2. **Refactor into reusable `VirtualList` component:** Abstract virtualization into a shared component that other panels (e.g., materials, object lists) can use, ensuring consistent behaviour and accessibility.
3. **Measure before/after performance:** Add profiling around large input sets to validate that the new virtualizer maintains or improves scroll FPS.
4. **Simplify card rendering:** Once virtualization is externalized, shrink `StandardInputsSection` to focus on business logic, easing future feature work.

---

## Summary

Addressing these issues will give us modular, testable foundations for the next authoring phase: scoped domain stores instead of monolithic hooks, intentional heavy-task runners, safe serialization, extensible scene-editing APIs, and maintainable UI infrastructure.

## Action Plan

1. Finish store adoption + tests: keep `useRigController` as a thin orchestrator, harden the new pose-rig provider,
   extract the remaining app-level controllers (graph import prompts, bundle overwrite helpers) into focused hooks,
   and add reducer-level tests for the graph runtime, binding authoring, and selection stores.
2. Harden RobotData auditing: Introduce scene/animatable versioning (hashes or counters) so edits flip the stale
   flag, move the audit traversal into a worker-backed queue with a capped concurrency, and cache per-node results
   keyed by version to avoid O(N) reruns.
3. Parallelize bundle audits: Convert auditBundleGraphs into an async iterator with concurrency limits, add caching
   by graph spec/IR hash, and expose an explicit “Run audit” command so heavy recomputes are user-driven.
4. Replace JSON cloning: Implement a schema-aware cloneSerializable (prefer structuredClone + fallbacks) and
   retrofit all import/export helpers plus the bundle overwrite/rename paths to use it; add fixtures proving typed
   arrays, Maps, Dates, etc., survive round-trips.
5. Modularize pose rig authoring: Extract a dedicated pose-store/reducer, move IO/persistence helpers out of the
   hook, and add unit tests that cover pose CRUD, group assignments, config import/export, and math utilities
   without booting React DOM.
6. Unlock scene editing: Design a SceneComposer service around useVizijStore with commands (create/duplicate/
   update/remove + undo history) and expose it through viewer/workbench hooks so upcoming object/material editors
   have a supported API.
7. Adopt shared virtualization: Swap the bespoke StandardInputsSection virtualization for a maintained library
   (e.g., @tanstack/react-virtual), wrap it in a reusable VirtualList, and migrate the inputs panel first to prove
   performance and API ergonomics.
