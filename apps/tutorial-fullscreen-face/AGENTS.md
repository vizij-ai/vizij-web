# Agent Notes · tutorial-fullscreen-face

## Purpose

Showcase a fullscreen Vizij face controlled by orchestrator graphs. Mouse position steers gaze and keyboard shortcuts trigger pose weights generated from the exported pose rig.

## Runbook

- Dev server: `pnpm --filter fullscreen-face dev`
- Build/preview: `pnpm --filter fullscreen-face build` / `pnpm --filter fullscreen-face preview`
- Typecheck: `pnpm --filter fullscreen-face typecheck`

## Integration Tips

- The app loads Quori from `apps/vizij-authoring/public/assets/Quori_Current_Extended.glb`; update the `FaceApp.tsx` import if the canonical sample rig moves.
- The renderer namespace is `fullscreen-face`; keep it stable so orchestration and gaze hooks keep working.
- Extend `usePoseHotkeys` if you add more poses—remember to update the UI hint and keyboard bindings together.
