# Authoring Notes Synthesis

Last updated: 2026-02-11 (P1 follow-up in progress)

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

1. Inspector chain traversal exists, but terminology and action labels are still ambiguous for migration-heavy workflows (`what drives me` vs `what I drive`).
2. Rig inspector quick actions and list labeling still conflate variables and properties in ways that confuse authoring intent.
3. Quick-edit sections still have legacy-id edge cases where bindings can look valid in `BindingEditor` but inert in quick strips.
4. Pose binding modal state still overloads "No Parent Binding" (root variable vs broken mapping) and needs explicit state semantics.
5. Pose config import is still exact-id based and prunes legacy ids without path/source-id remap.
6. Full app validation remains green, but these are behavior/UX correctness gaps found in Quori smoke testing and tracked for immediate follow-up.

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
2. P1: inspector chain reliability and migration ergonomics (terminology, routing affordances, quick-edit fidelity, pose id remap/disambiguation).
3. P2: architecture/performance debt that blocks upcoming scene/material work.
4. P3: UX polish and deferred enhancements.

See `apps/vizij-authoring/docs/plans/BACKLOG.md` for concrete tasks mapped to this priority model.

See `apps/vizij-authoring/docs/notes/quori-smoke-findings-2026-02-11.md` for detailed smoke-test evidence and acceptance criteria.
