# Agent Notes · vizij-showcase

## Purpose

The multi-surface showcase: one section per capability (expressions, gaze, voice, rig controls), each with its own Vizij face, all drawn on one `<VizijCanvas>`.

## Runbook

- Dev server: `pnpm --filter vizij-showcase dev`
- Build/preview: `pnpm --filter vizij-showcase build` / `pnpm --filter vizij-showcase preview`
- Typecheck and lint: `pnpm --filter vizij-showcase typecheck`, `pnpm --filter vizij-showcase lint`
- e2e: `e2e/tests/vizij-showcase.spec.ts`, served on port 5205.

## Integration Tips

- The faces load `apps/vizij-authoring/public/assets/Quori_Current_Extended.glb` through `src/lib/faceAssets.ts`.
- Each section's face is `showcase-<section>`; it loads once the section enters the viewport and runs only while visible.
- Faces are driven through the face standard (`standard/vizij/*`) and the device's methods. The gaze target needs Quori's program, so only the sections that use it run the program.
- The voice section defaults to the staging Cloud Function base (`https://us-central1-semio-vizij.cloudfunctions.net/api`) for `say`. Set `VITE_API_URL` only if you need to override that endpoint for another environment.
