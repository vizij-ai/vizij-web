# Authoring Audit Report

## Scope

This report audits `authoring-features` against base branch `vizij_workspace_as_authoring`.

Goals:

- Explain each finding in plain language.
- Show why it matters for stability, performance, and maintainability.
- Give concrete fix direction with expected impact.

Core fix already landed:

- `7ac2ada` simplified runtime input staging in `useRigController` and should be kept.

## How This Audit Was Done

- Compared branch diff against merge-base with `vizij_workspace_as_authoring`.
- Reviewed high-churn files first.
- Re-ran typecheck to verify current branch health.
- Prioritized findings by impact on:
  - shipping risk
  - runtime performance
  - React architecture quality
  - DRY/modularity

## Priority Summary

- `P0` Fix before more UX work:
  - Branch typecheck failures.
- `P1` High-value architectural/perf cleanup:
  - `VariablesPanel` rerender pressure and duplicate mounting pattern.
  - Canonical ID/path resolution hot paths.
- `P2` Correctness hardening and incremental perf:
  - transitive rig-boundary validation
  - shared-sync loop consolidation
  - trimming debug-time work

---

## 1) Branch currently fails TypeScript checks (`P0`)

### Context

The branch currently does not compile cleanly, which blocks confidence for further refactors and UX changes.

### What

`pnpm --filter vizij-authoring run typecheck` fails with multiple errors in changed files.

### Why it matters

- A red typecheck means we can accidentally ship regressions.
- It also hides new issues because signal is noisy.
- Team velocity drops when everyone works on a non-green baseline.

### Where

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:247`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:270`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:293`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:669`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:678`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:774`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:866`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:1358`
- `apps/vizij-authoring/src/layouts/WorkspaceLayout.tsx:77`
- `apps/vizij-authoring/src/poseRig/store.tsx:123`
- `apps/vizij-authoring/src/poseRig/store.tsx:525`
- `apps/vizij-authoring/src/poseRig/store.tsx:586`
- `apps/vizij-authoring/src/poseRig/store.tsx:630`
- `apps/vizij-authoring/src/poseRig/store.tsx:663`
- `apps/vizij-authoring/src/poseRig/store.tsx:714`
- `apps/vizij-authoring/src/poseRig/store.tsx:768`

### How to fix

- Tighten `VariablesPanel` union typing for `TreeNode.data` instead of broad casts.
- Fix `WorkspaceLayout` filter type predicate to match the filtered object shape.
- Normalize `null` vs `undefined` where `PoseConfigService.create` expects optional values.
- Guard nullable selected IDs before canonical resolver calls.

### Expected impact

- Restores a clean baseline for safe iteration.
- Reduces follow-up bug risk in all subsequent UX work.

---

## 2) `VariablesPanel` subscribes to the full binding store (`P1`)

### Context

A heavy panel should subscribe only to the state it needs.

### What

`VariablesPanel` currently uses a full-store selector:

- `useBindingAuthoring((state) => state)`

Any binding-store update can trigger a full panel rerender.

### Why it matters

- This panel does expensive tree building and filtering.
- Broad subscriptions amplify rerenders and make UI interactions feel slower.

### Where

- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:643`

### How to fix

- Split selectors by slice:
  - `managedStandardInputs`
  - `standardInputsByPath`
  - `standardInputsById`
  - `inputValues`
  - each handler function separately
- Use shallow compare where relevant.

### Expected impact

- Fewer unnecessary rerenders.
- Lower CPU during slider moves, selection changes, and animation playback.

---

## 3) Four `VariablesPanel` instances are mounted from `App` (`P1`)

### Context

Current layout decomposition uses multiple panel slots for variables/poses/inputs/pose-groups.

### What

`App` mounts `VariablesPanel` multiple times with different `availableSurfaces` and overrides.

### Why it matters

- Each instance runs its own hooks, memo trees, search logic, and store subscriptions.
- If multiple left sections are visible, work is duplicated.

### Where

- `apps/vizij-authoring/src/App.tsx:380`
- `apps/vizij-authoring/src/App.tsx:394`
- `apps/vizij-authoring/src/App.tsx:409`
- `apps/vizij-authoring/src/App.tsx:424`

### How to fix

- Prefer one `VariablesPanel` instance with a single active surface model.
- If multiple panes must coexist, extract shared data/model into a parent hook/context so expensive computations are done once.

### Expected impact

- Lower render/memory overhead.
- Cleaner architecture and less duplicated prop wiring.

---

## 4) Search filtering does full-tree work for multiple surfaces (`P1`)

### Context

Search should ideally process only the currently visible dataset.

### What

Three filtered trees are computed per search update:

- variables
- poses
- inputs

even though only one is displayed at a time.

### Why it matters

- Recursively cloning/filtering tree nodes is expensive.
- This cost scales with scene size and input count.

### Where

- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:1160`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:1164`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:1168`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:178`

### How to fix

- Compute filtered tree only for active surface.
- Keep per-surface memo cache keyed by `(surface, query, sourceTreeRevision)`.
- Avoid cloning entire branches when no change in subtree match state.

### Expected impact

- Faster typing in search.
- Less GC churn from tree object recreation.

---

## 5) Canonical ID resolver in utils is expensive in hot paths (`P1`)

### Context

`resolveStandardRigInputId` is now very flexible and alias-aware, but it does a lot of work per call.

### What

The function builds many candidate sets and scans maps repeatedly on each invocation.

### Why it matters

- Called frequently during binding evaluation and runtime path resolution.
- Cost multiplies with number of inputs and slots.

### Where

- `packages/@vizij/utils/src/rig/standard-inputs.ts:149`

### How to fix

- Build a canonicalization index once per `standardInputsById` revision:
  - alias/path candidate -> canonical input ID
- Use O(1) map lookup in hot paths.
- Keep current logic as one-time index-builder, not per-call resolver logic.

### Expected impact

- Significant CPU drop in graph build/evaluate paths.
- More predictable runtime performance as rigs grow.

---

## 6) Parent driver creation scans all inputs on each action (`P1`)

### Context

Creating a parent driver binding should be near-constant time for common cases.

### What

Code computes comparable target path, then loops `allStandardInputsRef` to find aliases on each action.

### Why it matters

- Linear scan per user action.
- Extra path normalization in loop.

### Where

- `apps/vizij-authoring/src/hooks/useBindingManager.ts:565`
- `apps/vizij-authoring/src/hooks/useBindingManager.ts:589`

### How to fix

- Maintain index:
  - `comparablePath -> Set<inputId>`
- Rebuild index when standard input set changes.
- Use index lookup instead of scanning all inputs in the action handler.

### Expected impact

- Snappier linking actions.
- Cleaner separation of preprocessing vs action-time logic.

---

## 7) Rig downstream traversal repeatedly canonicalizes IDs in loop (`P1`)

### Context

Dependency tracing should be linear for large graphs.

### What

`collectDownstreamRigInputIds` runs a while-loop over bindings and repeatedly calls canonical matching logic for each comparison.

### Why it matters

- Repeated canonicalization adds avoidable overhead.
- Can degrade quickly with large binding maps.

### Where

- `apps/vizij-authoring/src/components/inspector/rigConnections.ts:177`
- `apps/vizij-authoring/src/components/inspector/rigConnections.ts:190`
- `apps/vizij-authoring/src/components/inspector/rigConnections.ts:157`

### How to fix

- Precompute:
  - canonical selected rig ID once
  - canonical ID for each candidate input ID once per function call
- Use cached canonical IDs during traversal.

### Expected impact

- Faster inspector dependency calculations.
- Lower latency when selecting rig-linked controls.

---

## 8) Rig boundary enforcement only checks immediate source binding (`P2`, correctness)

### Context

Boundary rule is intended to block higher-order non-rig inputs from directly driving animatables.

### What

Current check allows/disallows based on immediate source binding inspection, not full transitive ancestry.

### Why it matters

- A valid chain can be misclassified if rig-element ancestry exists one level deeper.
- This can produce false fatal errors and confusing authoring behavior.

### Where

- `packages/@vizij/node-graph-authoring/src/graphBuilder.ts:123`
- `packages/@vizij/node-graph-authoring/src/graphBuilder.ts:229`

### How to fix

- Make `bindingReferencesRigElementInput` recursive over `inputBindings`.
- Add visited-set to prevent cycles.
- Stop at first rig-element/autorig ancestor found.

### Expected impact

- More correct boundary enforcement.
- Fewer false blocking errors for legitimate derived chains.

---

## 9) Shared variable sync uses multiple full pair passes (`P2`)

### Context

Shared sync is a useful feature, but current implementation performs several passes over the same pair set.

### What

Separate effects iterate `sharedPairsByPath` for:

- conflict cleanup
- main-side propagation
- reference-side propagation

### Why it matters

- Extra loop pressure every input update.
- Becomes costly as shared pair count grows.

### Where

- `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts:258`
- `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts:281`
- `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts:323`

### How to fix

- Consolidate into one pass per tick/update event.
- Keep a small sync state machine for each path.
- Batch state updates and conflict pruning.

### Expected impact

- Lower overhead during synced editing.
- Easier reasoning about race/conflict behavior.

---

## 10) Dev graph-summary logging still does repeated signature serialization (`P2`)

### Context

Helpful debug logging is good, but should stay cheap in frequent execution paths.

### What

A JSON signature object/string is rebuilt in `__DEV__` flow around graph updates.

### Why it matters

- In heavy editing sessions, this adds avoidable work.
- Not production-critical, but it affects local responsiveness.

### Where

- `apps/vizij-authoring/src/hooks/useRigController.ts:2032`

### How to fix

- Keep logging behind explicit trace flags (like your new trace gates).
- Use cheaper primitive signature or direct revision counter instead of `JSON.stringify`.

### Expected impact

- Better dev-time responsiveness.
- Less console/log overhead during iterative debugging.

---

## Recommended Execution Plan

1. Make the branch green:
   - fix all typecheck failures listed in item 1.
2. Remove highest rerender cost:
   - item 2, then item 4.
3. Reduce duplicated panel compute:
   - item 3 architecture adjustment.
4. Optimize canonicalization hotspots:
   - item 5, item 6, item 7.
5. Correctness hardening:
   - item 8.
6. Incremental polish:
   - item 9 and item 10.

## Keep/Protect

- Keep `7ac2ada` runtime staging simplification in `useRigController`.
- Keep reference-face equality guard improvements in `useReferenceFaceState`.
- Keep shared-sync feature direction; optimize its inner loops rather than removing it.
