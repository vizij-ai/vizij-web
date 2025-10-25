# Agent Notes · demo-vizij-authoring

## Purpose

Inspect Vizij GLB assets, explore hierarchies, and export edited scenes without relying on rig or orchestrator components.

## Runbook

- Dev server: `pnpm --filter demo-vizij-authoring dev`
- Build/preview: `pnpm --filter demo-vizij-authoring build` / `pnpm --filter demo-vizij-authoring preview`
- Typecheck: `pnpm --filter demo-vizij-authoring typecheck`

## Integration Tips

- Depends heavily on `@vizij/render`; rebuild the package after renderer changes.
- Keep bundled sample assets documented in the README; note any manual steps for adding new GLBs.
- Ensure file import/export flows handle both local file inputs and remote URLs gracefully.
- When editing the panel system, preserve accessibility hints and avoid introducing blocking async calls on the main thread.
- Expression math now supports the full `+ - * /` set with parentheses—prefer building atop the existing helpers instead of re-parsing strings.
- Feature labels and slot aliases are user-editable; surface resets and uniqueness checks whenever you touch related UI.
