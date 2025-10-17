# node-graph-editor

> **Work-in-progress Vizij node graph editor.**  
> Provides a developer-facing canvas for building GraphSpecs using `@vizij/node-graph-react` and `@vizij/node-graph-wasm`.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Capabilities](#capabilities)
4. [Key Files](#key-files)
5. [Roadmap](#roadmap)

---

## Overview

- Built with Vite + React + React Flow.
- Stores graph state in a Zustand editor store capable of exporting/importing normalised `GraphSpec` JSON.
- Integrates with the node registry provided by `@vizij/node-graph-wasm` for palette metadata.
- Still under active development—expect missing polish and advanced tooling.

---

## Quick Start

```bash
pnpm install
pnpm --filter vizij-node-graph-editor dev
```

Additional scripts:

```bash
pnpm --filter vizij-node-graph-editor build      # production build + type checks
pnpm --filter vizij-node-graph-editor preview    # preview production output
pnpm --filter vizij-node-graph-editor test       # Vitest unit tests
```

---

## Capabilities

- Dark-mode authoring shell with collapsible palette/inputs/inspector panels tailored for dense graphs.
- Node palette backed by the wasm registry (docs, categories, tooling-ready metadata).
- React Flow canvas with schema-driven handles, variadic slot rendering, and selector/default indicators.
- Inspector panel showing registry docs, param editors, variadic controls, and inline runtime snapshots.
- Input panel that auto-discovers `input` nodes, exposes sliders/toggles for their typed paths, and stages changes into the runtime in real time.
- Persistence panel with wasm normalisation, local storage helpers, and one-click loading of bundled fixtures.
- Transport controls for stepping graphs, hot reloading specs, and logging runtime snapshots.

---

## Key Files

| File                                  | Purpose                                                         |
| ------------------------------------- | --------------------------------------------------------------- |
| `src/App.tsx`                         | App shell and provider wiring.                                  |
| `src/contexts/RegistryProvider.tsx`   | Loads node schema registry from WASM.                           |
| `src/store/useEditorStore.ts`         | Zustand store managing nodes, edges, and GraphSpec conversions. |
| `src/components/EditorCanvas.tsx`     | React Flow canvas implementation.                               |
| `src/components/NodePalette.tsx`      | Searchable list of node types.                                  |
| `src/components/InspectorPanel.tsx`   | Param editing UI.                                               |
| `src/components/PersistencePanel.tsx` | Import/export controls.                                         |

---

## Roadmap

- Connection assistant enhancements and richer validation feedback.
- Improved inspector editors (vectors, transforms, enums).
- Canvas affordances for grouped selections and bulk operations.
- End-to-end regression tests, wasm parity checks, and performance tuning.

Contributions are welcome—open an issue if you hit rough edges. 🛠️
