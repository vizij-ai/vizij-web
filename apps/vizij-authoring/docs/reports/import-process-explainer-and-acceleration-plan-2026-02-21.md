# Import Process Explainer And Acceleration Plan

Date: 2026-02-21  
Scope: `apps/vizij-authoring` import path, runtime graph sync, perceived-load reduction target (`~20s -> 3-5s perceived`)

## Executive Summary

1. The import pipeline is mostly doing necessary work, but some heavy work is repeated too often during one import session.
2. The largest user-visible delay is not raw file load; it is runtime graph registration churn and main-thread contention after graph publishes begin.
3. UI readiness and runtime readiness are currently coupled more than needed. We can stage them separately without violating correctness.
4. Prior “pre-ready publish suppression/coalescing” attempts improved timings but broke behavior because they removed required mutation ordering.
5. Prewarm helps one segment (`rootAssignedToReadyMs`) but does not solve the dominant user-perceived stall by itself.

## What Was Tried And What Broke

From recent work and commit history (`03015cb`, `648390e`, `2a85933`, `6f3d901`, `b3f5c76`, `471880a`, `803badc`):

1. Added import/runtime instrumentation: kept, high value.
2. Coalesced/suppressed pre-ready graph publishes: reverted due control/pose regressions.
3. Retried dedupe by mutation class: reverted, still regressed behavior.
4. Conclusion: runtime publish ordering is correctness-critical and cannot be “optimized away” without explicit contract proofs.

### Commit-Level Orientation (Recent Sequence)

| Commit                            | Intent                                                            | Landed?  | Practical takeaway                                                             |
| --------------------------------- | ----------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------ |
| `03015cb`                         | Add import->render lifecycle instrumentation                      | Yes      | Keep: it exposed hidden runtime timing.                                        |
| `648390e`                         | Coalesce pre-ready publishes + diagnostics                        | Reverted | Faster metrics, but broke behavior.                                            |
| `2a85933`                         | Preserve queued pose updates in coalescing path                   | Reverted | Partial fix attempt did not recover correctness.                               |
| `b3f5c76` + `6f3d901`             | Revert coalescing path                                            | Yes      | Returned to known-correct mutation flow.                                       |
| `471880a`                         | Dedupe pre-ready publishes per mutation class                     | Reverted | Still not safe for control/pose correctness.                                   |
| `803badc`                         | Revert mutation-class dedupe                                      | Yes      | Current baseline for correctness work.                                         |
| `5934a02` + `6d361c0` + `4b2eaef` | Producer-revision updates + explicit mutation intent + guardrails | Yes      | Good foundation: stronger contracts and diagnostics before risky perf changes. |

## Ground-Truth Pipeline (Current Code)

1. Asset load + root assignment:
   `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts:34`
   `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts:58`

2. Bundle sync starts per fingerprint session:
   `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:199`
   `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:227`

3. Rig spec prepare/normalize (cached) + import:
   `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:98`
   `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:247`

4. Pose import deferred to the next pass after successful rig import:
   `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:292`

5. Rig rebuild + runtime spec resolve (IR preferred, legacy fallback):
   `apps/vizij-authoring/src/hooks/useRigController.ts:1402`
   `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:17`

6. Runtime graph bridge emits topology/pose mutations by revision:
   `apps/vizij-authoring/src/components/app/Viewer.tsx:111`
   `apps/vizij-authoring/src/components/app/runtimeGraphMutation.ts:27`

7. Runtime provider plans updates and can re-register graphs/controllers:
   `packages/@vizij/runtime-react/src/updatePolicy.ts:11`
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2078`
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:1610`
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:1413`

8. Lifecycle timing is recorded as root-assigned -> ready -> first-frame:
   `apps/vizij-authoring/src/perf/runtimePerfMetrics.ts:604`
   `apps/vizij-authoring/src/perf/runtimePerfMetrics.ts:629`
   `apps/vizij-authoring/src/perf/runtimePerfMetrics.ts:646`
   `apps/vizij-authoring/src/components/app/Viewer.tsx:175`

## Hard Requirements Vs Deferrable Work

### Required immediately for user perception

1. Face visible in viewport (asset world + root assignment).
2. Hierarchy tree and basic inspector structure.
3. Import status transparency (phase/progress), already added:
   `apps/vizij-authoring/src/perf/importProgress.ts:63`
   `apps/vizij-authoring/src/components/app/ImportProgressStatus.tsx:27`

### Required for controllable runtime

1. At least one valid rig graph topology publish reaching runtime.
2. Runtime controller registration aligned with that topology.
3. Input route map available for `stageRuntimeInput`.

### Can be deferred (without blocking first perceived success)

1. Full pose graph/config normalization and publish.
2. Non-critical post-import diagnostics and expensive reconciliation loops.
3. Some secondary synchronization passes that do not affect first controllable frame.

## Product Requirement Vs App-Structure Coupling

What the product minimally needs for perceived success:

1. Load face into scene and show it.
2. Provide at least one controllable input path quickly.
3. Continue enriching rig/pose features after initial interaction.

Where current app structure pulls extra work into critical path:

1. Eager provider stack mounts advanced systems even before first interaction (`RigControllerProvider`, `PoseRigProvider`, reference/sync providers):
   `apps/vizij-authoring/src/App.tsx:224`
2. `useBundleSynchronizer` auto-imports embedded rig/pose bundle payloads on load, even when user goal might only be “show face + basic controls”:
   `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:199`
3. Shared/reference sync paths can add extra work unrelated to first controllable frame in single-face flows:
   `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts:266`
4. Pose remap/import flows are correctness-critical for full fidelity, but can be staged after first controllable frame when not immediately required.

## Why Prior Coalescing Broke

1. Rig and pose updates are not interchangeable; mutation order is semantically meaningful.
2. Current bridge contract classifies revisions into `topology` then `pose` and publishes accordingly:
   `apps/vizij-authoring/src/components/app/runtimeGraphMutation.ts:27`
3. Bundle sync intentionally delays pose import one pass after rig import so pose normalization targets fresh standard inputs:
   `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:292`
4. Suppressing those transitions removed required runtime/controller state changes, which manifested as non-responsive controls.

## Fresh Benchmark: Prewarm OFF Vs ON (This Worktree)

Method:

1. Worktree: `.worktrees/authoring-features`.
2. Sample: in-app `Load Quori`.
3. 5 runs each mode, page reload between runs.
4. Metrics read from `window.__vizijImportPerfSummary`.

### Means (5 runs each)

| Metric                  |  OFF mean |   ON mean | Delta (ON-OFF) |
| ----------------------- | --------: | --------: | -------------: |
| `durationMs`            |  8882.121 |  9534.199 |       +652.078 |
| `rootAssignedToReadyMs` | 25996.557 |  6694.265 |     -19302.292 |
| `readyToFirstFrameMs`   |    16.814 | 17071.271 |     +17054.457 |
| `rootToFirstFrameMs`    | 26013.371 | 23765.536 |      -2247.835 |
| `rootToControllableMs`  | 25393.936 | 23091.068 |      -2302.868 |
| `rigNormalizeTotalMs`   |  5374.583 |  5685.592 |       +311.009 |
| `poseNormalizeTotalMs`  |  4829.071 |  5151.407 |       +322.336 |

Observed constant across all sampled runs:

1. `graphBridgeAcceptedUpdates/graphBridgePublishAttempts = 13/17`.

Interpretation:

1. Prewarm strongly shifts `ready` earlier but does not remove the heavy post-ready stall.
2. User-perceived “first controllable frame” improves ~2.3s, but total import duration did not improve in this sample set.
3. Prewarm is useful as a component, not a full solution. Keep default-off until readiness semantics are tightened.

### Churn Probe (Patched, 3 Runs Each)

Additional targeted run set added per-import `registerControllers` counting.

Mean deltas (`ON - OFF`):

1. `rootAssignedToReadyMs`: `-19368.777`.
2. `readyToFirstFrameMs`: `+15151.463`.
3. `rootToFirstFrameMs`: `-4217.313`.
4. `rootToControllableMs`: `-4206.183`.
5. `registerControllersCount`: `+27.333` (OFF mean `2.667`, ON mean `30.000`).

Median deltas (`ON - OFF`):

1. `rootToFirstFrameMs`: `-5108.690`.
2. `rootToControllableMs`: `-5075.865`.
3. `registerControllersCount`: `+29` (OFF median `1`, ON median `30`).

Interpretation:

1. Prewarm consistently improves combined time-to-first-frame/time-to-controllable.
2. Prewarm also opens a long post-ready window where runtime re-registers controllers repeatedly.
3. Registration churn, not normalize cost, is the dominant post-ready stall candidate.

### Root-Cause Hypothesis Backed By Code + Metrics

1. Runtime graph bridge emits multiple topology/pose updates during one import (`13` accepted updates in sampled runs).
2. `setGraphBundle(...)` converts topology/pose updates into plans with `reregisterGraphs=true` and bumps `graphUpdateToken`:
   `packages/@vizij/runtime-react/src/updatePolicy.ts:19`
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2109`
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2122`
3. Registration effect executes when `ready && !status.loading` and depends on `graphUpdateToken` and `registerControllers` callback identity:
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:1610`
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:1629`
4. When prewarm moves `ready` earlier, many in-import updates now happen in the “ready” window, so registration runs repeatedly while import is still converging.
5. This explains the observed pattern: lower `rootAssignedToReadyMs`, much higher `readyToFirstFrameMs`, modestly better combined `rootToFirstFrameMs`.

## Likely Bottlenecks (Ranked)

1. Repeated controller re-registration during a single import session; amplified when `ready` arrives early (`setGraphBundle` -> plan -> `graphUpdateToken` -> registration effect):
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2078`
   `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:1621`

2. Repeated rig build/resolve passes (`buildRigGraphSpec` + `resolveRuntimeGraphSpec`) while input/binding state is still converging:
   `apps/vizij-authoring/src/hooks/useRigController.ts:1402`

3. Pose graph normalization still runs as full normalize passes (queued, but still expensive):
   `apps/vizij-authoring/src/state/PoseRigProvider.tsx:266`

4. Global pair-scans in shared-variable sync can add ongoing main-thread pressure in dual-face flows:
   `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts:266`

## Confident Implementation Track (Safe To Do Next)

1. Add per-session counters for runtime registration churn (how many times `registerControllers` runs per import), and expose in summary.
2. Add “first usable controls” KPI as a first-class metric and use it as primary acceptance metric (not `ready` alone).
3. Keep current mutation ordering, but batch/queue topology-triggered re-registrations to one per animation frame or one per import epoch.
4. Split perceived-load staging in UI:
   - Phase A: scene visible + hierarchy interactive.
   - Phase B: controls interactive (rig runtime stable).
   - Phase C: pose library complete.
5. Add regression smoke tests that explicitly fail if controls/poses do not respond immediately after import.

## Investigation Track (Needs Proof Before Landing)

1. Workerization:
   - move `normalizeGraphSpec` and discrepancy diff/hash work off main thread.
   - preserve deterministic ordering and same import outcome semantics.
2. Runtime registration strategy:
   - evaluate incremental graph update path vs full re-register path for topology changes.
3. Signature-based caching for pose normalization and IR compile artifacts.
4. Readiness contract redesign:
   - define a distinct `controllable` state separate from `ready`.

## Proposed 2-Step Delivery Sequence

1. Stabilize and measure:
   - add registration-churn metrics + controllable KPI + guard tests.
2. Reduce churn safely:
   - implement epoch-based registration coalescing (without dropping required topology/pose transitions), then rerun benchmarks.

## Acceptance Criteria For “Perceived 3-5s”

1. Face visible + hierarchy responsive in <= 2s on reference assets.
2. First controllable frame in <= 5s on reference assets.
3. Full pose availability can complete later, but must not block stage-1/stage-2 interactivity.
4. No regressions against import compatibility contract:
   `apps/vizij-authoring/docs/references/import-compat-contract.md`
