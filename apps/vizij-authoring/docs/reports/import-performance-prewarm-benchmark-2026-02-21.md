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

## Post-B4 Rerun (Durable Churn Metrics, 2026-02-21)

Context:

1. Commit: `e585e99` (`feat(runtime): coalesce controller registration and track registration churn metrics`).
2. Churn measurement switched from console patching to durable summary fields:
   - `controllerRegistrationRuns`
   - `controllerRegistrationTotalMs`
3. Flow remained the same (`Load Quori`, 5 runs OFF and 5 runs ON).
4. This run set treats `rootToControllableMs` as the user-facing readiness KPI.

### Raw Results (Prewarm OFF, post-B4, 5 runs)

| Run | durationMs | rootAssignedToReadyMs | readyToFirstFrameMs | rootToControllableMs | controllerRegistrationRuns | controllerRegistrationTotalMs | rigNormalizeTotalMs | poseNormalizeTotalMs | graphBridgeAccepted/Attempts |
| --- | ---------: | --------------------: | ------------------: | -------------------: | -------------------------: | ----------------------------: | ------------------: | -------------------: | ---------------------------- |
| 1   |  10010.325 |             28759.615 |               1.775 |            28136.900 |                          1 |                       126.995 |            6207.710 |             5467.985 | 13/17                        |
| 2   |   9843.875 |             28435.895 |               2.525 |            27789.005 |                          1 |                       142.495 |            5983.355 |             5374.175 | 13/17                        |
| 3   |   9501.545 |             27013.620 |               1.770 |            26436.230 |                          1 |                       121.585 |            5893.335 |             5092.220 | 13/17                        |
| 4   |   9476.195 |             26628.195 |               1.560 |            25956.115 |                          1 |                       110.575 |            5751.530 |             5117.660 | 13/17                        |
| 5   |   9381.120 |             26530.095 |               1.695 |            25912.470 |                          1 |                       156.760 |            5651.155 |             5093.105 | 13/17                        |

### Raw Results (Prewarm ON, post-B4, 5 runs)

| Run | durationMs | rootAssignedToReadyMs | readyToFirstFrameMs | rootToControllableMs | controllerRegistrationRuns | controllerRegistrationTotalMs | rigNormalizeTotalMs | poseNormalizeTotalMs | graphBridgeAccepted/Attempts |
| --- | ---------: | --------------------: | ------------------: | -------------------: | -------------------------: | ----------------------------: | ------------------: | -------------------: | ---------------------------- |
| 1   |   9489.505 |              6621.980 |           16956.815 |            22967.190 |                         25 |                       513.810 |            5670.640 |             5159.920 | 13/17                        |
| 2   |   9125.335 |              6357.610 |           16399.595 |            22143.130 |                         25 |                       480.850 |            5430.295 |             4983.250 | 13/17                        |
| 3   |   9506.060 |              6666.895 |           16189.650 |            22215.925 |                         25 |                       467.350 |            5691.405 |             5140.940 | 13/17                        |
| 4   |   9491.025 |              6812.410 |           16401.050 |            22532.995 |                         25 |                       490.605 |            5768.690 |             5258.740 | 13/17                        |
| 5   |   9286.595 |              6717.050 |           15918.435 |            21919.245 |                         25 |                       521.910 |            5637.490 |             4967.495 | 13/17                        |

### Aggregates (Post-B4)

Mean values:

| Metric                        |  OFF mean |   ON mean | Delta (ON-OFF) |
| ----------------------------- | --------: | --------: | -------------: |
| durationMs                    |  9642.612 |  9379.704 |       -262.908 |
| rootAssignedToReadyMs         | 27473.484 |  6635.189 |     -20838.295 |
| readyToFirstFrameMs           |     1.865 | 16373.109 |     +16371.244 |
| rootToControllableMs          | 26846.144 | 22355.697 |      -4490.447 |
| controllerRegistrationRuns    |     1.000 |    25.000 |        +24.000 |
| controllerRegistrationTotalMs |   131.682 |   494.905 |       +363.223 |
| rigNormalizeTotalMs           |  5897.417 |  5639.704 |       -257.713 |
| poseNormalizeTotalMs          |  5229.029 |  5102.069 |       -126.960 |

Median values:

| Metric                        | OFF median | ON median | Delta (ON-OFF) |
| ----------------------------- | ---------: | --------: | -------------: |
| durationMs                    |   9501.545 |  9489.505 |        -12.040 |
| rootAssignedToReadyMs         |  27013.620 |  6666.895 |     -20346.725 |
| readyToFirstFrameMs           |      1.770 | 16399.595 |     +16397.825 |
| rootToControllableMs          |  26436.230 | 22215.925 |      -4220.305 |
| controllerRegistrationRuns    |      1.000 |    25.000 |        +24.000 |
| controllerRegistrationTotalMs |    126.995 |   490.605 |       +363.610 |
| rigNormalizeTotalMs           |   5893.335 |  5670.640 |       -222.695 |
| poseNormalizeTotalMs          |   5117.660 |  5140.940 |        +23.280 |

### Updated Interpretation

1. B4 reduced observed prewarm ON churn relative to the previous probe (`~30 -> 25` registrations/import), but ON churn remains far above OFF (`25 vs 1`).
2. Graph update acceptance is still stable (`13/17` in all post-B4 runs).
3. Prewarm ON still materially improves root-to-controllable time (`-4.49s` mean), but still inflates `readyToFirstFrameMs` by ~`+16.37s`.
4. Registration work itself increased by only ~`+363ms` mean (`controllerRegistrationTotalMs`), so the large ready-to-frame gap is not explained by registration CPU time alone.
5. Decision remains unchanged: keep prewarm default-off until readiness semantics and post-ready staging are tightened enough to avoid the large post-ready stall window.
