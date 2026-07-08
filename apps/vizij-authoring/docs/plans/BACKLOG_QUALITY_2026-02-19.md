# Vizij Authoring Quality Backlog

Date: 2026-02-19  
Status legend: `[ ]` planned, `[~]` in progress, `[x]` done

This backlog is derived from `docs/reports/code-quality-review-2026-02-19.md` and is organized for parallel execution.

## Parallel Lanes

Lane A: correctness + compiler/import invariants  
Lane B: resilience + UX feedback paths  
Lane C: architecture + DRY + type safety + tests

## Wave 0 — User-Facing Correctness and Stability

### [ ] QL0.1 Replace discrepancy acceptance signature with content-hash identity

Lane: A  
Priority: P0  
Dependencies: none

Intent:

1. Ensure changed imports never bypass discrepancy review due to hash-length collisions.

Acceptance checks:

1. Acceptance key includes robust content identity (hash/canonical payload), not length-only signatures.
2. Regression test demonstrates prior collision case now re-opens review.

### [ ] QL0.2 Surface asset-load and sample-load failures in UI

Lane: B  
Priority: P0  
Dependencies: none

Intent:

1. Eliminate silent load failures during GLB upload and sample face loading.

Acceptance checks:

1. `useVizijAssetLoader` errors are visible in the app UI.
2. Sample button fetch failures show actionable error messages.

### [ ] QL0.3 Surface bundle synchronizer import failures beyond console

Lane: B  
Priority: P0  
Dependencies: none

Intent:

1. Make rig/pose import rejections from bundle synchronization explicit to users.

Acceptance checks:

1. Bundle import failure path emits user-visible alert/diagnostic state.
2. Failure state is recoverable (retry/import alternate asset).

### [ ] QL0.4 Stabilize `App` runtime bundle identity and reduce inert runtime subscriptions

Lane: C  
Priority: P0  
Dependencies: none

Intent:

1. Reduce avoidable rerenders/re-inits by memoizing runtime bundle and removing unused top-level subscriptions.

Acceptance checks:

1. `runtimeBundle` object is stable unless true bundle dependencies change.
2. Unused `useGraphRuntime` selectors are removed or localized.
3. Viewer runtime does not reinitialize on unrelated UI state changes.

### [ ] QL0.5 Resolve `poseGroupSegment` contract mismatch (implement or remove)

Lane: A  
Priority: P0  
Dependencies: none

Intent:

1. Align public compile API with actual behavior.

Acceptance checks:

1. Option is either wired into output path compile behavior with tests, or removed from API surface.
2. No silent no-op configuration options remain in pose graph build entry points.

## Wave 1 — Architecture, DRY, and Type Safety Hardening

### [ ] QL1.1 Split `useRigController` responsibilities by boundary

Lane: C  
Priority: P1  
Dependencies: QL0.4

Intent:

1. Separate UI selection/filter state from runtime graph orchestration.

Acceptance checks:

1. UI filter/selection state is managed in dedicated UI context/store.
2. Runtime controller focuses on graph/runtime concerns only.
3. Existing behavior and tests remain stable.

### [ ] QL1.2 Extract diagnostics/compile orchestration from UI panels

Lane: C  
Priority: P1  
Dependencies: none

Intent:

1. Move compiler/diff operations out of `DebugPanel` and `GraphDiagnosticsPanel`.

Acceptance checks:

1. Panels consume a service/hook API for compile/diff actions.
2. No direct heavy compile/diff domain logic remains in those components.

### [ ] QL1.3 Consolidate duplicated hierarchy tree logic

Lane: C  
Priority: P1  
Dependencies: none

Intent:

1. Remove drift risk between hierarchy panel implementations.

Acceptance checks:

1. Shared hook/component handles tree filter/selection/reparent behavior.
2. Both hierarchy surfaces use shared implementation.

### [ ] QL1.4 Consolidate standard-input merge logic in feature-spaces panels

Lane: C  
Priority: P1  
Dependencies: none

Intent:

1. Ensure one canonical merge/dedup contract across feature-spaces controls/channels panels.

Acceptance checks:

1. Shared merge utility introduced and reused.
2. Dedup strategy is deterministic and consistent across both panels.

### [ ] QL1.5 Replace `any` in scene feature entries with typed runtime contract

Lane: C  
Priority: P1  
Dependencies: none

Intent:

1. Eliminate weak feature contracts that bypass compiler guarantees.

Acceptance checks:

1. `featureEntries` uses concrete feature types (no `value: any`).
2. Downstream consumers compile without widening back to `any`.

### [ ] QL1.6 Remove `as any` constraint updates in material inspector

Lane: C  
Priority: P1  
Dependencies: none

Intent:

1. Make constraint editing type-safe and self-documenting.

Acceptance checks:

1. Constraint updates use typed helper objects.
2. No `as any` casts remain in the material constraint update path.

### [ ] QL1.7 Add type guards for runtime graph write payloads

Lane: C  
Priority: P1  
Dependencies: none

Intent:

1. Prevent unsafe `unknown -> any` conversion in graph runtime output application.

Acceptance checks:

1. Runtime result payload is narrowed via explicit type guards.
2. Invalid payload shapes fail gracefully and are diagnosable.

### [ ] QL1.8 Memoize shared variable sync context value

Lane: C  
Priority: P1  
Dependencies: QL0.4

Intent:

1. Reduce broad context invalidation and unnecessary panel rerenders.

Acceptance checks:

1. Context value identity is stable when underlying sync data is unchanged.
2. Variables/inspector panels do not rerender for unrelated app state changes.

## Wave 2 — Test Quality and Coverage Expansion

### [ ] QL2.1 Add behavior-level E4 policy scenario tests (`S1`-`S4`)

Lane: A  
Priority: P1  
Dependencies: QL0.5

Intent:

1. Validate actual output behavior for documented overlap scenarios.

Acceptance checks:

1. Tests assert channel outputs/contributions against documented scenario expectations.
2. Priority and fallback behavior are verified numerically, not only topologically.

### [ ] QL2.2 Replace brittle node-name assertions with behavior assertions where feasible

Lane: A  
Priority: P1  
Dependencies: QL2.1

Intent:

1. Reduce false negatives from internal node-id naming refactors.

Acceptance checks:

1. Critical tests assert semantic outputs/wiring behavior rather than fragile node-name strings.
2. Remaining topology tests justify strict node checks where required.

### [ ] QL2.3 Add interactive store workflow tests for override editing + diagnostics

Lane: C  
Priority: P1  
Dependencies: QL1.1

Intent:

1. Cover user-driven override edits and synchronization across store/IR/config.

Acceptance checks:

1. Store tests simulate override edits and verify projected IR/config consistency.
2. Diagnostics behavior is validated in overlapping-group cases.

### [ ] QL2.4 Add regression test for discrepancy acceptance collision bug

Lane: A  
Priority: P1  
Dependencies: QL0.1

Intent:

1. Prevent recurrence of signature-collision bypass.

Acceptance checks:

1. Test demonstrates equal-length changed graphs still trigger discrepancy review.

### [ ] QL2.5 Add resilience tests for user-visible load/import failure UX

Lane: B  
Priority: P1  
Dependencies: QL0.2, QL0.3

Intent:

1. Ensure error-visibility paths stay intact over refactors.

Acceptance checks:

1. Tests confirm alert/banner feedback for asset/sample/bundle import failure paths.

## Wave 3 — Ratchets and Documentation

### [ ] QL3.1 Add performance contract tests around `App` runtime bundle stability

Lane: C  
Priority: P2  
Dependencies: QL0.4

Intent:

1. Lock in no-regression guarantees for viewer/runtime rerender pressure points.

Acceptance checks:

1. Contract tests fail if bundle identity churn or inert subscription patterns are reintroduced.

### [ ] QL3.2 Tighten lint/type safety ratchet for reviewed modules

Lane: C  
Priority: P2  
Dependencies: QL1.5, QL1.6, QL1.7

Intent:

1. Prevent reintroduction of weak typing patterns in critical paths.

Acceptance checks:

1. Enforce no new `any`/unsafe casts in targeted modules via lint or codemod guardrails.

### [ ] QL3.3 Update architecture/docs for new boundaries and error-handling guarantees

Lane: C  
Priority: P2  
Dependencies: QL1.1, QL1.2, QL0.2, QL0.3

Intent:

1. Keep architecture and UX contracts synchronized with implementation.

Acceptance checks:

1. `ARCHITECTURE.md` and `UI_DESIGN.md` reflect new service boundaries and failure-surface expectations.

## Suggested Parallel Plan

Batch A (immediate): QL0.1, QL0.2, QL0.3, QL0.4, QL0.5  
Batch B (parallel after Batch A starts): QL1.3, QL1.4, QL1.5, QL1.6, QL1.7  
Batch C (after boundary split kickoff): QL1.1, QL1.2, QL1.8  
Batch D (test wave): QL2.1, QL2.2, QL2.3, QL2.4, QL2.5  
Batch E (ratchets/docs): QL3.1, QL3.2, QL3.3
