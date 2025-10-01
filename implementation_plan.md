# Implementation Plan

[Overview]
Create a standalone Vite demo app that showcases driving a Vizij face directly through the render pipeline with no rig dependency. The app lets users pick a bundled GLB face, inspects every animatable exposed by the renderer, and provides generic controls to tweak values live. The UI and state shape are organized so an orchestrator loop can later plug in (mirroring the existing demo-orchestrator app) to author controllable timelines for the selected face.

[Scope]

- New app workspace `vizij-web/apps/demo-render-no-rig` built with Vite + React.
- Share face metadata (GLB path, bounds, display name, default namespace) across the new demo and any future consumers.
- Implement a generic store-backed inspector that lists scalar, vector, color, and morph animatables with intuitive controls, writing updates via `setValue(id, namespace, value)` from `@vizij/render`.
- Keep code modular so an orchestrator layer can be opt-in without rewriting loader or inspector components.
- Document usage and follow repo conventions for linting/build scripts; no rigs or orchestrator logic shipped yet (only scaffolding hooks).

[Renderer Integration]

- Create a dedicated Vizij store instance per app session using `createVizijStore()` and wrap the entire demo in `<VizijContext.Provider value={store}>`.
- Implement `useFaceLoader` hook (in app) that wraps `loadGLTF` with `aggressiveImport=true`, injects world + animatables into the shared store via `addWorldElements`, captures the `rootId` from root group, and tracks `loading/ready/error` state. Hook mirrors doc guidance from Rendernotes.md and replaces the rig-focused hook.
- Namespaces: pass a configurable namespace (default `"default"`) through loader, renderer, inspector, and future orchestrator wiring so multiple faces remain feasible.
- Ensure loaders cleanup when switching faces (reset `world`, `animatables`, and `values` for the old namespace) to avoid stale animatables. Use store actions to drop entries belonging to the previous face before adding the new ones.

[Inspector & Controls]

- Build `AnimatableInspector` component that reads `animatables` and `values` from the Vizij store (scoped to namespace) using selectors to avoid re-renders.
- Provide renderers per animatable `type`:
  - `scalar`: slider + numeric input using `min/max` defaults where available, fall back to sensible ranges (0..1) if missing.
  - `vec3`/`vec2`: grouped numeric inputs per axis.
  - `color`: HTML color picker with conversions.
  - `quat`/unsupported types: display read-only JSON (still show current value for debugging).
  - Morph targets (typically `scalar` with `Key` names) just use scalar controls.
- Include search/filter UI (basic text filter, collapse groups) for usability when assets expose dozens of entries.
- Reflect live values (subscribe to `values` Map using `useVizijStoreSubscription` or derived state) so controls stay in sync with external writers.
- Surface metadata (animatable `name`, id, optional `min/max`, default) and add a quick "reset" action restoring `default` from animatable descriptor.

[Face Catalog]

- Introduce app-level `faces.ts` config enumerating existing GLB assets from `apps/website/src/assets` with bounds lifted from website components (Quori, Hugo, Abi, Baxter, Jibo, Tiago).
- Normalize config shape: `{ id, name, asset: string, bounds, namespace?, initialValues? }`.
- Move duplicated bounds constants (e.g., `QuoriBounds`) out of website components into this config (optionally export re-used constants for website to adopt later; in this task we keep website untouched but mark TODOs).
- Provide helper for loading initial slider defaults (e.g., pass optional `initialValues` to loader so UI displays non-zero defaults when needed).

[UI Shell]

- Layout: responsive two-column grid (`FaceViewer` canvas on left, `AnimatableInspector` on right) collapsing vertically on small screens.
- `FaceSelector` component renders buttons/dropdown using config list. Upon change, call loader to fetch GLB and clear previous namespace values.
- Display loader and error states prominently (fallback skeleton while GLB loads, error callouts if model import fails).
- Expose optional toggles: show safe area, adjust canvas background, namespace label.
- Include "Active Values" debug panel (list entries in `values` Map) to mirror orchestrator demo style diagnostics.

[Orchestrator Readiness]

- Add optional panel shell (collapsed by default) that will later host orchestrator controls. Wire placeholder context/hook: `useOrchestratorBridge` returning stubs now, real logic to be implemented when orchestrator integration is tackled.
- Document how orchestrator outputs (merged writes) will map to `setValue(namespace, animId, value)` calls; ensure inspector controls coexist by applying manual updates using same setter so orchestrator can override or blend.
- Keep namespace + animatable id readily accessible (component-level constants/functions) so orchestrator wiring can reuse them without refactoring.

[Files]
New files to create:

- `vizij-web/apps/demo-render-no-rig/package.json` (workspace metadata + scripts mirroring other demos).
- `vizij-web/apps/demo-render-no-rig/tsconfig.json` (extends repo defaults).
- `vizij-web/apps/demo-render-no-rig/vite.config.ts` (Vite React setup, include `optimizeDeps.exclude` for `@vizij/render` if necessary).
- `vizij-web/apps/demo-render-no-rig/src/main.tsx` (React entry binding App within Vizij context and global styles).
- `vizij-web/apps/demo-render-no-rig/src/App.tsx` (top-level layout: selector, viewer, inspector, diagnostics scaffold).
- `vizij-web/apps/demo-render-no-rig/src/components/FaceViewer.tsx` (renders `<Vizij>` once loader ready).
- `vizij-web/apps/demo-render-no-rig/src/components/AnimatableInspector.tsx` + supporting subcomponents for control renderers.
- `vizij-web/apps/demo-render-no-rig/src/hooks/useFaceLoader.ts` (loader described above).
- `vizij-web/apps/demo-render-no-rig/src/hooks/useAnimatableList.ts` (memoized selection + filtering helpers).
- `vizij-web/apps/demo-render-no-rig/src/components/ControlsToolbar.tsx` (reset buttons, namespace toggles, orchestrator placeholder).
- `vizij-web/apps/demo-render-no-rig/src/data/faces.ts` (face catalog config + types).
- `vizij-web/apps/demo-render-no-rig/README.md` (usage instructions, future orchestrator note).
- Lightweight CSS (tailwind or inline) optional—if using CSS modules, create `App.css` or `styles.css` accordingly.

Existing file updates:

- `vizij-web/package.json`: add npm scripts like `dev:demo-render-no-rig` and `build:demo-render-no-rig` for convenience; ensure build/test globs include the new workspace if required.
- Optionally add entry to root README or docs (not mandatory but recommended) linking to the new demo.
- No changes needed to renderer package code; reuse exports as-is.

[Validation]

- Manual run: `npm run dev --workspace demo-render-no-rig` (or new script) to confirm GLB loads, inspector responds, and switching faces resets state without console errors.
- Build check: `npm run build --workspace demo-render-no-rig` to ensure Vite bundle succeeds and tree-shakes optional orchestrator shell.
- Type check: rely on existing `npm run typecheck` (workspace inclusion guarantees TS compile).
- Optional smoke test: load multiple faces in succession and verify `values` map clears between loads (log assertions in console during development).

[Follow-ups]

- Next integration milestone: wire orchestrator provider panel that maps orchestrator merged writes to selected face namespace (reuse demo-orchestrator patterns).
