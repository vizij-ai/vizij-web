# Agent Notes · minimal-demo-graph

## Purpose

Lightweight node-graph playground that exercises staging behaviour, input editors, and output visualisation using `@vizij/node-graph-react`.

## Runbook

- Dev server: `pnpm --filter minimal-demo-graph dev`
- Build/preview: `pnpm --filter minimal-demo-graph build` / `pnpm --filter minimal-demo-graph preview`
- Typecheck: `pnpm --filter minimal-demo-graph typecheck`

## Integration Tips

- Keep sample graph specs (`src/data`) in sync with `@vizij/node-graph-wasm`.
- Validate UI tweaks with both play and pause modes; the demo intentionally exercises continuous re-staging.
- Update README tables/sections when adding new panels or input types.
