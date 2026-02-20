# Vizij Authoring Docs

Last updated: 2026-02-20

This folder is organized into active execution docs, active contracts, references, and archive history.

## Start Here

1. `apps/vizij-authoring/docs/guidebook/README.md`
   - Onboarding reading order and navigation through the docs.
2. `apps/vizij-authoring/docs/guidebook/CODEBASE_MAP.md`
   - Source directory ownership map and primary data flows.
3. `apps/vizij-authoring/docs/guidebook/WORKFLOW_AND_VALIDATION.md`
   - Day-to-day workflow and required validation gates.
4. `apps/vizij-authoring/docs/guidebook/MODULARITY_AND_DRY_OPPORTUNITIES.md`
   - Concrete modularity/DRY refactor backlog with file-level targets.

## Active Execution Docs

1. `apps/vizij-authoring/docs/plans/GOAL.md`
   - Program mission and release-level outcomes.
2. `apps/vizij-authoring/docs/plans/ROADMAP.md`
   - Stage order and stage exit gates.
3. `apps/vizij-authoring/docs/plans/BACKLOG.md`
   - Active work backlog, grouped by semantic block and dependency order.
4. `apps/vizij-authoring/docs/plans/TRACKER.md`
   - Current execution status, risk notes, and validation evidence.
5. `apps/vizij-authoring/docs/plans/POSE_CONTROL_COMPOSITION_PLAN.md`
   - Commit-sized execution plan and progress log for direct+pose channel composition alignment.

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
3. `apps/vizij-authoring/docs/references/ui-component-inventory.md`
   - UI component inventory for refactor planning.

## Archive

Historical material lives under:

1. `apps/vizij-authoring/docs/archive/plans/`
2. `apps/vizij-authoring/docs/archive/notes/`
3. `apps/vizij-authoring/docs/archive/reports/`

Archived docs are context only; active planning/execution should use the active docs listed above.

## Update Rules

1. Keep `ROADMAP.md`, `BACKLOG.md`, and `TRACKER.md synchronized when priorities change.
2. If behavior changes, update `UI_DESIGN.md` and `ARCHITECTURE.md` in the same change.
3. Move superseded one-off planning docs into `docs/archive/`.
4. Record new validation evidence in `TRACKER.md`.
