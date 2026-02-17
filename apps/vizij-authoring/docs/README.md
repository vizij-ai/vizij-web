# Vizij Authoring Docs

Last updated: 2026-02-17 (P1 UI control-surface refactor added)

This directory is the source of truth for authoring-app planning, status, and review notes.

## Current snapshot

1. P0 is complete.
2. P1 completed tranches include:
   - inspector chain clickthrough + binding parity,
   - first-class pose-group config and two-layer pose blending compile path,
   - pose creation/play tooling and sidebar pose-group inspector.
3. P1 remaining focus:
   - dedicated left-column control-surface split into Face Elements, Variables, Poses, Pose Groups, Drivers,
   - one globally selected item between panes with deterministic inspector routing,
   - Variables pane exposes true external inputs only, path-grouped, and opening directly to slider controls,
   - Poses pane lists primary-face pose definitions only (secondary-face pose workflow deferred),
   - all defined poses exposed in a dedicated pose pane with add/remove-to-group controls and membership visibility,
   - pose groups exposed as first-class entities with cross-group blend-mode controls in the pose-group pane and local blend-mode controls in the pose group inspector,
   - `/rig/element` generated rig inputs are excluded from variable controls and Drivers and treated as face-graph aliases.
4. P1 remaining focus:
   - aggregate pose-output binding surfacing in inspector/binding flows,
   - strict rig-boundary enforcement + diagnostics,
   - import/group strategy controls and group lifecycle polish.

## Canonical plans

1. `apps/vizij-authoring/docs/plans/GOAL.md`
2. `apps/vizij-authoring/docs/plans/TRACKER.md`
3. `apps/vizij-authoring/docs/plans/ROADMAP_BACKLOG.md`
4. `apps/vizij-authoring/docs/plans/BACKLOG.md`
5. `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`

Use these for active planning and execution.

## Notes and analysis

1. `apps/vizij-authoring/docs/notes/SYNTHESIS.md` is the active interpretation layer and relevance triage.
2. `apps/vizij-authoring/docs/notes/pr-draft-p0-p1-for-saad.md` is the PR draft handoff doc for UI cleanup and review.
3. `apps/vizij-authoring/docs/notes/pose-rig-two-layer-blend-vision-2026-02-11.md` remains the target architecture vision note.
4. `apps/vizij-authoring/docs/notes/runtime-chain-review-2026-02-11.md` and `apps/vizij-authoring/docs/notes/quori-smoke-findings-2026-02-11.md` are historical deep-review evidence (many findings now resolved; see synthesis).
5. `apps/vizij-authoring/docs/notes/audit.md`, `apps/vizij-authoring/docs/notes/pose_report.md`, and `apps/vizij-authoring/docs/notes/review.md` are source audit artifacts.
6. `apps/vizij-authoring/docs/ARCHITECTURE.md` is the full architecture explainer for contributors onboarding to the app.
7. `apps/vizij-authoring/docs/notes/CONTRIBUTOR_APPENDIX.md` is the practical contributor guide (rules, perf, race notes, security, flags, and PR checklist).

## Update rules

1. Update `GOAL.md` when scope or success criteria changes.
2. Update `TRACKER.md` when status, validation, or blockers change.
3. Update `ROADMAP_BACKLOG.md` when priority bands change.
4. Update `BACKLOG.md` with concrete implementation tasks.
5. Update `SYNTHESIS.md` whenever note findings are resolved, superseded, or promoted into backlog.
6. Run `pnpm --filter vizij-authoring run validate` before closing major backlog tranches.
