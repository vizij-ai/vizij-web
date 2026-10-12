# Agent Notes · demo-vizij-player

## Purpose

A showcase for face exports on `@vizij/runtime-react` and `@vizij/render`: one GLB at a time, its rig inputs, poses, animations and programs driven from panels built out of `describe(glb)`.

## Runbook

- Dev server: `pnpm --filter demo-vizij-player dev`
- Build/preview: `pnpm --filter demo-vizij-player build` / `pnpm --filter demo-vizij-player preview`
- Typecheck/tests: `pnpm --filter demo-vizij-player typecheck` / `pnpm --filter demo-vizij-player test`
- e2e: `e2e/tests/demo-vizij-player-load-sample.spec.ts`, served on port 5200.

## Integration Tips

- The face loads with its own rig, pose driver and poses only (`options.graphs`), so the panels drive its rig inputs and pose weights directly; its programs start from the Programs panel (`program: "none"`).
- Every control is a call on the face's `Runtime`; a capability the panels need belongs in `@vizij/runtime`, not in a helper here.
- State persistence lives under `src/state`; bump storage versioning whenever the persisted source or panel model changes.
- Keep the curated sample catalog aligned with the assets in `apps/vizij-authoring/public/assets`.
