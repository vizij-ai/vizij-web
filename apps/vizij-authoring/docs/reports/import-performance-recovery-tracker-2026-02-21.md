# Import Performance Recovery Tracker

Date: 2026-02-21  
Scope: `apps/vizij-authoring` face import + rig/pose runtime sync  
Branch: `authoring-features-restart`

Companion execution plan: `import-performance-implementation-plan-2026-02-21.md`
Follow-up architecture plan: `unified-face-import-pipeline-plan-2026-02-22.md`

## Purpose

This document is the working tracker for:

1. what we tried,
2. what failed,
3. what we now know for sure,
4. what we should do next (in safe, shippable steps).

## Current Bottom Line

We recovered correctness from earlier publish-coalescing regressions and have kept it stable.  
Post-`0a45887` reruns now hit sub-5s in both OFF and ON modes on Quori with stable behavior: OFF mean `4049.137ms` and ON mean `4450.918ms` (latest 3x sets, page reload per run).  
Prewarm ON still shifts time later in the pipeline (`rootAssignedToReadyMs` improves, but `readyToFirstFrameMs` increases), and OFF remains faster overall in this run set.  
Registration churn stayed bounded in low single digits (OFF `1`, ON `3`), and update coverage stayed stable (`graphBridgeAccepted/Attempts = 23/32`).  
Conclusion: keep payload-serialization caching and current staging behavior, keep prewarm default-off, and treat additional risky coalescing work as optional follow-up pending cross-asset validation.  
Pose-import wake-up note (latest smoke): explicit topology-refresh-only replacement did not fully hold; fallback structural nudge remains required unless a stronger settled-publication signal is proven.

## Timeline Of Attempts

| Commit                | Change                                                              | Outcome                                                                                                     |
| --------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `03015cb`             | Added import-to-render lifecycle instrumentation                    | Kept. Gave visibility into hidden runtime-ready delay.                                                      |
| `648390e`             | Coalesced pre-ready graph publishes + runtime diagnostics           | Faster, but controls broke.                                                                                 |
| `2a85933`             | Preserved queued pose updates during coalescing                     | Still function regressions.                                                                                 |
| `6f3d901` + `b3f5c76` | Reverted the two commits above                                      | Correctness restored.                                                                                       |
| `471880a`             | Deduped pre-ready publishes by mutation class                       | Faster again, controls still non-functional.                                                                |
| `803badc`             | Reverted dedupe commit                                              | Back to correct behavior baseline.                                                                          |
| `ff60a65`             | Added lifecycle metrics + progress UX + prewarm prototype           | Correctness preserved; better observability.                                                                |
| `bca8811`             | Added investigation/benchmark/roadmap docs                          | Execution clarity improved.                                                                                 |
| `e585e99`             | Added bounded registration queue + durable churn metrics            | Correctness preserved; churn reduced but still high.                                                        |
| `71d8ede`             | Added bounded-frame rig/pose import responsiveness smoke            | Correctness guardrails strengthened.                                                                        |
| `900152d`             | Split first-frame vs controllable-ready runtime semantics           | Gating semantics clarified across app/runtime.                                                              |
| `25aa9a5`             | Skipped re-registration for pose-config-only updates                | Churn reduced further; gap still present.                                                                   |
| `ae53ee1`             | Ignored graph reference-only churn in registration policy           | Large readiness/churn win; correctness checks green.                                                        |
| `WIP (2026-02-21)`    | Added pose-graph structural revision classification path            | Improved mutation classification but did not fully close Quori pose wake-up gap.                            |
| `WIP (2026-02-21)`    | Added temporary add/remove pose-variable post-import nudge          | Confirmed forced structural transition restores imported pose function in user smoke tests.                 |
| `edf5f64`             | Replaced nudge with explicit topology-refresh revision signal       | Targeted tests passed, but manual Quori smoke still required add-variable nudge.                            |
| `WIP (2026-02-21)`    | Added guarded explicit refresh + fallback nudge strategy            | Explicit refresh first; auto-fallback to structural nudge when pose publish never settles.                  |
| `WIP (2026-02-21)`    | Added runtime debug-event trace and refresh/registration probe      | Captures whether explicit refresh leads to topology publish/registration before fallback.                   |
| `WIP (2026-02-21)`    | Fixed refresh-probe false positive and restored deterministic nudge | User trace showed topology churn satisfied probe before forced-refresh publish landed.                      |
| `WIP (2026-02-21)`    | Hardened deterministic nudge with mutation-result telemetry         | Added versioned refresh events + robust fallback (`remove/readd existing input`) to avoid no-op nudge runs. |
| `WIP (2026-02-21)`    | Trimmed steady-state instrumentation overhead                       | Runtime debug-event capture is now opt-in; import progress now skips no-op rerenders while idle.            |

## What Failed

### 1) Suppressing runtime publishes before ready

- Intent: reduce churn and speed up time-to-ready by sending fewer topology/pose updates.
- Result: runtime did not receive required state transitions in the expected order.
- Symptom: controls/poses appeared loaded but did not drive the face correctly.

### 2) Over-optimizing lifecycle without a hard correctness contract

- We optimized publish volume first, before proving which publishes are mandatory for correctness.
- This made perf look better while silently dropping behavior-critical updates.

## What We Know Now

1. Latest Quori runs are now within target in both modes (3x mean: OFF `4049.137ms`, ON `4450.918ms`).
2. Root-to-ready is no longer the dominant bottleneck (`rootAssignedToReadyMs` means: OFF `3786.078ms`, ON `1794.187ms`).
3. Normalize work remains the largest consistent compute chunk (`rigNormalizeTotalMs` ~`923-992ms`, `poseNormalizeTotalMs` ~`1519-1579ms` means).
4. Publish suppression is not safe unless we preserve the exact lifecycle semantics needed by runtime/controller wiring.
5. Instrumentation is now good enough to guide targeted optimization instead of guessing.
6. Prewarm-on imports now show bounded registration churn (`3` runs/import mean in latest 3x), but still have a larger post-ready window than OFF (`readyToFirstFrameMs` ON `1595.768ms` vs OFF `14.798ms` mean).
7. Structural pose-graph updates need explicit runtime mutation classification; treating them as config-like pose updates can miss required registration transitions.
8. A deterministic post-import topology refresh signal is directionally correct but was not sufficient alone in manual Quori smoke; fallback structural transition remains required until sequencing is fully pinned down.
9. Added structured runtime debug events (`window.__vizijRuntimeDebugEvents`) to trace post-import refresh sequencing and whether fallback nudge was actually required.
10. User trace confirmed probe false-positive: pre-existing topology churn advanced counters before forced refresh applied, so nudge was skipped despite still being required for correctness.
11. New refresh payload versioning (`refreshVersion: "deterministic-nudge-v2"`) disambiguates stale probe builds from current deterministic path and reports whether nudge actually mutated structure.
12. Runtime debug-event capture is opt-in via `window.__vizijRuntimeDebugCaptureEnabled = true`; default steady-state authoring no longer pays debug cloning costs.

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

- Status: `[x]`
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
3. readiness split for first-frame vs controllable-ready app/runtime gates (`900152d`).
4. config-only churn cut in update policy (`25aa9a5`).
5. graph-reference-only churn cut in update policy (`ae53ee1`).

- Remaining:

1. validate low single-digit churn and sub-5 behavior on at least one additional large asset,
2. decide whether prewarm should remain opt-in after cross-asset validation,
3. keep import responsiveness smoke coverage current as lifecycle code evolves.

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

### Run 2026-02-22 17:58 (U0 baseline matrix, 5x OFF/ON for Quori + Hugo)

- Branch/commit: `authoring-features-restart` @ `c7d4cdd`
- Asset: Quori sample (`Load Quori`), Hugo sample (`Load Hugo`)
- Functional result: imports completed in all sampled runs; graph publish coverage stayed stable (`37` accepted updates per run).
- Method:
  - OFF server: `pnpm --filter vizij-authoring run dev --host 127.0.0.1 --port 4173`
  - ON server: `VITE_RUNTIME_PREWARM=true pnpm --filter vizij-authoring run dev --host 127.0.0.1 --port 4173`
  - Browser automation: Playwright click `Load Quori` / `Load Hugo`, then poll `getLastRuntimeImportPerfSummary()`.
  - Note: `rootToControllableMs` is not currently emitted in this summary shape; this run logs the currently emitted fields.

| Mode | Asset | Mean durationMs | Median durationMs | Mean rootAssignedToReadyMs | Mean readyToFirstFrameMs | Mean controllerRegistrationRuns | Mean graphBridgePublishes | Mean graphBridgeTopologyPublishes | Mean graphBridgePosePublishes | Mean graphBridgeAccepted/Attempts |
| ---- | ----- | --------------: | ----------------: | -------------------------: | -----------------------: | ------------------------------: | ------------------------: | --------------------------------: | ----------------------------: | --------------------------------- |
| OFF  | Quori |     `10049.951` |        `9986.220` |                 `5622.268` |                  `3.191` |                         `6.000` |                  `37.000` |                          `30.000` |                       `7.000` | `37.000 / 51.400`                 |
| OFF  | Hugo  |     `13119.026` |        `9051.025` |                 `6853.925` |                `101.341` |                         `6.000` |                  `37.000` |                          `30.000` |                       `7.000` | `37.000 / 52.000`                 |
| ON   | Quori |     `35044.743` |       `34847.715` |                 `7420.099` |               `7308.940` |                         `8.000` |                  `37.000` |                          `30.000` |                       `7.000` | `37.000 / 51.800`                 |
| ON   | Hugo  |     `32217.719` |       `31864.095` |                 `6404.530` |               `6852.844` |                         `8.000` |                  `37.000` |                          `30.000` |                       `7.000` | `37.000 / 51.800`                 |

Raw duration samples (`ms`):

- OFF Quori: `10173.380`, `9970.655`, `9731.835`, `9986.220`, `10387.665`
- OFF Hugo: `8891.280`, `8947.035`, `9051.025`, `19390.490`, `19315.300`
- ON Quori: `34847.715`, `36212.020`, `34860.610`, `34720.825`, `34582.545`
- ON Hugo: `31088.160`, `31864.095`, `34244.220`, `33127.460`, `30764.660`

Notes:

1. Prewarm ON regressed sharply versus OFF in this run set (roughly `3x` slower mean import duration) and increased controller registration runs (`6 -> 8`).
2. OFF Hugo has two large outlier runs (`~19.3s`), while median remains close to `9.1s`; this suggests a still-variable cold path worth rechecking in U7.
3. Current U0 decision: keep prewarm default-off, treat ON as experimental until U1-U7 stabilize and we can explain the additional long post-ready cost.

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

### Run 2026-02-21 22:33 (3x aggregate, post-C2/C3, prewarm OFF)

- Branch/commit: `authoring-features-restart` @ `25aa9a5`, `VITE_RUNTIME_PREWARM` unset.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `40053.000`
  - rigNormalizeTotalMs: `10263.470`
  - poseNormalizeTotalMs: `30665.253`
  - graphBridgePublishes: `32`
  - graphBridgeTopologyPublishes: `22`
  - graphBridgePosePublishes: `10`
  - rootAssignedToReadyMs: `39739.395`
  - readyToFirstFrameMs: `47.920`
  - rootToControllableMs: `39787.315`
  - controllerRegistrationRuns: `7.000`
  - controllerRegistrationTotalMs: `438.018`
- Notes: this run uses post-readiness-split semantics (`rootAssignedToReadyMs` now reflects a stricter controllable-ready gate), so absolute values are not directly comparable to pre-split sections without that caveat.
- Decision: keep as post-C2/C3 OFF baseline.

### Run 2026-02-21 22:36 (3x aggregate, post-C2/C3, prewarm ON)

- Branch/commit: `authoring-features-restart` @ `25aa9a5`, `VITE_RUNTIME_PREWARM=true`.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `41458.667`
  - rigNormalizeTotalMs: `10540.128`
  - poseNormalizeTotalMs: `31665.078`
  - graphBridgePublishes: `32`
  - graphBridgeTopologyPublishes: `22`
  - graphBridgePosePublishes: `10`
  - rootAssignedToReadyMs: `13372.130`
  - readyToFirstFrameMs: `17720.132`
  - rootToControllableMs: `31092.262`
  - controllerRegistrationRuns: `19.000`
  - controllerRegistrationTotalMs: `887.825`
- Notes: compared to post-C2/C3 OFF, ON improved root-to-controllable by ~`8.70s` mean and reduced ON churn vs post-B4 ON (`25 -> 19`), but still kept a large ready-to-first-frame inflation (~`+17.67s`) and elevated churn.
- Decision: prewarm remains default-off; continue staged churn reduction and registration-source isolation.

### Run 2026-02-20 23:07 (3x aggregate, post-`ae53ee1`, prewarm OFF)

- Branch/commit: `authoring-features-restart` @ `ae53ee1`, `VITE_RUNTIME_PREWARM` unset.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `20780.333`
  - rigNormalizeTotalMs: `5384.352`
  - poseNormalizeTotalMs: `16401.888`
  - graphBridgePublishes: `32`
  - graphBridgeTopologyPublishes: `22`
  - graphBridgePosePublishes: `10`
  - rootAssignedToReadyMs: `20662.333`
  - readyToFirstFrameMs: `4.525`
  - controllerRegistrationRuns: `2.000`
  - controllerRegistrationTotalMs: `72.013`
- Notes: versus post-C2/C3 OFF baseline, strict-path duration and readiness dropped sharply (`40053 -> 20780`, `39739 -> 20662`) while keeping mutation coverage (`graphBridgeAcceptedUpdates/Attempts = 32/43`).
- Decision: keep.

### Run 2026-02-20 23:03 (3x aggregate, post-`ae53ee1`, prewarm ON)

- Branch/commit: `authoring-features-restart` @ `ae53ee1`, `VITE_RUNTIME_PREWARM=true`.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `20162.333`
  - rigNormalizeTotalMs: `5487.008`
  - poseNormalizeTotalMs: `16099.952`
  - graphBridgePublishes: `32`
  - graphBridgeTopologyPublishes: `22`
  - graphBridgePosePublishes: `10`
  - rootAssignedToReadyMs: `6994.458`
  - readyToFirstFrameMs: `8543.208`
  - controllerRegistrationRuns: `4.000`
  - controllerRegistrationTotalMs: `64.213`
- Notes: compared to post-C2/C3 ON baseline, this cut duration (`41458 -> 20162`), cut churn (`19 -> 4`), and halved ready-to-first-frame (`17720 -> 8543`) while preserving the same update coverage (`32/43`).
- Decision: keep prewarm default-off for now; prewarm still shows a large post-ready stall despite better combined root-to-first-frame.

### Run 2026-02-21 23:55 (3x aggregate, payload-serialization cache candidate, prewarm OFF)

- Branch/commit: `authoring-features-restart` with uncommitted `packages/@vizij/runtime-react/src/updatePolicy.ts` payload cache.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses remained responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `7899.333`
  - rigNormalizeTotalMs: `1542.422`
  - poseNormalizeTotalMs: `5589.590`
  - graphBridgeAccepted/Attempts: `32/43`
  - rootAssignedToReadyMs: `6896.878`
  - readyToFirstFrameMs: `2.345`
  - controllerRegistrationRuns: `2.000`
- Notes: compared to immediate reverted OFF baseline (3x mean `39168.667`, runs `34191/41568/41747`), this is a large strict-path reduction without changing mutation coverage/churn class.
- Decision: keep and land with tests.

### Run 2026-02-21 23:58 (3x aggregate, payload-serialization cache candidate, prewarm ON)

- Branch/commit: `authoring-features-restart` with uncommitted `packages/@vizij/runtime-react/src/updatePolicy.ts` payload cache and `VITE_RUNTIME_PREWARM=true`.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses remained responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `8201.333`
  - rigNormalizeTotalMs: `1608.035`
  - poseNormalizeTotalMs: `5869.152`
  - graphBridgeAccepted/Attempts: `32/43`
  - rootAssignedToReadyMs: `2938.765`
  - readyToFirstFrameMs: `2942.675`
  - controllerRegistrationRuns: `4.000`
- Notes: compared to immediate reverted ON baseline (3x mean `29767.333`, runs `41126/25250/22926`), this is a large strict-path reduction while preserving expected ON churn profile.
- Decision: keep optimization; prewarm default remains off pending broader asset validation.

### Run 2026-02-21 00:58 (single-run confirmation, payload cache)

- Branch/commit: `authoring-features-restart` with uncommitted payload cache.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive.
- Key metrics:
  - OFF: `durationMs 6174`, `rootAssignedToReadyMs 5412.870`, `readyToFirstFrameMs 3.300`, `graphBridgeAccepted/Attempts 32/43`
  - ON: `durationMs 5432`, `rootAssignedToReadyMs 2192.045`, `readyToFirstFrameMs 1910.335`, `graphBridgeAccepted/Attempts 32/43`
- Notes: post-reapply sanity check after revert/reapply loop confirmed the same direction as 3x sets.
- Decision: keep.

### Run 2026-02-21 01:10 (3x aggregate, post-`0a45887`, prewarm OFF)

- Branch/commit: `authoring-features-restart` @ `0a45887`, `VITE_RUNTIME_PREWARM` unset.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `4049.137`
  - rigNormalizeTotalMs: `923.457`
  - poseNormalizeRuns: `5.000`
  - poseNormalizeTotalMs: `1519.492`
  - graphBridgeAccepted/Attempts: `23/32`
  - controllerRegistrationRuns: `1.000`
  - rootAssignedToReadyMs: `3786.078`
  - readyToFirstFrameMs: `14.798`
- Notes: first controlled 3x rerun after payload-cache landing (page reload between runs) confirms sub-5 user-visible import time in OFF mode.
- Decision: keep.

### Run 2026-02-21 01:12 (3x aggregate, post-`0a45887`, prewarm ON)

- Branch/commit: `authoring-features-restart` @ `0a45887`, `VITE_RUNTIME_PREWARM=true`.
- Asset: Quori sample (`Load Quori`).
- Functional result: import completed; controls/poses responsive in sampled runs.
- Key metrics (mean across 3):
  - durationMs: `4450.918`
  - rigNormalizeTotalMs: `992.072`
  - poseNormalizeRuns: `5.000`
  - poseNormalizeTotalMs: `1579.023`
  - graphBridgeAccepted/Attempts: `23/32`
  - controllerRegistrationRuns: `3.000`
  - rootAssignedToReadyMs: `1794.187`
  - readyToFirstFrameMs: `1595.768`
- Notes: ON remains under 5s but is slower than OFF due post-ready stall despite earlier ready signal.
- Decision: keep prewarm default-off and treat ON as optional experiment mode.

### Run 2026-02-22 18:11 (U3 contract validation, mutation semantics)

- Branch/commit: `authoring-features-restart` working tree (pre-commit U3)
- Asset: N/A (unit/integration contract pass)
- Functional result: graph-bridge mutation contract now resolves through one decision path (`publish` vs `skip`) and preserves required topology-removal transition.
- Validation:
  - `pnpm --filter vizij-authoring test -- src/components/app/runtimeGraphMutation.test.ts src/components/app/Viewer.test.tsx`
  - `pnpm --filter vizij-authoring typecheck`
- Notes:
  - Added explicit `empty-payload` skip only for initial empty publish / pose-only empty revisions.
  - Preserved topology publish when clearing rig/pose payload after prior publish to avoid stale runtime graphs.
  - Added ordering invariant coverage for `topology -> topology -> pose` sequence.
- Decision: keep.

### Run 2026-02-22 18:14 (U4 staged loading policy validation)

- Branch/commit: `authoring-features-restart` working tree (pre-commit U4)
- Asset: N/A (policy + UI contract pass)
- Functional result: main-face loading policy now explicitly stages `asset-load -> face-visible -> controls-ready`; side authoring panels lock until runtime input bridge is ready while viewport stays visible.
- Validation:
  - `pnpm --filter vizij-authoring test -- src/perf/mainFaceLoadingPolicy.test.ts src/perf/importProgress.test.ts src/components/app/Viewer.test.tsx src/__tests__/appRuntimeContracts.test.ts`
  - `pnpm --filter vizij-authoring typecheck`
- Notes:
  - Added deterministic `resolveMainFaceLoadingPolicy(...)` helper with direct unit coverage.
  - Added top-bar policy badge/detail and interaction gating wrappers for hierarchy/variables/animation/inspector panels.
  - Updated viewport runtime stage badge to communicate face-first/control-ready progression.
- Decision: keep.

### Run 2026-02-22 18:17 (U5 reference step throttling policy validation)

- Branch/commit: `authoring-features-restart` working tree (pre-commit U5)
- Asset: N/A (policy + runtime wiring pass)
- Functional result: reference runtime now keeps full stepping during import or input bursts, then drops to idle-throttled mode after inactivity to reduce dual-face steady-state work.
- Validation:
  - `pnpm --filter vizij-authoring test -- src/perf/referenceRuntimeSteppingPolicy.test.ts src/perf/mainFaceLoadingPolicy.test.ts src/components/app/Viewer.test.tsx`
  - `pnpm --filter vizij-authoring typecheck`
- Notes:
  - Added `resolveReferenceRuntimeSteppingPolicy(...)` with direct unit coverage.
  - `ReferenceFaceRuntime` now tracks activity windows (`burst` + loading keepalive) and maps policy output to runtime provider `autostart`/`driveOrchestrator`.
  - Reference header now exposes stepping policy state (`Active` vs `Idle throttled`) alongside FPS.
- Decision: keep.

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
8. Landed import responsiveness smoke coverage (`71d8ede`).
9. Landed readiness split (`900152d`) and config-only churn cut (`25aa9a5`).
10. Reran 3x OFF/ON post-C2/C3 benchmark; ON churn improved (`25 -> 19` in sampled runs) but prewarm still inflates ready-to-first-frame materially.
11. Landed graph-reference churn filter (`ae53ee1`) and reran 3x OFF/ON: churn dropped to low single digits (OFF `2`, ON `4`) with large strict-path readiness gains and no functional regressions in targeted tests.
12. Validated payload-serialization caching in runtime update policy (`packages/@vizij/runtime-react/src/updatePolicy.ts`) via reverted A/B runs plus targeted tests; observed large strict-path import-time reductions while preserving update coverage and responsiveness behavior.
13. Reran controlled 3x OFF/ON Quori benchmarks post-`0a45887` with page reload per run; both modes now meet sub-5s target (OFF `4049.137ms`, ON `4450.918ms`) while preserving functional correctness.
14. U0 baseline matrix rerun on `c7d4cdd` (5x OFF/ON on Quori + Hugo) shows prewarm-on now materially slower in this branch (`~32-35s` means) while publish coverage remains stable; baseline locked for U1-U7 execution.
15. U1 shared adapter extraction landed in working tree: both main viewer and reference runtime now dispatch inputs through one `useRuntimeInputDispatcher` hook, preserving existing path-resolution semantics while removing duplicated setInput bridge logic.
16. U1 validation pass: `pnpm --filter vizij-authoring test -- src/hooks/__tests__/useRuntimeInputDispatcher.test.tsx src/components/app/Viewer.test.tsx` and `pnpm --filter vizij-authoring typecheck` both green.
17. U2 landed face-scoped import-session telemetry (`main` + `reference`) in `runtimePerfMetrics`, added face-scoped progress snapshot access, and extended import-progress resolver/status to consume either scope with the same schema.
18. U2 wiring update: `ReferenceFaceRuntime` now starts/finalizes reference import sessions and records ready/first-frame lifecycle signals so the reference face emits comparable summaries without schema branching.
19. U2 validation pass: `pnpm --filter vizij-authoring test -- src/perf/runtimePerfMetrics.test.ts src/perf/importProgress.test.ts src/components/app/Viewer.test.tsx src/hooks/__tests__/useBundleSynchronizer.test.ts` and `pnpm --filter vizij-authoring typecheck` both green.
20. U3 normalized graph-bridge publish semantics behind one mutation decision helper (`publish` vs `skip`), added skip-reason telemetry, and expanded contract tests for empty-payload behavior plus `topology -> topology -> pose` ordering invariants; targeted tests + typecheck green.
21. U4 landed staged user-visible loading policy for the main face and policy-driven authoring-panel interaction gates, then validated with targeted policy/import/viewer/runtime-contract tests plus typecheck.
22. U5 introduced reference-runtime burst/idle stepping policy with explicit status surface and validated policy tests + targeted runtime/viewer regression tests + typecheck.
