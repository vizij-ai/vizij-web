# Cross-Face Copy + Binding Test Workflow Proposal (2026-02-22)

## Goal

Create a repeatable test workflow that proves cross-face copy is correct for:

1. Variable copy (`variable-only` and `with-bindings`)
2. Pose copy (`pose-only` and `with-targets`)
3. Binding/target transfer from reference face to main face
4. Runtime registration (not just UI/store updates)

This proposal is aimed at catching the current failure mode where copied items appear in UI but do not fully drive runtime behavior.

## Fixtures

Use these fixture faces as the canonical matrix:

- `apps/vizij-authoring/public/assets/Face_Empty_Configured.glb`
- `apps/vizij-authoring/public/assets/Face_Legacy_RiggedPosed.glb`
- `apps/vizij-authoring/public/assets/Face_Latest_RiggedPosed.glb`

Recommended scenario baseline:

- Main face: `Face_Empty_Configured.glb`
- Reference face: `Face_Latest_RiggedPosed.glb`

Secondary compatibility scenario:

- Main face: `Face_Legacy_RiggedPosed.glb`
- Reference face: `Face_Latest_RiggedPosed.glb`

## Current Coverage and Gap

Current `VariablesPanel` tests already cover modal/conflict and mapping logic, but they are heavily mocked (`useBindingAuthoring`, `useReferenceFace`, `usePoseRig`) and do not verify runtime graph application.

Gap to close:

- We need tests that assert copied bindings are compiled into the main graph/runtime path and immediately active.

## Proposed Test Layers

## Layer 1: Copy Planner Unit Tests (fast, deterministic)

Extract copy planning logic from `VariablesPanel.tsx` into pure functions (for example:
`buildVariableBindingCopyPlan`, `mapReferencePoseValuesToMain`) under a dedicated module.

Add test file:

- `src/components/panels/__tests__/crossFaceCopyPlanner.test.ts`

Focus assertions:

- Binding remap uses main IDs for all resolved upstreams.
- Missing upstreams produce deterministic unresolved entries.
- `with-bindings` can create upstream variables when configured.
- Pose target remap in `with-targets` mode maps only valid channels.
- `pose-only` yields empty `values`.

Why this layer:

- Catches mapping regressions quickly without UI/runtime noise.

## Layer 2: Store + Panel Integration Tests (real stores, no function-level mocks)

Build integration tests that render the panel with actual provider stack and minimal fixture snapshots.

Add test file:

- `src/__tests__/crossFaceCopy.integration.test.tsx`

Focus assertions:

- After variable copy with bindings:
  - Main variable exists in `standardInputsById`.
  - `inputBindings[targetMainId]` exists and references expected upstream main IDs.
- After pose copy with targets:
  - Pose exists in pose rig store.
  - Pose values are remapped to main input IDs.
- Conflict/retarget modal choices mutate state as expected:
  - `Apply mapped` keeps mapped routes.
  - `Variable only`/`Pose only` strips copied logic.

Why this layer:

- Verifies wiring across panel actions + stores, not just isolated helper output.

## Layer 3: Runtime Registration Contract Tests

Add tests that explicitly assert the copy operation triggers main graph/runtime update path.

Add test file:

- `src/__tests__/crossFaceCopyRuntimeContracts.test.ts`

Focus assertions:

- Copy with bindings increments or updates graph payload route used by `Viewer` graph bridge.
- A runtime topology publish is produced when copied bindings change graph shape.
- No manual user nudge is required to activate copied relationships.

Suggested instrumentation:

- Add test-only debug snapshot helper (non-production) exposing:
  - effective input bindings
  - graph spec revision
  - last graph bridge mutation class

Why this layer:

- Ensures copied logic is not stranded in UI/store and is actually applied to runtime.

## Layer 4: Real-Asset Smoke (full import + copy)

Add one smoke workflow that loads real fixture faces and performs copy actions end-to-end.

Implementation options:

1. Preferred: browser automation (Playwright) added as a separate script.
2. Minimum fallback: app-level harness test using existing runtime test hooks if browser automation is deferred.

Proposed smoke cases:

1. Main empty + reference latest:
   - Copy all variables with bindings
   - Copy all poses with targets
   - Verify copied driven channels respond without manual edits
2. Main legacy + reference latest:
   - Copy all variables with bindings
   - Validate unresolved retarget modal appears where expected
   - Choose mapped-only path and verify no runtime dead state

Why this layer:

- This is the only layer that validates real fixture imports and user-visible behavior.

## Required Test Data/Helpers

Add fixture snapshot helpers to keep expected outputs explicit and reviewable:

- `src/__fixtures__/crossFaceCopy/`
  - `empty.main.snapshot.json`
  - `legacy.main.snapshot.json`
  - `latest.reference.snapshot.json`
  - `expected.copy.latest_to_empty.json`

Snapshot content should include:

- normalized input path -> id map
- reference input binding definitions
- reference pose values
- expected remap outcomes (resolved/unresolved)

## Execution Rules (for reliable CI)

Every copy-focused change should pass all of:

1. Planner tests
2. Integration tests
3. Runtime contract tests
4. Real-asset smoke (at least local/nightly if too heavy for per-commit CI)

If any layer fails, do not ship copy behavior changes.

## Proposed Commands

Short-term (after Layer 1-3):

```bash
pnpm --filter vizij-authoring test -- src/components/panels/__tests__/crossFaceCopyPlanner.test.ts
pnpm --filter vizij-authoring test -- src/__tests__/crossFaceCopy.integration.test.tsx
pnpm --filter vizij-authoring test -- src/__tests__/crossFaceCopyRuntimeContracts.test.ts
```

Full smoke (after Layer 4):

```bash
pnpm --filter vizij-authoring run test:copy-smoke
```

## Rollout Plan

1. Extract planner functions from `VariablesPanel` and land Layer 1 tests.
2. Add provider-backed integration tests (Layer 2) for variable/pose copy modes.
3. Add runtime contract instrumentation + assertions (Layer 3).
4. Add real-asset smoke path (Layer 4) against the three canonical face fixtures.

## Acceptance Criteria

We consider copy workflow reliable when:

1. Copying variables with bindings creates correct main bindings and they are runtime-active immediately.
2. Copying poses with targets correctly remaps available channels and reports unresolved channels deterministically.
3. No manual "add variable nudge" is required after copy for copied relationships to function.
4. The three fixture scenarios pass consistently across local runs.
