# Authoring Notes Synthesis

Last updated: 2026-02-11 (P1 pose-authoring tranche planned)

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

1. Pose compiler currently uses a single global blend layer across all poses; target architecture requires two-layer blending (within-group and cross-group per rig target).
2. `pose.group` currently behaves mostly as metadata/path segment, not as a first-class computational group entity with own strategy.
3. Pose-to-rig relationship surfacing still implies direct pose-to-target bindings, while target model requires aggregate pose-layer outputs as binding sources.
4. Rig boundary enforcement is incomplete for the intended architecture where only low-level rig variables write animatables.
5. Import/remap grouping and strategy behavior are still implicit and need explicit controls for migration safety.
6. Full app validation remains green, but these are architecture/authoring correctness gaps tracked in the P1 pose-authoring spec.

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
2. P1: pose-authoring architecture correctness (first-class groups, two-layer blending, aggregate binding semantics, boundary enforcement, and aligned UI/diagnostics).
3. P2: architecture/performance debt that blocks upcoming scene/material work.
4. P3: UX polish and deferred enhancements.

See `apps/vizij-authoring/docs/plans/BACKLOG.md` for concrete tasks mapped to this priority model.
See `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md` for the concrete implementation spec and acceptance criteria.

See `apps/vizij-authoring/docs/notes/quori-smoke-findings-2026-02-11.md` for detailed smoke-test evidence and acceptance criteria.
