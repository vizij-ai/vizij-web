# Vizij Authoring Guidebook

Last updated: 2026-02-20

This guidebook is the fastest path for engineers to understand the
`vizij-authoring` app, find the right source files, and make safe changes.

## Recommended Reading Order

1. `apps/vizij-authoring/docs/plans/GOAL.md`
   - Product intent and release outcomes.
2. `apps/vizij-authoring/docs/plans/ROADMAP.md`
   - Delivery stages and sequencing.
3. `apps/vizij-authoring/docs/ARCHITECTURE.md`
   - Runtime/compiler/store boundary contracts.
4. `apps/vizij-authoring/docs/UI_DESIGN.md`
   - User-facing behavior and workflow contracts.
5. `apps/vizij-authoring/docs/guidebook/CODEBASE_MAP.md`
   - Where code lives and which modules own each behavior.
6. `apps/vizij-authoring/docs/guidebook/WORKFLOW_AND_VALIDATION.md`
   - Daily engineering workflow and required validation commands.
7. `apps/vizij-authoring/docs/guidebook/MODULARITY_AND_DRY_OPPORTUNITIES.md`
   - Known refactor opportunities and ownership targets.

## How To Use This Guidebook

1. Use `CODEBASE_MAP.md` before editing unfamiliar areas.
2. Check `WORKFLOW_AND_VALIDATION.md` before opening a PR.
3. Add new refactor candidates to `MODULARITY_AND_DRY_OPPORTUNITIES.md`.
4. Keep architecture/UI docs in sync with any behavior or boundary changes.
