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

- Node palette sourced from the wasm node schema.
- Drag-and-drop node creation with React Flow.
- Inspector panel for editing node params.
- Persistence panel (export/import GraphSpec JSON).
- Outputs chart for quick validation of numeric nodes.

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
| `src/components/OutputsChart.tsx`     | Basic visualisation for numeric outputs.                        |
| `src/components/PersistencePanel.tsx` | Import/export controls.                                         |

---

## Roadmap

- Connection assistant enhancements and richer validation.
- Improved inspector editors (vectors, transforms, enums).
- Output chart polish and multi-series support.
- End-to-end regression tests and performance tuning.

Contributions are welcome—open an issue if you hit rough edges. 🛠️
