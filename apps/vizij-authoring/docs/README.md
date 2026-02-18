# Vizij Authoring Docs

Last updated: 2026-02-18

This folder is organized into active core docs, active references, and archived historical docs.

## Active Core Docs

### Planning (execution source of truth)

1. `apps/vizij-authoring/docs/plans/GOAL.md`
   Role: product/program objective and success criteria.
2. `apps/vizij-authoring/docs/plans/ROADMAP.md`
   Role: stage ordering and exit gates.
3. `apps/vizij-authoring/docs/plans/BACKLOG.md`
   Role: implementation-ready task list.
4. `apps/vizij-authoring/docs/plans/TRACKER.md`
   Role: live status and validation evidence.

### Contracts

1. `apps/vizij-authoring/docs/UI_DESIGN.md`
   Role: UI/UX behavior contract.
2. `apps/vizij-authoring/docs/ARCHITECTURE.md`
   Role: technical boundaries and invariants.
3. `apps/vizij-authoring/docs/Authoring_Blueprint.md`
   Role: detailed layer and namespace contract.

## Active References

1. `apps/vizij-authoring/docs/references/ui-component-inventory.md`
   Role: component-level inventory used for UI refactor planning (`B1`, `B5`).

## Active Notes

1. `apps/vizij-authoring/docs/notes/SYNTHESIS.md`
   Role: notes relevance filter and archive triage summary.
2. `apps/vizij-authoring/docs/notes/pose-rig-two-layer-blend-vision-2026-02-11.md`
   Role: pose architecture intent reference.
3. `apps/vizij-authoring/docs/notes/CONTRIBUTOR_APPENDIX.md`
   Role: contributor guardrails and practical checks.

## Archive

Historical material is under:

1. `apps/vizij-authoring/docs/archive/plans/`
2. `apps/vizij-authoring/docs/archive/notes/`
3. `apps/vizij-authoring/docs/archive/reports/`

Notable archived evidence:

1. `apps/vizij-authoring/docs/archive/reports/audit_authoring_report.md`
   Role: detailed audit evidence feeding backlog `B5`.

Archived docs are context only and should not be used as active execution sources.

## Update Rules

1. Keep each doc focused on its role; avoid duplicating task detail across core docs.
2. Promote actionable items from notes/references/reports into `plans/BACKLOG.md`.
3. Move completed/superseded notes and one-off reports to `docs/archive/`.
4. Record validation evidence changes in `plans/TRACKER.md`.
