Vizij Node Graph Editor (work in progress)

This app is a developer-facing editor built on @vizij/node-graph-react and @vizij/node-graph-wasm.

Local development (monorepo)

- From repo root run the regular workspace install/build steps used by the monorepo.
- From this package directory you can run:
  - npm run dev (starts Vite dev server)
  - npm run build
  - npm run preview
  - npm run test (runs vitest unit tests)

Notes

- This app is scaffolded to use local workspace packages for @vizij/node-graph-react and @vizij/node-graph-wasm.
- Tests use Vitest; tsconfig includes Vitest types.
- Persistence exports/imports a "normalized" GraphSpec via the editor store's nodesToSpec/specToNodes helpers.
- Many features remain: connections assistant (advanced), richer inspector editors, output chart polishing, end-to-end tests, and performance tuning.

Files of interest

- src/App.tsx — App shell + provider wiring
- src/contexts/RegistryProvider.tsx — loads node registry from wasm
- src/store/useEditorStore.ts — Zustand editor store, nodes/edges/spec
- src/components/\* — EditorCanvas, NodePalette, InspectorPanel, TransportBar, OutputsChart, PersistencePanel
