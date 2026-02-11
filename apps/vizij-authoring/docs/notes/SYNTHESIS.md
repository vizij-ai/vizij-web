# Authoring Notes Synthesis

Last updated: 2026-02-11

This file consolidates active findings from:

1. `apps/vizij-authoring/docs/notes/audit.md`
2. `apps/vizij-authoring/docs/notes/pose_report.md`
3. `apps/vizij-authoring/docs/notes/review.md`

## Resolved Since Initial Reports

1. Runtime graph bundle updates now flow through `setGraphBundle` and bundle override logic in runtime-react.
2. Targeted regressions called out in `pose_report.md` are fixed:
   - `vizij-authoring` typecheck passes.
   - `Viewer` targeted tests pass.
   - runtime bundle helper tests pass with the split helper API.
3. Runtime provider update-policy test is green (`runtimeUpdatePolicy.test.ts`).

## Active Findings That Still Matter

1. Deep-review follow-ups (2026-02-11) reopened P0 correctness work:
   - graph clear/remove paths can retain stale runtime graph controllers.
   - runtime input staging may miss first-ready replay when runtime bridge initializes late.
   - pose graph export path can throw uncaught on build failures.
2. Import/remap migration ergonomics still need tightening:
   - face mismatch auto-resolution should be deterministic and strict (pure namespace rewrite only).
   - pose-output remap for legacy split-graph assets needs stronger confidence/conflict handling.
   - pose->rig->face diagnostics should offer directly actionable repair suggestions.
3. Broader validation coverage is still targeted rather than full-suite confidence.

## Architecture Debt (Still Relevant From Audit)

1. Continue slimming app shell orchestration and keep domain logic in slice stores.
2. Add store-level tests for graph runtime, binding authoring, and selection stores.
3. Improve heavy audit flows:
   - RobotData audit versioning/caching and optional worker offload.
   - Bundle audit queueing, chunking, and caching.
4. Replace JSON-only deep cloning in critical import/export paths with schema-aware clone behavior.
5. Modularize pose authoring internals further for testability and state isolation.
6. Define scene-editing command API before material/object editing work expands.
7. Replace bespoke virtualization in `StandardInputsSection` with maintained virtualizer primitives.

## Priority Interpretation

1. P0: correctness and behavior alignment for active runtime-truthful pipeline.
2. P1: integration hardening and test coverage expansion.
3. P2: architecture/performance debt that blocks upcoming scene/material work.
4. P3: UX polish and deferred enhancements.

See `apps/vizij-authoring/docs/plans/BACKLOG.md` for concrete tasks mapped to this priority model.
