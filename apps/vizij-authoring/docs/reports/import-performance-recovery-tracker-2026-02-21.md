# Import Performance Recovery Tracker

Date: 2026-02-21  
Scope: `apps/vizij-authoring` face import + rig/pose runtime sync  
Branch: `authoring-features-restart`

Companion execution plan: `import-performance-implementation-plan-2026-02-21.md`

## Purpose

This document is the working tracker for:

1. what we tried,
2. what failed,
3. what we now know for sure,
4. what we should do next (in safe, shippable steps).

## Current Bottom Line

We recovered correctness from earlier publish-coalescing regressions and have kept it stable.  
The new B4 runtime registration scheduler/metrics commit reduced prewarm churn (`30 -> 25` registrations/import), but not enough to close the large `readyToFirstFrameMs` gap.  
Conclusion: keep prewarm default-off and continue with staged, correctness-preserving runtime ingestion work.

## Timeline Of Attempts

| Commit                | Change                                                    | Outcome                                                |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `03015cb`             | Added import-to-render lifecycle instrumentation          | Kept. Gave visibility into hidden runtime-ready delay. |
| `648390e`             | Coalesced pre-ready graph publishes + runtime diagnostics | Faster, but controls broke.                            |
| `2a85933`             | Preserved queued pose updates during coalescing           | Still function regressions.                            |
| `6f3d901` + `b3f5c76` | Reverted the two commits above                            | Correctness restored.                                  |
| `471880a`             | Deduped pre-ready publishes by mutation class             | Faster again, controls still non-functional.           |
| `803badc`             | Reverted dedupe commit                                    | Back to correct behavior baseline.                     |
| `ff60a65`             | Added lifecycle metrics + progress UX + prewarm prototype | Correctness preserved; better observability.           |
| `bca8811`             | Added investigation/benchmark/roadmap docs                | Execution clarity improved.                            |
| `e585e99`             | Added bounded registration queue + durable churn metrics  | Correctness preserved; churn reduced but still high.   |

## What Failed

### 1) Suppressing runtime publishes before ready

- Intent: reduce churn and speed up time-to-ready by sending fewer topology/pose updates.
- Result: runtime did not receive required state transitions in the expected order.
- Symptom: controls/poses appeared loaded but did not drive the face correctly.

### 2) Over-optimizing lifecycle without a hard correctness contract

- We optimized publish volume first, before proving which publishes are mandatory for correctness.
- This made perf look better while silently dropping behavior-critical updates.

## What We Know Now

1. Import work itself is down substantially from earlier runs (from ~20s+ down to ~8-10s in many runs).
2. There is still a large hidden delay after root assignment before runtime is truly ready (`rootAssignedToReadyMs` often ~18-25s in problematic runs before fixes, and still non-trivial now).
3. Rig normalization and pose normalization are still major costs (`rigNormalizeTotalMs` and `poseNormalizeTotalMs` dominate import summary totals).
4. Publish suppression is not safe unless we preserve the exact lifecycle semantics needed by runtime/controller wiring.
5. Instrumentation is now good enough to guide targeted optimization instead of guessing.
6. Prewarm-on imports show a large runtime controller registration churn window after `ready` (see churn probe run blocks below), which likely explains the `readyToFirstFrameMs` expansion.

## Guardrails (Do Not Break)

1. Imported controls must immediately drive the face after load.
2. Pose sliders/playback must affect the face without user “nudge” actions.
3. No silent fallback that leaves stale runtime state without clear diagnostics.
4. Keep autorig passthrough behavior and existing binding semantics intact.

## Execution Plan (One Commit Per Step)

Status legend: `[ ]` not started, `[-]` in progress, `[x]` done

### Step 1: Add user-facing import progress UX (safe)

- Status: `[x]`
- Goal: reduce perceived wait time with explicit phase messaging.
- Deliver:

1. progress bar + phase labels in authoring UI,
2. phase text mapped to real pipeline checkpoints (asset load, rig import, rig normalize, pose normalize, runtime sync, ready),
3. no behavior changes.

- Exit criteria:

1. phases advance in expected order on large imports,
2. no changes to control/pose behavior.

### Step 2: Add stricter lifecycle diagnostics (safe)

- Status: `[x]`
- Goal: identify exact “hidden cost” segment between import success and usable runtime.
- Deliver:

1. counters for publish attempts vs accepted runtime updates,
2. timestamps for first/last topology publish, first pose publish, first controllable frame,
3. single consolidated per-import summary.

- Exit criteria:

1. we can attribute most remaining latency to named sub-phases,
2. no functional change.

### Step 3: Parallelize only independent warmups (low risk)

- Status: `[-]`
- Goal: remove idle waiting without suppressing graph/pose updates.
- Candidate work:

1. prewarm required WASM/runtime modules as soon as app session starts,
2. pre-initialize runtime provider resources before import graph payload is ready.

- Exit criteria:

1. no publish contract changes,
2. measurable reduction in time-to-first-usable-frame on cold start.

### Step 4: Reduce repeated heavy compute without changing semantics (medium risk)

- Status: `[ ]`
- Goal: keep exact lifecycle behavior but do less duplicate normalization/rebuild work.
- Candidate work:

1. memoized normalization reuse within one import session,
2. avoid redundant rig/pose normalization passes when payload signature is unchanged.

- Exit criteria:

1. lower `rigNormalizeTotalMs` / `poseNormalizeTotalMs`,
2. unchanged control/pose correctness.

### Step 5: Revisit publish coalescing only with correctness proofs (higher risk)

- Status: `[ ]`
- Goal: reduce churn safely by proving required transition set first.
- Deliver:

1. explicit mutation contract test coverage (topology vs pose vs value),
2. guard tests that fail if controls stop responding after import,
3. only then attempt minimal coalescing.

- Exit criteria:

1. all functional smoke tests pass,
2. perf improves without lifecycle regressions.

### Step 6: Bound runtime registration churn without dropping transitions (medium-high)

- Status: `[-]`
- Goal: keep required topology/pose transitions while avoiding repeated registration churn during import.
- Delivered so far:

1. bounded latest-token registration queue in runtime provider (`e585e99`),
2. durable per-import `controllerRegistrationRuns` + `controllerRegistrationTotalMs` metrics.

- Remaining:

1. reduce ON churn from `25` toward low single digits,
2. shrink `readyToFirstFrameMs` under prewarm ON without regressing controls/poses,
3. add import responsiveness smoke coverage for post-ready interaction correctness.

## Run Log (Fill Per Experiment)

Use one block per validation run.

```md
### Run YYYY-MM-DD HH:MM

- Branch/commit:
- Asset:
- Functional result: (controls work? poses work?)
- Key metrics:
  - durationMs:
  - rigNormalizeTotalMs:
  - poseNormalizeTotalMs:
  - graphBridgePublishes:
  - graphBridgeTopologyPublishes:
  - graphBridgePosePublishes:
  - rootAssignedToReadyMs:
  - readyToFirstFrameMs:
- Notes:
- Decision: keep / revise / revert
```

### Run 2026-02-21 19:35 (5x aggregate, prewarm OFF)

- Branch/commit: `authoring-features` worktree, prototype prewarm path present but disabled.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses remained responsive in sampled runs.
- Key metrics (mean across 5):
  - durationMs: `8749.080`
  - rigNormalizeTotalMs: `5277.287`
  - poseNormalizeTotalMs: `4745.174`
  - graphBridgePublishes: `13`
  - graphBridgeTopologyPublishes: `10`
  - graphBridgePosePublishes: `3`
  - rootAssignedToReadyMs: `25130.992`
  - readyToFirstFrameMs: `1.501`
- Notes: stable baseline counters; heavy time concentrated before runtime-ready signal.
- Decision: keep baseline evidence.

### Run 2026-02-21 19:39 (5x aggregate, prewarm ON)

- Branch/commit: `authoring-features` worktree with `VITE_RUNTIME_PREWARM=true`.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; graph publish counters unchanged.
- Key metrics (mean across 5):
  - durationMs: `8676.642`
  - rigNormalizeTotalMs: `5203.847`
  - poseNormalizeTotalMs: `4716.856`
  - graphBridgePublishes: `13`
  - graphBridgeTopologyPublishes: `10`
  - graphBridgePosePublishes: `3`
  - rootAssignedToReadyMs: `6131.255`
  - readyToFirstFrameMs: `15220.486`
- Notes: root-to-ready improved sharply, but ready-to-first-frame increased sharply; combined root-to-first-frame improved by ~3.8s mean. Detailed tables in `import-performance-prewarm-benchmark-2026-02-21.md`.
- Decision: revise before enabling by default; keep prewarm flag default-off pending readiness-contract clarification.

### Run 2026-02-21 20:49 (3x aggregate, churn probe, prewarm OFF)

- Branch/commit: `authoring-features` worktree, `VITE_RUNTIME_PREWARM` unset.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive.
- Key metrics (mean across 3):
  - durationMs: `9569.772`
  - rigNormalizeTotalMs: `5777.323`
  - poseNormalizeTotalMs: `5277.620`
  - graphBridgePublishes: `13`
  - graphBridgeTopologyPublishes: `10`
  - graphBridgePosePublishes: `3`
  - rootAssignedToReadyMs: `25971.627`
  - readyToFirstFrameMs: `1092.755` (skewed by one outlier run)
  - registerControllersCount: `2.667` (median `1`)
- Notes: most OFF runs had a single registration; one run spiked to `6` registrations and `readyToFirstFrameMs` rose to ~3.27s.
- Decision: keep as extended baseline evidence.

### Run 2026-02-21 20:55 (3x aggregate, churn probe, prewarm ON)

- Branch/commit: `authoring-features` worktree with `VITE_RUNTIME_PREWARM=true`.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `9470.107`
  - rigNormalizeTotalMs: `5633.307`
  - poseNormalizeTotalMs: `5180.847`
  - graphBridgePublishes: `13`
  - graphBridgeTopologyPublishes: `10`
  - graphBridgePosePublishes: `3`
  - rootAssignedToReadyMs: `6602.850`
  - readyToFirstFrameMs: `16244.218`
  - registerControllersCount: `30.000`
- Notes: compared to OFF churn probe medians, root-to-first-frame improved ~5.1s, but runtime registration churn increased drastically (`1 -> 30` median), matching the large post-ready stall.
- Decision: prewarm remains default-off until we coalesce/stage registration churn safely.

### Run 2026-02-21 21:32 (5x aggregate, post-B4, prewarm OFF)

- Branch/commit: `authoring-features-restart` @ `e585e99`, `VITE_RUNTIME_PREWARM` unset.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in all sampled runs.
- Key metrics (mean across 5):
  - durationMs: `9642.612`
  - rigNormalizeTotalMs: `5897.417`
  - poseNormalizeTotalMs: `5229.029`
  - graphBridgePublishes: `13`
  - graphBridgeTopologyPublishes: `10`
  - graphBridgePosePublishes: `3`
  - rootAssignedToReadyMs: `27473.484`
  - readyToFirstFrameMs: `1.865`
  - rootToControllableMs: `26846.144`
  - controllerRegistrationRuns: `1.000`
  - controllerRegistrationTotalMs: `131.682`
- Notes: OFF behavior remains stable with one registration/import and no responsiveness regressions.
- Decision: keep as post-B4 OFF baseline.

### Run 2026-02-21 21:37 (5x aggregate, post-B4, prewarm ON)

- Branch/commit: `authoring-features-restart` @ `e585e99`, `VITE_RUNTIME_PREWARM=true`.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 5):
  - durationMs: `9379.704`
  - rigNormalizeTotalMs: `5639.704`
  - poseNormalizeTotalMs: `5102.069`
  - graphBridgePublishes: `13`
  - graphBridgeTopologyPublishes: `10`
  - graphBridgePosePublishes: `3`
  - rootAssignedToReadyMs: `6635.189`
  - readyToFirstFrameMs: `16373.109`
  - rootToControllableMs: `22355.697`
  - controllerRegistrationRuns: `25.000`
  - controllerRegistrationTotalMs: `494.905`
- Notes: compared to post-B4 OFF, root-to-controllable improved by ~`4.49s` mean, but ready-to-first-frame remains inflated by ~`16.37s`; churn dropped from prior ON probe (`30 -> 25`) but is still high.
- Decision: keep prewarm default-off; continue step 6 staging/churn reduction work.

## Decision Rule Going Forward

If a change improves perf but breaks controls or poses, revert immediately and record the attempt here.  
We only keep optimizations that are both measurably faster and behaviorally correct.

## Progress Update (2026-02-21)

1. Completed safe instrumentation expansion and progress UX wiring (see companion plan update).
2. Added mutation-order guard tests before any future coalescing attempt.
3. Added default-off runtime prewarm prototype for controlled B1 cold-start experiments.
4. Added before/after Quori benchmark run blocks (5 runs each, prewarm off/on) with mean deltas.
5. Added churn probe runs with per-import `registerControllers` counting; confirmed prewarm creates heavy post-ready registration churn.
6. Landed B4 initial runtime registration queue + durable churn metrics (`e585e99`).
7. Reran 5x OFF/ON post-B4 benchmark set; ON churn improved (`30 -> 25`) but remains materially above OFF (`1`).
