# Agent Notes · demo-vizij-rigging

## Purpose

Build high-level emotion rigs by layering authoring tools on top of Vizij GLBs and graph specs exported from `demo-vizij-authoring`.

## Runbook

- Dev server: `pnpm --filter demo-vizij-rigging dev`
- Build/preview: `pnpm --filter demo-vizij-rigging build` / `pnpm --filter demo-vizij-rigging preview`
- Typecheck: `pnpm --filter demo-vizij-rigging typecheck`

## Integration Tips

- Relies on `@vizij/render`, `@vizij/animation-react`, and utility helpers—rebuild packages after touching them.
- Keep pose export formats compatible with the downstream runtime; update README notes when fields change.
- Validate GLB + graph import flows with the sample assets whenever you alter parsing logic.
- Ensure performance when blending multiple poses; avoid re-render storms when tweaking Zustand/React state.
