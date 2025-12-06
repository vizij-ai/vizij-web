# Agent Notes · minimal-demo-animation

## Purpose

Smoke-test the animation runtime with the smallest possible React + Vite surface. Useful for verifying `@vizij/animation-react` changes in isolation.

## Runbook

- Dev server: `pnpm --filter minimal-demo-animation dev`
- Build/preview: `pnpm --filter minimal-demo-animation build` / `pnpm --filter minimal-demo-animation preview`
- Typecheck: `pnpm --filter minimal-demo-animation typecheck`

## Integration Tips

- Keep dependencies minimal—avoid adding heavy tooling unless required for regression coverage.
- Update this demo whenever animation provider APIs change so it continues to reflect the canonical “hello world” usage.
- Pair edits with the README and consider adding quick Vitest smoke tests for new hooks.
