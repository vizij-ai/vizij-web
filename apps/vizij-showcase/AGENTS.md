# Agent Notes · vizij-showcase

## Purpose

Expanded showcase for a fullscreen Vizij face demo. Builds on the tutorial by exposing rig input staging, pose hotkeys, gaze steering, and other playground controls so product/design can review everything in one place.

## Runbook

- Dev server: `pnpm --filter vizij-showcase dev`
- Build/preview: `pnpm --filter vizij-showcase build` / `pnpm --filter vizij-showcase preview`
- Typecheck: `pnpm --filter vizij-showcase typecheck`

## Integration Tips

- All assets live under `public/assets/`; update `src/FaceApp.tsx` if you swap GLBs or change bundle namespaces.
- Runtime namespaces are generated per surface from `src/lib/faceAssets.ts` and currently look like `vizij-showcase-<section>`. Keep those names stable enough that shared orchestrator and runtime debug wiring stay aligned.
- Staged rig inputs write directly through `setInput`. If you add new driver UIs, ensure they clamp/validate values to avoid NaN churn.
- `usePoseHotkeys` logs all resolved weight paths once per session—handy for debugging pose naming issues before exporting bundles.
- The voice section defaults to the staging Cloud Function base (`https://us-central1-semio-vizij.cloudfunctions.net/api`). Set `VITE_API_URL` only if you need to override that endpoint for another environment.
