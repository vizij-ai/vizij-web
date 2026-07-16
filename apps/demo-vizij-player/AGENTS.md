# Agent Notes · demo-vizij-player

## Purpose

Bundle-first showcase surface for facial exports built on `@vizij/runtime-react`. It demonstrates how a single GLB can embed rig graphs, pose data, animation clips, and procedural motiongraph programs.

## Runbook

- Dev server: `pnpm --filter demo-vizij-player dev`
- Build/preview: `pnpm --filter demo-vizij-player build` / `pnpm --filter demo-vizij-player preview`
- Typecheck/tests: `pnpm --filter demo-vizij-player typecheck` / `pnpm --filter demo-vizij-player test`

## Integration Tips

- Coordinate runtime-react or render API changes with the relevant packages and rebuild them before testing.
- State persistence lives under `src/state`; bump storage versioning whenever the persisted source or panel model changes.
- Maintain logging prefixes (`demo-vizij-player:`) so console output stays searchable.
- Keep the curated sample catalog aligned with the bundle-rich assets that actually exist in `apps/vizij-authoring/public/assets`.
- Document any new showcase panels or asset expectations in the README for QA coverage.
