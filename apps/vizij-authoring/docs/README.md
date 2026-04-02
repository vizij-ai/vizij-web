# Vizij Authoring Docs

Last updated: 2026-03-01

This folder is organized into active execution docs, active contracts, references, and archive history.

Cross-repo authoring status and strategic framing live in `../../../../vizij-docs/active_projects/authoring/summary.md`. This folder owns the local execution tracker, contracts, and implementation references.

## Execution Docs

1. `apps/vizij-authoring/docs/plans/ROADMAP.md`
   - Stage order and stage exit gates.
2. `apps/vizij-authoring/docs/plans/BACKLOG.md`
   - Active work backlog, grouped by semantic block and dependency order.
3. `apps/vizij-authoring/docs/plans/TRACKER.md`
   - Current execution status, risk notes, and validation evidence.
4. `apps/vizij-authoring/docs/plans/PLAYWRIGHT_E2E_STABILIZATION_PLAN_2026-03-05.md`
   - Active browser-regression stabilization plan for authoring smoke and workflow coverage.

## Active Contracts

1. `apps/vizij-authoring/docs/ARCHITECTURE.md`
   - System boundaries, compile/runtime invariants, and path/identity contracts.
2. `apps/vizij-authoring/docs/UI_DESIGN.md`
   - UI behavior contract for authoring workflows.
3. `apps/vizij-authoring/docs/Authoring_Blueprint.md`
   - Detailed layer and namespace contract.

## Active Notes and References

1. `apps/vizij-authoring/docs/notes/pose-rig-ir-design-2026-02-18.md`
   - Pose/group IR design and delivery intent.
2. `apps/vizij-authoring/docs/notes/SYNTHESIS.md`
   - Notes triage summary.
3. `apps/vizij-authoring/docs/pose_grouping_explainer.md`
   - Plain-English explanation of current pose grouping, blending, and composition behavior.
4. `apps/vizij-authoring/docs/references/ui-component-inventory.md`
   - UI component inventory for refactor planning.

## Archive

Historical material lives under:

1. `apps/vizij-authoring/docs/archive/plans/`
2. `apps/vizij-authoring/docs/archive/notes/`
3. `apps/vizij-authoring/docs/archive/reports/`

Archived docs are context only; active planning/execution should use the active docs listed above.

Recently archived:

1. `apps/vizij-authoring/docs/archive/plans/GOAL_2026-03-01.md`
2. `apps/vizij-authoring/docs/archive/plans/ANIMATION_ORCHESTRATOR_INTEGRATION_PLAN_2026-03-02.md`
3. `apps/vizij-authoring/docs/archive/plans/authoring-reference-face-implementation-plan_2026-03-01.md`
4. `apps/vizij-authoring/docs/archive/plans/POSE_CONTROL_COMPOSITION_PLAN_2026-02-19.md`
5. `apps/vizij-authoring/docs/archive/plans/POSE_GROUP_STAGE_INSPECTOR_SPRINT_PLAN_2026-02-26.md`
6. `apps/vizij-authoring/docs/archive/reports/quori-reference-face-playback-investigation-2026-03-01.md`

## Update Rules

1. Keep `ROADMAP.md`, `BACKLOG.md`, and `TRACKER.md` synchronized when priorities change.
2. If behavior changes, update `UI_DESIGN.md` and `ARCHITECTURE.md` in the same change.
3. Move superseded one-off planning docs into `docs/archive/`.
4. Record new validation evidence in `TRACKER.md`.
