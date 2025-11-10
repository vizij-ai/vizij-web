# Agent Notes · vizij-authoring

## Purpose

Inspect Vizij GLB assets, explore hierarchies, and export edited scenes without relying on rig or orchestrator components.

## Runbook

- Dev server: `pnpm --filter vizij-authoring dev`
- Build/preview: `pnpm --filter vizij-authoring build` / `pnpm --filter vizij-authoring preview`
- Typecheck: `pnpm --filter vizij-authoring typecheck`

## Integration Tips

- Depends heavily on `@vizij/render`; rebuild the package after renderer changes.
- Keep bundled sample assets documented in the README; note any manual steps for adding new GLBs.
- Ensure file import/export flows handle both local file inputs and remote URLs gracefully.
- When editing the panel system, preserve accessibility hints and avoid introducing blocking async calls on the main thread.
- Expression math now supports the full `+ - * /` set with parentheses—prefer building atop the existing helpers instead of re-parsing strings.
- Feature labels and slot aliases are user-editable; surface resets and uniqueness checks whenever you touch related UI.
- BindingEditor now consumes machine-report diagnostics—preserve the slot-level upstream node list, CASE metadata summary, and expression-variable labels whenever you tweak the layout.
- Drivers panel stats (bindings, issue targets, IR nodes, registry version) and IR inspector actions are generated in `StandardInputsSection`; keep the summary grid lightweight and route deeper diagnostics through the inspector drawer.
- The IR inspector quick links (download IR, download machine report, copy `vizij-ir-report --diff` command) are the supported parity workflow—update AGENT notes if the command or button labels change.
