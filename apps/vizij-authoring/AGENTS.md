# Agent Notes · vizij-authoring

## Purpose

Build and maintain a runtime-truthful Vizij authoring surface: import assets/graphs, author rig bindings and poses, validate runtime behavior, and export reliable Vizij bundles.

## Runbook

- Dev server: `NODE_ENV=development pnpm --filter vizij-authoring dev`
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

## Troubleshooting

### Blank Page in Codex Browser

- If the authoring app opens as a blank page in Codex and the console shows `_jsxDEV is not a function`, check the shell environment before blaming the current UI change.
- Codex desktop sessions can inherit `NODE_ENV=production`, which causes Vite dev mode to serve the production `react-jsx-dev-runtime`.
- Restart the dev server with `NODE_ENV=development pnpm --filter vizij-authoring dev` before running Playwright or browser checks.

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

Whenever you introduce a new UI element or feature, consider existing elements and refactoring patterns. Consider extending an existing element to support your needs instead. If that is not sufficient, introduce a new generalizable element that works for your needs and can be useful for future work. Make sure any new elements are accessible and use semantic theme values where applicable (such as colors) so as to be consistent and work with application themes.

### Where components come from

Generic UI primitives come from **`@semio/ui`**. `src/components/ui/` is the app's _variant_ layer: each
file either composes one or more `@semio/ui` exports and adds a documented app contract, or is app-local
because `@semio/ui` has no usable counterpart. Feature code imports from `../ui`.

When you need a building block, in order of preference:

1. Use an existing component from `src/components/ui/`.
2. Extend that component.
3. Build a new `src/components/ui/` variant **on top of a `@semio/ui` export**. Check `@semio/ui`'s
   surface first — it is broad (form controls, overlays, tree/list grids, scroll areas with sync hooks,
   and a large icon set including keyframe/bezier/easing/playhead glyphs).
4. Only if `@semio/ui` offers no substrate, build on `radix-ui` — the same primitive stack `@semio/ui`
   itself uses. **Do not write new `@base-ui/react` imports.** It is still a dependency and still used
   by several `src/components/ui/` files, but it is being retired: `@semio/ui` requires `@base-ui/react`
   `^1.4.1` while this app pins `1.1.0`, and two copies means two independent portal/dismissal stacks.
   Every new Base UI import is one more file to migrate.

Do not re-implement a primitive inline in feature code. The app has a history of this (competing
comboboxes, three separate collapsibles, a parallel numeric-input stack) and it is being retired, not
extended.
