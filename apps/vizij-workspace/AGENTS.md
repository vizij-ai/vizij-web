# Agent Notes · vizij-workspace

## Purpose

Inspect Vizij GLB assets, explore hierarchies, and export edited scenes without relying on rig or orchestrator components.

## Runbook

- Dev server: `pnpm --filter vizij-workspace dev`
- Build/preview: `pnpm --filter vizij-workspace build` / `pnpm --filter vizij-workspace preview`
- Typecheck: `pnpm --filter vizij-workspace typecheck`

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

## Troubleshooting

### Derived Inputs

- **Cycle Detection**: If you encounter a cycle warning, check the parent binding chain. The system prevents cycles by validating dependencies before applying changes. If a cycle persists in an imported graph, use the "Clear Parent" action on one of the nodes to break the loop.
- **Missing Parents**: If a parent input is deleted or renamed, the child binding will show a warning. Use the binding editor to re-link to a valid parent or clear the binding.

### IR & Graph Parity

- **IR-First Workflow**: The authoring app now uses an IR-first approach. The `GraphSpec` is derived from the IR. When debugging, trust the IR inspector over the raw graph export.
- **Inspector Debugging**: Use the "Inspector" drawer in the Drivers panel to view the current IR state. You can download the IR JSON or a machine report to diff against expected outputs using `vizij-ir-report`.

## Pose Rig Architecture

- State is managed by `PoseRigStore` (`src/poseRig/store.tsx`), a vanilla store with a React hook wrapper.
- Logic is split into services: `PoseConfigService`, `PoseGraphService`, `PoseSnapshotService`.
- Use `usePoseRigStore` (or `usePoseRig` from `PoseRigProvider`) to access state and actions.
- Avoid putting complex logic in components; use store actions or services.

## Design and UI

The general aesthetic of the application is to be clean and polished yet technical and powerful. Use non-grayscale colors sparingly as they will bring a lot of attention to them. 

Whenever you introduce a new UI element or feature, consider existing elements and refactoring patterns. Consider extending an existing element to support your needs instead. If that is not sufficient, introduce a new generalizable element that works for your needs and can be useful for future work. Make sure any new elements use the application's UI library, are accessible, and are using semantic theme values where applicable (such as colors) so as to be consistent and work with application themes. 

