# Authoring Hot-Path Refactor Proposal (2026-02-24)

## Context

This pass removed low-risk redundant work in active authoring hot paths (variables, drivers, and pose controls). The items below are intentionally deferred because they require wider architectural changes and migration validation.

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
