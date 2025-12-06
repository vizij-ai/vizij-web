# Agent Notes · minimal-demo-orchestrator

## Purpose

Visualises orchestrator controller coordination and blackboard writes using `@vizij/orchestrator-react` with canned animation/graph controllers.

## Runbook

- Dev server: `pnpm --filter minimal-demo-orchestrator dev`
- Build/preview: `pnpm --filter minimal-demo-orchestrator build` / `pnpm --filter minimal-demo-orchestrator preview`
- Typecheck: `pnpm --filter minimal-demo-orchestrator typecheck`

## Integration Tips

- Rebuild `@vizij/orchestrator-react` (and supporting packages) before testing orchestrator changes.
- Verify logging and diagnostics panels continue to render readable ValueJSON payloads.
- Keep scenario descriptions in the README aligned with installed controllers to aid QA/debugging.
