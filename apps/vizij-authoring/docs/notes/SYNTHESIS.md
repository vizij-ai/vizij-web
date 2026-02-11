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

1. Higher-level rig diagnostics can report "No Driven properties" even when behavior suggests real drive wiring; inspector/runtime mapping fidelity needs investigation.
2. Pose outputs expose driven-variable lists without sufficient detail/retarget controls, which blocks recovery for legacy-wired faces.
3. Face-element selection can show pose associations that do not appear to flow through to rig writes; end-to-end pose -> rig -> face tracing is missing.
4. Import review mismatch flow is still too manual; face-id rename should be auto-resolved where safe and order-only list permutations should not trigger mismatch friction.
5. `useRigController` reads `stageRuntimeInput` non-reactively from store state, which risks stale callback capture.
6. Graph playback actions exposed through graph runtime store are currently no-op while debug UI still surfaces controls.
7. `ExportDialog` accepts `onImportPoseGraph` prop but currently ignores it in favor of underscore-prefixed parameter.
8. `PoseGraphService.generateSummary` still throws and is not safe for future callers.
9. `exportGlb` validates `poseRig.poseGraphSpec` directly and may diverge from the recompute path (`buildSpec` with active blend mode) used by pose-graph export.
10. Broader validation coverage is narrow; current green checks are targeted rather than comprehensive for authoring behavior.

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
