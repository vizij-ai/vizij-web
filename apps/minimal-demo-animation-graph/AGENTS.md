# Agent Notes · minimal-demo-animation-graph

## Purpose

Demonstrates animation + node-graph interoperability (URDF IK, filtering) using `@vizij/animation-react` and `@vizij/node-graph-react` together.

## Runbook

- Dev server: `pnpm --filter minimal-demo-animation-graph dev`
- Build/preview: `pnpm --filter minimal-demo-animation-graph build` / `pnpm --filter minimal-demo-animation-graph preview`
- Typecheck/tests: `pnpm --filter minimal-demo-animation-graph typecheck` / `pnpm --filter minimal-demo-animation-graph test`

## Integration Tips

- Rebuild both animation and node-graph packages after touching shared APIs; mismatched versions surface as runtime readiness failures.
- Maintain the sample URDF assets and ensure they remain lightweight for Vite to handle.
- Use this app to validate staging/initialisation sequences when experimenting with provider defaults.
