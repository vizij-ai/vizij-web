# Agent Notes · demo-graph-studio

## Purpose

Work-in-progress editor for Vizij node graphs using `@vizij/node-graph-react`, React Flow, and supporting utilities.

## Runbook

- Dev server: `pnpm --filter demo-graph-studio dev`
- Build: `pnpm --filter demo-graph-studio build`
- Typecheck/tests: `pnpm --filter demo-graph-studio typecheck` / `pnpm --filter demo-graph-studio test` (if present)

## Integration Tips

- Coordinate API changes with `@vizij/node-graph-react`; rebuild packages before verifying UI updates.
- Keep sample graph specs in sync with runtime expectations; update fixtures under `src/data`.
- The README tracks outstanding roadmap items—update it when behaviour changes.
- Ensure new canvas interactions remain performant; watch for React Flow breaking changes when upgrading dependencies.
