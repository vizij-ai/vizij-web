# Agent Notes · demo-vizij-player

## Purpose

Authoring surface for facial rigs that combines `@vizij/animation-react`, `@vizij/orchestrator-react`, and `@vizij/render` to stage animations, merge controller writes, and preview results.

## Runbook

- Dev server: `pnpm --filter demo-vizij-player dev`
- Build/preview: `pnpm --filter demo-vizij-player build` / `pnpm --filter demo-vizij-player preview`
- Typecheck/tests: `pnpm --filter demo-vizij-player typecheck` / `pnpm --filter demo-vizij-player test`

## Integration Tips

- Coordinate orchestrator or animation API changes with the relevant packages and rebuild them before testing.
- State persistence lives under `src/state`; update storage versioning whenever breaking changes land.
- Maintain logging prefixes (`demo-vizij-player:`) so console output stays searchable.
- Document any new panel flows or assets in the README for QA coverage.
