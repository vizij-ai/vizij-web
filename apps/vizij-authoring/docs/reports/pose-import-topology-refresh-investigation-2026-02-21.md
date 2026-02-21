# Pose Import Topology Refresh Investigation

Date: 2026-02-21  
Scope: `apps/vizij-authoring` pose import correctness after runtime-churn optimizations  
Branch: `authoring-features-restart`

## Executive Result

The add/remove variable nudge works because it forces a **topology-class runtime graph publish**, which forces controller re-registration in `@vizij/runtime-react`.

The previous fix (structural classification by pose-graph revision only) was directionally correct, but it was not sufficient for the failing path because it still depended on observed graph/spec deltas to produce a forced re-registration.

Implemented nudge-free fix: add an explicit `graphBridgeForceTopologyRevision` signal and bump it once after successful bundle pose import. This preserves pose data, avoids synthetic pose mutations, and uses explicit runtime intent.

## What Was Investigated

### 1. Import path and runtime publish path

Traced these paths end-to-end:

1. Bundle sync (`useBundleSynchronizer`) imports rig then pose config.
2. Pose state projection (`poseRig/store.tsx`) rebuilds pose graph spec from IR.
3. Pose runtime bridge (`PoseRigProvider`) publishes pose config/spec revisions to `graphRuntimeStore`.
4. Viewer bridge (`Viewer.tsx`) computes mutation class and calls `setGraphBundle(..., { tier: "graphs", mutationClass })`.
5. Runtime provider (`@vizij/runtime-react`) decides whether to re-register controllers.

### 2. Why add/remove variable nudge worked

`addPoseInput` / `removePoseInput` in `poseRig/store.tsx` drives `buildProjectedPoseIrPatch(...)`, which regenerates pose graph projection and triggers additional runtime graph publish activity.

In practice this introduces a guaranteed topology transition path that makes runtime re-register controllers again. Once that happens, imported poses become functional.

### 3. Why the previous attempt did not fully solve it

The prior structural-classification fix relies on observed revision/spec transitions being surfaced naturally. In the problematic path, that was not always enough to guarantee the final re-registration transition when needed.

Key point: the runtime ultimately needs one explicit, trusted topology refresh after successful pose import completion.

## Root-Cause Summary

The problem was **runtime re-registration intent** after pose import, not pose-data validity.

- The nudge solved it by indirectly forcing topology churn.
- A cleaner fix is to express that requirement directly: “after successful pose import, force one topology refresh publish.”

## Implemented Fix (No Pose Mutation Nudge)

### New explicit revision signal

Added `graphBridgeForceTopologyRevision` to `graphRuntimeStore` state and default values.

- File: `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`

### Runtime graph mutation contract update

Extended `RuntimeGraphBridgeRevisions` and classification logic so a bump in `graphBridgeForceTopologyRevision` yields `mutationClass: "topology"`.

- File: `apps/vizij-authoring/src/components/app/runtimeGraphMutation.ts`

### Viewer bridge wiring

`Viewer` now subscribes to `graphBridgeForceTopologyRevision` and includes it in revision comparison.

- File: `apps/vizij-authoring/src/components/app/Viewer.tsx`

### Post-import action (replaces add/remove nudge)

`App` now uses `onPostPoseImport` to bump `graphBridgeForceTopologyRevision` once after successful pose import.

- This does not mutate pose definitions/values.
- It explicitly requests topology refresh for runtime registration.

- File: `apps/vizij-authoring/src/App.tsx`

## Test Coverage Added/Updated

- `runtimeGraphMutation` tests updated for new revision field and explicit refresh behavior.
  - File: `apps/vizij-authoring/src/components/app/runtimeGraphMutation.test.ts`
- App runtime contract test updated to ensure `Viewer` is driven by the new revision selector.
  - File: `apps/vizij-authoring/src/__tests__/appRuntimeContracts.test.ts`

## Validation Run

Executed in `apps/vizij-authoring`:

1. `pnpm run lint`
2. `pnpm run typecheck`
3. `pnpm run validate`

Result: pass.

## Why This Is Better Than Add/Remove Variable Nudge

1. No mutation of user pose data.
2. Single explicit intent signal; easier to reason about and maintain.
3. Keeps runtime lifecycle semantics explicit in graph-bridge revision contract.
4. Avoids hidden side effects from temporary pose-input churn.

## Residual Risk / Follow-up

1. This intentionally forces one topology refresh after pose import; it is correctness-first and may carry small extra churn.
2. If we want further optimization, we should only reduce this once we have per-asset proof that the refresh is redundant.
3. Existing React warning in app boot (`setState in render`) is unrelated but should be tracked separately.
