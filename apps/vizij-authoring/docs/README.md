# Vizij Authoring Docs

Last updated: 2026-02-11 (P1 pose-authoring tranche planned)

This directory is the source of truth for authoring-app planning and analysis.

## Canonical plans

1. `apps/vizij-authoring/docs/plans/GOAL.md`
2. `apps/vizij-authoring/docs/plans/TRACKER.md`
3. `apps/vizij-authoring/docs/plans/ROADMAP_BACKLOG.md`
4. `apps/vizij-authoring/docs/plans/BACKLOG.md`
5. `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`

Use these for active planning and execution.

## Notes and analysis

1. `apps/vizij-authoring/docs/notes/SYNTHESIS.md` is the working synthesis of audits/reviews.
2. `apps/vizij-authoring/docs/notes/pose-rig-two-layer-blend-vision-2026-02-11.md` is the target architecture note for pose groups, two-layer blending, and pose-to-rig aggregate binding semantics.
3. `apps/vizij-authoring/docs/notes/runtime-chain-review-2026-02-11.md` is the latest deep review of import/IR/runtime chain behavior and editor chain surfacing.
4. `apps/vizij-authoring/docs/notes/quori-smoke-findings-2026-02-11.md` captures current inspector/import issues observed in Quori smoke testing and defines the active P1 follow-up plan.
5. `apps/vizij-authoring/docs/notes/audit.md`, `apps/vizij-authoring/docs/notes/pose_report.md`, and `apps/vizij-authoring/docs/notes/review.md` are detailed source reports.
6. `apps/vizij-authoring/docs/ARCHITECTURE.md` is the full architecture explainer for contributors onboarding to the authoring app.
7. `apps/vizij-authoring/docs/notes/CONTRIBUTOR_APPENDIX.md` is the practical contributor guide (rules, perf, race notes, security, flags, and PR checklist).

The detailed reports can contain stale findings after code changes. Treat `SYNTHESIS.md` as the active interpretation layer.

## Update rules

1. Update `GOAL.md` when scope or success criteria changes.
2. Update `TRACKER.md` when status, validation, or blockers change.
3. Update `ROADMAP_BACKLOG.md` when priority bands change.
4. Update `BACKLOG.md` with concrete implementation tasks.
5. Update `SYNTHESIS.md` whenever a note finding is resolved, rejected, or promoted into backlog.
6. Run `pnpm --filter vizij-authoring run validate` before closing major backlog tranches.
