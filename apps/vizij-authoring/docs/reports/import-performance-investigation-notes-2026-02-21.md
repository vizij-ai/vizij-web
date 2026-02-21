# Import Performance Recovery: Investigation Notes

Date: 2026-02-21  
Scope: Track B investigations for `apps/vizij-authoring`
Companion benchmark: `import-performance-prewarm-benchmark-2026-02-21.md`

## B1 Runtime Prewarm Feasibility

### Findings

1. Runtime boot is gated by `rootId && bundle` mount in viewer (`apps/vizij-authoring/src/components/app/Viewer.tsx`).
2. Orchestrator WASM initialization is lazy and incurred on first runtime mount.
3. A standalone prewarm API is feasible without asset-root data.

### Actions Taken

1. Added `prewarmVizijRuntime()` to `@vizij/runtime-react` (`packages/@vizij/runtime-react/src/prewarm.ts`).
2. Exported API from package index (`packages/@vizij/runtime-react/src/index.ts`).
3. Added default-off app wiring behind `VITE_RUNTIME_PREWARM=1|true` (`apps/vizij-authoring/src/App.tsx`).
4. Added unit tests for dedupe/forwarding behavior (`packages/@vizij/runtime-react/src/__tests__/prewarm.test.ts`).
5. Ran 5x Quori import benchmarks with prewarm off and on; recorded raw runs and aggregates.

### Benchmark Summary

1. `durationMs`, `rigNormalizeTotalMs`, and `poseNormalizeTotalMs` showed only noise-level changes.
2. `rootAssignedToReadyMs` dropped sharply with prewarm, while `readyToFirstFrameMs` increased sharply.
3. Combined root-to-first-frame improved by ~3.8s mean in this run set.
4. Graph bridge counters remained stable (`13/17` accepted/attempts) across all runs.
5. Practical interpretation: prewarm is likely moving readiness earlier, but not equivalently improving first paint/controllable-frame timing.

### Churn Probe Addendum

1. Added 3x OFF + 3x ON run set with in-browser per-import counting of `[vizij-runtime] registerControllers`.
2. ON runs consistently showed `registerControllersCount = 30`; OFF median was `1` (mean `2.667` due one outlier run with `6`).
3. Despite churn, ON still improved combined root-to-first-frame/root-to-controllable by ~4.2s to ~5.1s depending on mean vs median comparison.
4. New interpretation: prewarm helps, but unlocks a long post-ready window where repeated registration churn consumes the gain.

### Code-Level Cause Candidate

1. Topology/pose mutations map to `reregisterGraphs=true` plans in runtime update policy.
2. `setGraphBundle` increments `graphUpdateToken` on those updates.
3. Controller registration effect runs when `ready && !loading` and depends on both `graphUpdateToken` and `registerControllers` callback identity.
4. When prewarm shifts `ready` earlier, import convergence still emits multiple updates, causing repeated registrations in the ready window.

### Remaining Work

1. Confirm readiness semantics with `@vizij/runtime-react` internals and ensure `ready` is not treated as first-paint-complete.
2. Add prewarm-on import smoke coverage asserting controls/poses are responsive immediately after import ready path.
3. Add/track a primary KPI for root-to-first-controllable-frame in addition to root-to-ready.
4. Add runtime summary field for registration-run count and use it as an optimization guardrail.

## B2 Pose Normalization Reuse

### Findings

1. Rig normalization already has cache reuse in bundle sync.
2. Pose normalization still runs per queued pose spec in `PoseRigProvider`.
3. Safe caching requires robust fingerprint + invalidation strategy to prevent stale pose graphs.

### Proposed Guardrails (Not Yet Implemented)

1. Cache key must include stable spec fingerprint, not object identity alone.
2. Error-path normalization must clear corresponding cached entries.
3. Runtime update semantics must remain unchanged: `poseRuntimeRevision` increments and runtime store updates still occur.

### Remaining Work

1. Implement cache helper behind a guarded path.
2. Add dedicated tests for cache-hit, cache-invalidation, and normalize-error behavior.

## B3 Publish-Coalescing Prerequisites

### Findings

1. Mutation-order regressions are the primary risk from coalescing.
2. We need tests that prove required transitions before dedupe attempts.

### Actions Taken

1. Added topology-dominance unit test when graph and pose revisions both change (`apps/vizij-authoring/src/components/app/runtimeGraphMutation.test.ts`).
2. Added viewer integration test for required topology->pose sequence when pose arrives after rig (`apps/vizij-authoring/src/components/app/Viewer.test.tsx`).
3. Added viewer integration test ensuring graph+pose revision bump still emits topology mutation (`apps/vizij-authoring/src/components/app/Viewer.test.tsx`).
4. Added runtime contract assertion that viewer remains revision-driven (`apps/vizij-authoring/src/__tests__/appRuntimeContracts.test.ts`).

### Remaining Work

1. Add import-level smoke tests that assert controls/poses remain responsive after full import lifecycle.
2. Attempt any coalescing only after those smoke tests are in place.
