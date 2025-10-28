# Agent Notes · tutorial-fullscreen-face

## Purpose

Showcase a fullscreen Vizij face controlled by orchestrator graphs. Mouse position steers gaze and keyboard shortcuts trigger pose weights generated from the exported pose rig.

## Runbook

- Dev server: `pnpm --filter fullscreen-face dev`
- Build/preview: `pnpm --filter fullscreen-face build` / `pnpm --filter fullscreen-face preview`
- Typecheck: `pnpm --filter fullscreen-face typecheck`

## Integration Tips

- The app loads assets from `tutorial_data/`; update imports if you rename or relocate the exported rig bundle.
- The renderer namespace is `fullscreen-face`; keep it stable so orchestration and gaze hooks keep working.
- Extend `usePoseHotkeys` if you add more poses—remember to update the UI hint and keyboard bindings together.
