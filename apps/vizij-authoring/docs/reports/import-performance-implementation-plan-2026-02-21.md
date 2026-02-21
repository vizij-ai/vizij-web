# Import Performance Recovery: Implementation Plan

Date: 2026-02-21  
Scope: `apps/vizij-authoring` import pipeline + runtime sync  
Baseline branch/state: `authoring-features-restart` @ `803badc` (known-correct rollback)  
Companion tracker: `import-performance-recovery-tracker-2026-02-21.md`
Investigation notes: `import-performance-investigation-notes-2026-02-21.md`
Benchmark report: `import-performance-prewarm-benchmark-2026-02-21.md`

## Purpose

This document splits the recovery work into two tracks:

1. implementation we can do confidently now without changing lifecycle semantics,
2. work that needs investigation/proofs before we attempt optimization.

Primary rule: performance changes only land if controls/poses remain correct immediately after import.

## Execution Update (2026-02-21)

1. `A2` implemented:
   - Added explicit publish-attempt vs accepted-update counters.
   - Added per-import timing fields for first/last topology publish, first pose publish, and first controllable frame.
   - Added perf-session subscription APIs for UI/diagnostics consumption.
2. `A1` implemented:
   - Added import phase resolver + progress bar/status UI in top panel.
   - UI reads perf-session state and does not alter runtime mutation flow.
3. `B1` investigated and prototyped (default-off):
   - Added `prewarmVizijRuntime()` export in `@vizij/runtime-react`.
   - Wired optional app prewarm behind `VITE_RUNTIME_PREWARM=1|true`.
4. `B3` investigation translated into guard tests:
   - Added tests for topology-dominance when graph + pose revisions change together.
   - Added tests for required topology->pose transition ordering when pose arrives after rig.
5. `B2` investigation completed at design level:
   - Signature/invalidation strategy and stale-cache risks identified.
   - Caching implementation intentionally deferred pending dedicated invalidation tests.
6. `A3` implemented:
   - Added 5x repeated Quori runs for prewarm off and prewarm on.
   - Captured raw and aggregate evidence in `import-performance-prewarm-benchmark-2026-02-21.md`.
7. Added targeted churn probe:
   - Patched per-import counting for `[vizij-runtime] registerControllers`.
   - Confirmed large ON-vs-OFF churn increase (median `1 -> 30` registrations/import).
8. `B4` initial implementation landed:
   - Added bounded latest-token registration queue in runtime provider.
   - Added durable `controllerRegistrationRuns` / `controllerRegistrationTotalMs` into import summary.
9. `A3` rerun completed post-B4 with durable churn metrics:
   - 5x OFF + 5x ON Quori runs captured.
   - ON churn reduced from `30` to `25` registrations/import, but remains materially higher than OFF (`1`).
   - `readyToFirstFrameMs` remains high under prewarm ON; prewarm remains default-off.
10. Commit `71d8ede` landed import responsiveness smoke coverage:
    - bounded-frame rig-to-pose alignment test for `useBundleSynchronizer`.
11. Commit `900152d` split readiness semantics:
    - added `firstFrameReady` + `controllableReady` in runtime status and updated app gating/overlays.
12. Commit `25aa9a5` cut config-only re-registration churn:
    - update policy now ignores pose-config-only diffs for re-registration decisions.
13. Post-C2/C3 benchmark rerun (3x OFF + 3x ON) recorded:
    - ON still improves root-to-controllable timing (~`-8.70s` mean),
    - but still inflates ready-to-first-frame (~`+17.67s` mean),
    - controller registration churn improved vs post-B4 ON (`25 -> 19` in sampled runs) but remains elevated.

## Confidence Split

## Track A: Confident Implementation Now

These items are low-risk because they do not suppress or reorder runtime mutation publishes.

### A1) User-facing import progress UX (safe)

- Status: `[x]`
- Why this is safe:

1. Uses existing lifecycle instrumentation only.
2. Does not modify graph/pose publish behavior.

- Proposed implementation:

1. Add a lightweight phase model derived from existing checkpoints:
   - asset load start/end
   - rig import/normalize
   - pose normalize
   - runtime sync (bridge publishes)
   - runtime ready / first frame
2. Render progress UI in authoring app using that phase model.
3. Keep fallback behavior simple: if no active import session, hide progress UI.

- Likely touchpoints:

1. `apps/vizij-authoring/src/perf/runtimePerfMetrics.ts`
2. `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts`
3. `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts`
4. `apps/vizij-authoring/src/components/app/Viewer.tsx`

- Validation gates:

1. Progress phases advance in expected order on large imports.
2. No change in control/pose behavior.
3. Existing runtime contract tests remain green.

### A2) Stricter lifecycle diagnostics and per-run summary (safe)

- Status: `[x]`
- Why this is safe:

1. Instrumentation-only expansion.
2. No change to runtime mutation contract.

- Proposed implementation:

1. Add timestamps/counters for:
   - first topology publish
   - last topology publish
   - first pose publish
   - publish attempts vs accepted updates
2. Include these fields in one per-import summary object.
3. Make the summary easy to copy into the run log template.

- Likely touchpoints:

1. `apps/vizij-authoring/src/perf/runtimePerfMetrics.ts`
2. `apps/vizij-authoring/src/perf/runtimePerfMetrics.test.ts`
3. `apps/vizij-authoring/src/components/app/Viewer.tsx`
4. `apps/vizij-authoring/src/components/app/Viewer.test.tsx`

- Validation gates:

1. New metrics appear consistently in each import run.
2. Existing tests pass plus new assertions for added fields.

### A3) Baseline run discipline before risky work (safe)

- Status: `[x]`
- Why this is safe:

1. Process-only change.

- Proposed implementation:

1. Require at least 3 repeated imports per test asset before/after each optimization attempt.
2. Record both behavior and metrics in tracker run blocks.
3. Reject perf claims without run evidence.

- Validation gates:

1. Tracker includes filled run entries, not template-only placeholders.

## Track B: Investigate Further Before Implementation

These items are potentially valuable but carry correctness risk or architecture uncertainty.

### B1) Runtime/WASM prewarm (currently medium risk)

- Status: `[-]`
- Risk:

1. Current runtime provider mount is tied to loaded root/bundle.
2. Benchmark evidence shows `ready` can move much earlier than first frame; readiness semantics can drift.

- Investigation questions:

1. Can `@vizij/runtime-react` expose an explicit `prewarm()` path?
2. Can provider init occur before root assignment without side effects?
3. What is the cold-start delta in `rootAssignedToReadyMs` after prewarm?
4. Does prewarm improve root-to-first-controllable-frame, not only root-to-ready?

- Expected spike deliverable:

1. Small design note with one recommended prewarm approach and failure modes.
2. Prototype behind a default-off flag.

- Go/no-go criteria:

1. No mutation ordering regressions.
2. Measurable cold-start improvement.
3. Registration churn stays bounded (target: low single digits per import, not dozens).

### B4) Registration churn control in runtime provider (medium-high risk)

- Status: `[-]`
- Risk:

1. Naive coalescing can drop behavior-critical transition ordering.
2. Registration scheduling changes touch correctness-critical runtime lifecycle.

- Investigation questions:

1. Can registration be coalesced to latest graph token while preserving required topology/pose semantics?
2. Can we prevent duplicate registrations caused by callback-identity re-triggers?
3. Can we bound registration to one in-flight execution + one pending token?

- Implemented in `e585e99`:

1. latest-token queue (`createLatestTokenQueue`) with one in-flight run and coalesced pending token,
2. runtime effect wiring that avoids callback-identity-triggered re-registration loops,
3. durable import-summary fields for registration churn.

- Observed outcome:

1. prewarm ON registration churn decreased (`30 -> 25` runs/import in benchmark medians),
2. `readyToFirstFrameMs` is still materially inflated under prewarm ON,
3. additional staging/gating work is still required.

- Expected spike deliverable:

1. Design note for a token/epoch-based registration scheduler with explicit invariants.
2. Instrumentation field in import summary: registration runs per import session.
3. Before/after benchmark evidence with prewarm ON.

- Go/no-go criteria:

1. No control/pose regressions in smoke tests.
2. `readyToFirstFrameMs` drops materially in prewarm ON runs.
3. `rootToFirstControllableFrameMs` improves or remains neutral.

### B2) Pose normalization reuse (medium risk)

- Status: `[-]`
- Risk:

1. Rig normalization already has cache reuse; pose normalization may still recompute.
2. Cache invalidation errors could produce stale pose behavior.

- Investigation questions:

1. What stable signature can safely represent pose graph/config identity?
2. Which edits must always bypass cache?
3. Can we prove equivalence between cached and recomputed normalized output?

- Expected spike deliverable:

1. Signature strategy + invalidation matrix.
2. Test plan for stale-cache regression detection.

- Go/no-go criteria:

1. `poseNormalizeTotalMs` decreases.
2. Pose sliders/playback remain immediately responsive.

### B3) Publish coalescing/deduping re-attempt (high risk)

- Status: `[-]`
- Risk:

1. Previous attempts broke control/pose behavior.
2. Mutation ordering semantics are correctness-critical.

- Investigation questions:

1. Which transition sequence is mandatory for runtime/controller wiring?
2. Which publish events are truly redundant vs required?
3. Can coalescing be limited to proven-safe windows only?

- Expected spike deliverable:

1. Explicit mutation contract tests (topology vs pose vs value transitions).
2. Functional smoke tests that fail on non-responsive controls after import.

- Go/no-go criteria:

1. Contract and smoke tests pass.
2. Perf gain is measurable and repeatable.

## Recommended Execution Order

1. B4 first:
   - add durable runtime registration-churn metrics (in-app, not console patching),
   - implement bounded registration scheduling (single in-flight + latest pending token),
   - rerun prewarm ON benchmark.
2. B1 second:
   - keep prewarm default-off while validating churn-controlled runtime behavior,
   - re-evaluate default-on viability after B4 evidence.
3. B2 third:
   - implement guarded pose-normalization caching with explicit invalidation tests.
4. B3 last:
   - only after import-level smoke tests prove mutation-order correctness under full import lifecycle.

## Definition Of Done Per Optimization PR

1. Functional correctness:
   - controls drive face immediately after import,
   - pose sliders/playback work without manual nudges.
2. Evidence:
   - tracker run log entries include before/after metrics,
   - at least 3 repeated runs on representative assets.
3. Validation:
   - `pnpm --filter vizij-authoring run test` passes,
   - targeted tests covering touched lifecycle/perf code paths pass.
4. Rollback rule:
   - any control/pose regression => immediate revert and tracker entry.

## Next Commit Candidates

1. Commit 1: add import-level responsiveness smoke tests (done in `71d8ede`).
2. Commit 2: separate runtime-ready vs frame/controllable-ready gating (done in `900152d`).
3. Commit 3: reduce config-only graph churn/re-registration (done in `25aa9a5`).
4. Commit 4: isolate remaining OFF/ON registration churn sources and add targeted guard tests around expected registration counts.
5. Commit 5: prototype guarded pose-normalization cache + invalidation matrix tests.
6. Commit 6: worker-feasibility spike for expensive normalization/IR preparation paths.
