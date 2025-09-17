# Demo Node Graph

Interactive React Flow editor demonstrating the Vizij node graph runtime.

## Overview

- Consumes `@vizij/node-graph-react` for evaluation, which delegates to the
  `@vizij/node-graph-wasm` bindings.
- Synchronises React Flow node data with the runtime spec via `nodesToSpec`.
- Palette and inspector are schema-driven, pulling metadata from the wasm
  registry so category names and port labels stay aligned with Rust.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173 to load the editor. Use the inspector panel to adjust
parameters or bind output nodes to typed paths.

## Building

```bash
npm run build
```

The command bundles both the app and the linked wasm package.

## Testing

```bash
npm run test
```

Vitest targets cover:

- `nodesToSpec` serialization (paths, shapes, vector metadata)
- Palette rendering from the schema registry
- Value formatting for complex shapes (transforms, enums)

End-to-end experiments can be run with Playwright:

```bash
npm run e2e
```

## Key Files

- `src/lib/graph.ts` — React Flow ➜ runtime spec translation
- `src/components/InspectorPanel.tsx` — parameter editing and typed path UI
- `src/lib/display.ts` — value formatting helpers for inspector nodes
- `src/__tests__/` — integration tests for serialization and UI widgets

Refer to `vizij_docs/node-graph.md` for the full architecture walkthrough.
