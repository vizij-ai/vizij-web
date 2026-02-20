# Workflow and Validation Guide

Last updated: 2026-02-20

This guide defines the expected local workflow for safe changes in
`vizij-authoring`.

## Daily Workflow

1. Read contracts before code changes:
   - `apps/vizij-authoring/docs/ARCHITECTURE.md`
   - `apps/vizij-authoring/docs/UI_DESIGN.md`
2. Locate ownership via:
   - `apps/vizij-authoring/docs/guidebook/CODEBASE_MAP.md`
3. Make incremental changes in small commits.
4. Update docs when behavior or boundaries change.

## Validation Commands

Use `pnpm` in this order for touched authoring work:

1. Targeted tests:
   - `pnpm --filter vizij-authoring exec vitest --run <files...>`
2. Typecheck:
   - `pnpm --filter vizij-authoring run typecheck`
3. Lint:
   - `pnpm --filter vizij-authoring run lint`
4. Authoring validation gate:
   - `pnpm --filter vizij-authoring run validate`
5. Repository prep gate (before push/review handoff):
   - `pnpm run prep`

## Evidence Logging

1. Record notable outcomes in:
   - `apps/vizij-authoring/docs/plans/TRACKER.md`
2. Keep execution plans updated when they drive ongoing work:
   - `apps/vizij-authoring/docs/plans/F_QL_EXECUTION_PLAN.md`

## Refactor Safety Rules

1. Preserve runtime-truthful flow (authoring state -> compiled graph -> runtime).
2. Keep UI-only state separate from orchestration/runtime state.
3. Prefer extracting pure helpers/hooks before changing behavior.
4. Add or update regression tests for each extracted boundary.
