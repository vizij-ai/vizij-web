# Agent Notes · demo-animation-studio

## Purpose

Showcases advanced animation workflows: preset management, rig controls, and runtime inspection using `@vizij/animation-react` + `@vizij/render`.

## Runbook

- Start locally: `pnpm --filter demo-animation-studio dev`
- Production build: `pnpm --filter demo-animation-studio build`
- Type checks: `pnpm --filter demo-animation-studio typecheck`
- Formatting/lint/testing inherit from root scripts; run `pnpm run prep` when touching shared code.

## Integration Tips

- Rebuild `@vizij/animation-react` and `@vizij/render` after changes: `pnpm run build:packages` or targeted filters.
- Update bundled presets/sample data in `src/data` alongside UI changes.
- Keep React state updates in sync with animation provider expectations (no top-level WASM initialisation).
- Document any new workflows in the app README.
