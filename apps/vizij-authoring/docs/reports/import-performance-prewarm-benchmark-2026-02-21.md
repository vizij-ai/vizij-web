# Import Performance: Prewarm Benchmark

Date: 2026-02-21  
Scope: `apps/vizij-authoring` Quori import, `VITE_RUNTIME_PREWARM` off vs on  
Branch/worktree: `authoring-features` worktree

## Setup

1. App launched with `pnpm --dir .worktrees/authoring-features --filter vizij-authoring dev`.
2. Mode A (baseline): default env (`VITE_RUNTIME_PREWARM` unset).
3. Mode B (prewarm): `VITE_RUNTIME_PREWARM=true`.
4. Asset: in-app `Load Quori`.
5. Sample size: 5 runs per mode.
6. Per run flow: page reload -> `Load Quori` -> wait for `Import ready` -> read `window.__vizijImportPerfSummary`.

## Raw Results

### Prewarm OFF (5 runs)

| Run | durationMs | rootAssignedToReadyMs | readyToFirstFrameMs | rootToFirstFrameMs | rigNormalizeTotalMs | poseNormalizeTotalMs | graphBridgeAccepted/Attempts |
| --- | ---------: | --------------------: | ------------------: | -----------------: | ------------------: | -------------------: | ---------------------------- |
| 1   |   8433.065 |             25078.255 |               1.435 |          25079.690 |            5148.165 |             4476.585 | 13/17                        |
| 2   |   8813.390 |             25068.925 |               1.440 |          25070.365 |            5185.590 |             4807.430 | 13/17                        |
| 3   |   8941.385 |             25161.190 |               1.575 |          25162.765 |            5451.260 |             4811.675 | 13/17                        |
| 4   |   9019.580 |             25667.805 |               1.555 |          25669.360 |            5373.750 |             4978.585 | 13/17                        |
| 5   |   8537.980 |             24678.785 |               1.500 |          24680.285 |            5227.670 |             4651.595 | 13/17                        |

### Prewarm ON (5 runs)

| Run | durationMs | rootAssignedToReadyMs | readyToFirstFrameMs | rootToFirstFrameMs | rigNormalizeTotalMs | poseNormalizeTotalMs | graphBridgeAccepted/Attempts |
| --- | ---------: | --------------------: | ------------------: | -----------------: | ------------------: | -------------------: | ---------------------------- |
| 1   |   8603.180 |              6020.440 |           15498.165 |          21518.605 |            5135.745 |             4668.275 | 13/17                        |
| 2   |   8848.470 |              6273.620 |           15493.275 |          21766.895 |            5307.830 |             4796.275 | 13/17                        |
| 3   |   9006.405 |              6323.730 |           15745.145 |          22068.875 |            5417.645 |             4857.410 | 13/17                        |
| 4   |   8718.325 |              6237.235 |           14760.890 |          20998.125 |            5285.670 |             4754.575 | 13/17                        |
| 5   |   8206.830 |              5801.250 |           14604.955 |          20406.205 |            4872.345 |             4507.745 | 13/17                        |

## Aggregates

| Metric                |  OFF mean |   ON mean | Delta (ON-OFF) |
| --------------------- | --------: | --------: | -------------: |
| durationMs            |  8749.080 |  8676.642 |        -72.438 |
| rootAssignedToReadyMs | 25130.992 |  6131.255 |     -18999.737 |
| readyToFirstFrameMs   |     1.501 | 15220.486 |     +15218.985 |
| rootToFirstFrameMs    | 25132.493 | 21351.741 |      -3780.752 |
| rigNormalizeTotalMs   |  5277.287 |  5203.847 |        -73.440 |
| poseNormalizeTotalMs  |  4745.174 |  4716.856 |        -28.318 |

## Additional Churn Probe (3 runs each, patched register-count capture)

Goal: verify whether runtime registration churn changes between OFF/ON and whether it explains the lifecycle timing shift.

Method delta from baseline:

1. Same asset and flow (`Load Quori`).
2. Patched browser `console.log` in-run to count `[vizij-runtime] registerControllers` occurrences.
3. Captured `firstControllableFrameAtMs - startedAtMs` as `rootToControllableMs`.

### Raw Results (OFF, 3 runs)

| Run | durationMs | rootAssignedToReadyMs | readyToFirstFrameMs | rootToFirstFrameMs | rootToControllableMs | rigNormalizeTotalMs | poseNormalizeTotalMs | registerControllersCount |
| --- | ---------: | --------------------: | ------------------: | -----------------: | -------------------: | ------------------: | -------------------: | -----------------------: |
| 1   |   9883.495 |             27466.100 |               1.605 |          27467.705 |            26843.635 |            6084.970 |             5457.100 |                        1 |
| 2   |   9122.215 |             26260.520 |               1.995 |          26262.515 |            25665.485 |            5456.485 |             5064.455 |                        1 |
| 3   |   9703.605 |             24188.260 |            3274.665 |          27462.925 |            26850.195 |            5790.515 |             5311.305 |                        6 |

### Raw Results (ON, 3 runs)

| Run | durationMs | rootAssignedToReadyMs | readyToFirstFrameMs | rootToFirstFrameMs | rootToControllableMs | rigNormalizeTotalMs | poseNormalizeTotalMs | registerControllersCount |
| --- | ---------: | --------------------: | ------------------: | -----------------: | -------------------: | ------------------: | -------------------: | -----------------------: |
| 1   |   9972.040 |              7067.240 |           17182.875 |          24250.115 |            23611.690 |            6029.915 |             5409.645 |                       30 |
| 2   |   9300.050 |              6310.050 |           16044.185 |          22354.235 |            21767.770 |            5363.470 |             5025.130 |                       30 |
| 3   |   9138.230 |              6431.260 |           15505.595 |          21936.855 |            21361.305 |            5506.535 |             5107.765 |                       30 |

### Aggregates (Churn Probe)

Mean values:

| Metric                   |  OFF mean |   ON mean | Delta (ON-OFF) |
| ------------------------ | --------: | --------: | -------------: |
| durationMs               |  9569.772 |  9470.107 |        -99.665 |
| rootAssignedToReadyMs    | 25971.627 |  6602.850 |     -19368.777 |
| readyToFirstFrameMs      |  1092.755 | 16244.218 |     +15151.463 |
| rootToFirstFrameMs       | 27064.382 | 22847.068 |      -4217.313 |
| rootToControllableMs     | 26453.105 | 22246.922 |      -4206.183 |
| rigNormalizeTotalMs      |  5777.323 |  5633.307 |       -144.017 |
| poseNormalizeTotalMs     |  5277.620 |  5180.847 |        -96.773 |
| registerControllersCount |     2.667 |    30.000 |        +27.333 |

Median values (less sensitive to OFF outlier run with 6 registrations):

| Metric                   | OFF median | ON median | Delta (ON-OFF) |
| ------------------------ | ---------: | --------: | -------------: |
| durationMs               |   9703.605 |  9300.050 |       -403.555 |
| rootAssignedToReadyMs    |  26260.520 |  6431.260 |     -19829.260 |
| readyToFirstFrameMs      |      1.995 | 16044.185 |     +16042.190 |
| rootToFirstFrameMs       |  27462.925 | 22354.235 |      -5108.690 |
| rootToControllableMs     |  26843.635 | 21767.770 |      -5075.865 |
| rigNormalizeTotalMs      |   5790.515 |  5506.535 |       -283.980 |
| poseNormalizeTotalMs     |   5311.305 |  5107.765 |       -203.540 |
| registerControllersCount |          1 |        30 |            +29 |

## What We Can Say Confidently

1. Graph mutation behavior did not change in this benchmark (`13/17` accepted/attempts in all runs).
2. `durationMs`, `rigNormalizeTotalMs`, and `poseNormalizeTotalMs` are effectively unchanged (small noise-level deltas).
3. Prewarm dramatically shifts lifecycle timing:
   - `rootAssignedToReadyMs` becomes much smaller.
   - `readyToFirstFrameMs` becomes much larger.
4. Combined `rootToFirstFrameMs` improved by about 3.8s on this asset/machine.
5. In the churn probe, prewarm ON caused a very large increase in `registerControllers` invocations during one import (median `1 -> 30`), matching the large `readyToFirstFrameMs` expansion.

## Likely Explanation (Code-Level)

1. `VITE_RUNTIME_PREWARM=true` calls `prewarmVizijRuntime()` at app startup (`apps/vizij-authoring/src/App.tsx`).
2. `prewarmVizijRuntime()` warms orchestrator WASM ahead of provider mount (`packages/@vizij/runtime-react/src/prewarm.ts`).
3. `recordRuntimeReady()` is triggered as soon as runtime `ready` and `rootId` are true (`apps/vizij-authoring/src/components/app/Viewer.tsx`, `apps/vizij-authoring/src/perf/runtimePerfMetrics.ts`).
4. `recordRuntimeFirstFrame()` is measured on a subsequent `requestAnimationFrame` callback.
5. Runtime graph updates call `setGraphBundle(...)`, which plans `reregisterGraphs=true` for topology/pose mutations and increments `graphUpdateToken` (`packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`, `packages/@vizij/runtime-react/src/updatePolicy.ts`).
6. Registration effect runs when `ready && !status.loading` and depends on both `graphUpdateToken` and `registerControllers` callback identity (`packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`).
7. When prewarm makes `ready` true early, import still emits topology/pose updates; this opens a long window where repeated graph updates repeatedly trigger controller registration, increasing main-thread churn before first stable frame.
8. Result: prewarm moves `ready` earlier and can improve `root->first frame`, but also inflates `ready->first frame` due to registration churn unless re-registration is coalesced/staged.

## Correctness/Feasibility Assessment

1. Feasibility of prewarm itself: good (low implementation complexity, behind flag, no observed graph-publish regressions in this run set).
2. Correctness risk: medium, because codepaths that treat `ready` as fully-usable/painted state may now run too early.
3. Decision: keep prewarm default-off until we lock readiness semantics and add readiness smoke coverage.

## Next Investigations

1. Add an explicit `rootAssignedToFirstControllableFrameMs` metric and treat it as primary KPI for user-perceived readiness.
2. Add per-import runtime registration churn counters in app metrics (rather than browser console patching).
3. Audit `ready` consumers in `@vizij/runtime-react` and app code; gate interaction-critical behavior on first frame/controllable-frame where needed.
4. Add prewarm-on smoke test: after import, controls and poses respond within bounded frame count.
5. Repeat this benchmark on at least one additional large asset to validate whether the ~3.8s to ~5.1s `rootToFirstFrameMs` improvement generalizes.
