# Agent Notes · tutorial-fullscreen-face

## Purpose

A fullscreen Vizij face on `@vizij/render`'s canvas and
`@vizij/runtime-react`'s provider. The keyboard fades the face standard's
expression weights and plays its visemes (`play_viseme`).

## Runbook

- Dev server: `pnpm --filter fullscreen-face dev`
- Build/preview: `pnpm --filter fullscreen-face build` / `pnpm --filter fullscreen-face preview`
- Typecheck and lint: `pnpm --filter fullscreen-face typecheck`, `pnpm --filter fullscreen-face lint`
- e2e: `e2e/tests/fullscreen-face.spec.ts`, served on port 5204 (`e2e/standalone-demos.ts`).

## Integration Tips

- The app loads Quori from `apps/vizij-authoring/public/assets/Quori_Current_Extended.glb`; update `FaceApp.tsx` if the canonical sample face moves.
- The face is driven only through its Arora API on `standard/vizij/*` keys (`runtime.path(...)`); the app writes no rig path.
- The hotkeys come from the `vizij-face` profile, so a new expression or viseme in the standard gets a key without code changes.
