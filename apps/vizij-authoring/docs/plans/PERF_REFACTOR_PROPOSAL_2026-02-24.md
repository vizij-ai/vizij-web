# Authoring Hot-Path Refactor Proposal (2026-02-24)

## Context

This pass removed low-risk redundant work in active authoring hot paths (variables, drivers, and pose controls). The items below are intentionally deferred because they require wider architectural changes and migration validation.

## Post-Tuning Snapshot (Same Day)

Additional low-risk tuning landed after the initial stabilization commit:

1. No-op direct input writes now short-circuit before state update + staging.
2. `VariablesPanel` now separates stable pose-group metadata from per-value row recomputation.

Measured with `VIZIJ_CAPTURE_PERF=1 vitest --run src/components/panels/VariablesPanel.perf.test.tsx --reporter=verbose` (3 runs before/after):

| Metric                             | Pre-Tuning Avg | Post-Tuning Avg |  Delta |
| ---------------------------------- | -------------: | --------------: | -----: |
| Interaction latency avg (ms)       |         26.487 |          24.287 |  -8.3% |
| Interaction latency p95 (ms)       |         77.621 |          72.100 |  -7.1% |
| Profiler totalActualDuration (ms)  |        142.119 |         126.440 | -11.0% |
| Profiler updateActualDuration (ms) |         77.245 |          69.527 | -10.0% |
| Profiler updateMaxDuration (ms)    |         16.653 |          14.839 | -10.9% |
| Profiler maxBaseDuration (ms)      |         47.291 |          40.534 | -14.3% |

Interpretation:

- We have meaningful local gains from pruning redundant work.
- Remaining wins now likely require architectural decomposition rather than micro-optimizations.

## Proposed Refactors

### 1. Split `useRigController` into focused runtime services

- Problem:
  - `useRigController` still combines graph compilation, runtime input routing/staging, persistence, and UI-facing authoring concerns.
  - This broad ownership makes optimization and correctness changes high-risk.
- Proposal:
  - Extract three modules:
    - `RigGraphCompileService` (pure compile + diagnostics projection),
    - `RuntimeInputRouteService` (route indexing + fallback resolution),
    - `RuntimeInputStagingService` (diffed/batched staging with bridge lifecycle).
  - Keep the hook as orchestration-only glue.
- Expected gain:
  - Lower rerender/effect churn pressure and clearer profiling boundaries.
  - Easier targeted profiling of input-route resolution vs staging vs compile cost.

### 2. Move pose authoring to explicit incremental projection pipeline

- Problem:
  - Pose updates still flow through full IR/config/graph rebuild paths on many mutation types.
  - We removed a duplicate compile, but topology-preserving edits still trigger full rebuilds.
- Proposal:
  - Introduce mutation classes:
    - value-only updates (no topology rebuild),
    - metadata updates (partial projection),
    - topology updates (full compile).
  - Add an explicit projection coordinator in `poseRig/services` so store actions dispatch intent, not compile policy.
- Expected gain:
  - Smoother slider/edit interactions for pose values and target tweaks on dense rigs.
  - Reduced compile pressure during frequent pose target/value edits.

### 3. Add runtime input staging transaction boundary

- Problem:
  - Runtime staging is still per-input imperative writes from multiple call sites.
  - We now prune no-op writes, but we still lack frame-level batching/flush control.
- Proposal:
  - Introduce a staging transaction queue:
    - collect pending input writes in-frame,
    - collapse by graph path,
    - flush once per runtime tick/bridge-ready phase.
- Expected gain:
  - Fewer bridge calls under bursty UI interaction and cleaner deterministic behavior during reconnects.

## Recommended Execution Order

1. `useRigController` split first (highest leverage, lowest semantic risk if boundaries are preserved).
2. Runtime staging transaction boundary second (build on the service split).
3. Pose incremental projection third (largest semantics surface, should land with dedicated fixtures and traces).

## Implementation Status (2026-02-24)

1. `useRigController` service split: implemented.
   - Added `rigController/rigGraphCompiler.ts`, `rigController/runtimeInputRoutes.ts`, and `rigController/runtimeInputStaging.ts`.
   - Hook now orchestrates service calls instead of owning the full logic inline.
2. Runtime input staging transaction boundary: implemented.
   - Direct input updates and state restage now queue by graph path and flush through a single staging effect.
3. Pose incremental projection: deferred.
   - A draft shortcut to skip `PoseIrService.toConfig` on pose-only edits was tested but removed because it can desynchronize config canonicalization from IR normalization.
   - This phase remains in proposal state pending a safe incremental projection coordinator in `poseRig/services`.

## Rollout / Guardrails

1. Land each refactor behind behavior-preserving contracts first, then perf gates.
2. Expand tests for:
   - variable + driver authoring live update parity,
   - pose target add/remove/edit + apply parity,
   - bridge reconnect + deterministic restage.
3. Keep a benchmark bundle:
   - Inputs pane perf baseline (existing),
   - pose slider drag workload,
   - mixed direct-control + pose-control workload.

## Quality Gates Needed Before Landing

1. Add perf contracts for:
   - pose slider drags (value-only),
   - variable/driver edit bursts,
   - runtime bridge reconnect restage.
2. Add call-count assertions for runtime staging and store notifications.
3. Run `pnpm --filter vizij-authoring run validate` and update perf snapshots in `docs/perf/`.

## Why Deferred In This Patch

- These changes touch core authoring and runtime orchestration boundaries.
- Shipping them alongside current bug-fix/perf-prune edits would increase regression risk for pose targeting, variable authoring, and driver mapping workflows.
