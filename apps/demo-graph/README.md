# demo-graph

> **Interactive playground for Vizij node graphs.**  
> Loads graph samples, lets you edit staged inputs, and visualises output ports while running the WASM runtime in the browser.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Features](#features)
4. [How It Works](#how-it-works)
5. [Supported JSON Formats](#supported-json-formats)
6. [Key Files](#key-files)
7. [Troubleshooting](#troubleshooting)

---

## Overview

- Built with Vite + React.
- Uses `@vizij/node-graph-react` (provider + hooks) which in turn wraps the WASM runtime (`@vizij/node-graph-wasm`).
- Demonstrates staging behaviour: inputs are re-staged every frame when playback is active, ensuring `Input` nodes always see host values.
- Includes sample graphs from the npm package plus a local URDF IK position example.

---

## Quick Start

```bash
# From repo root
pnpm install

# Ensure the WASM package is built (if you are linking locally)
node ../vizij-rs/scripts/build-graph-wasm.mjs
cd ../vizij-rs/npm/@vizij/node-graph-wasm && pnpm run build
cd ../../../vizij-web

# Run the demo
pnpm --filter demo-graph dev
```

Open the printed local URL (default `http://localhost:5173`). Use the control bar to pick a sample, toggle playback, or load custom specs.

---

## Features

- **Graph samples** – Choose from bundled examples (`vectorPlayground`, `oscillatorBasics`, `logicGate`, `tupleSpringDampSlew`) or the local `urdf-ik-position` sample.
- **Input editors** – The app enumerates `Input` nodes and renders lightweight controls for floats, vectors, tuples, and transforms. Input values are stored in local state keyed by `TypedPath`.
- **Output panels** – Each `Output` node renders its current `out` port using `useNodeOutput`, updating automatically as the graph evaluates.
- **Playback control** – Toggle play/pause to switch between continuous evaluation (with per-frame restaging) and a static snapshot mode.
- **Load/save JSON** – Upload a GraphSpec or download the current spec for inspection.

---

## How It Works

- **Provider readiness** – The demo uses the 0.2.x `GraphProvider` defaults (`waitForGraph = true`) so playback starts only after `loadGraph` succeeds and initial inputs/params are applied. Runtime readiness (`graphLoaded`, `waitForGraphReady`, `on/off`) is surfaced for debugging.
- **Staging strategy**
  - **Playing**: inputs are re-staged every frame before `evalAll()` runs, ensuring `Input` nodes observe host values continuously.
  - **Paused**: all inputs are staged once and an immediate evaluation runs so outputs “lock” in place.
- **State separation** – Input editors hold their own state map; staging reads from that map without mutating the spec defaults. Output panels subscribe independently to avoid hook-order churn when switching graphs.

---

## Supported JSON Formats

The loader accepts a few shapes and normalises them to the canonical `GraphSpec` used by `vizij-graph-core` (nodes with inline `inputs` maps).

1. **Canonical GraphSpec**
   ```json
   {
     "nodes": [
       {
         "id": "inputA",
         "type": "input"
       },
       {
         "id": "adder",
         "type": "add",
         "inputs": {
           "lhs": { "node_id": "inputA" },
           "rhs": { "node_id": "const", "output_key": "out" }
         }
       },
       {
         "id": "const",
         "type": "constant",
         "params": { "value": { "float": 1 } }
       }
     ]
   }
   ```
   Connections live inside each node’s `inputs` map rather than a top-level `edges` array.
2. **Legacy editor presets**
   ```json
   { "n": [...], "e": [...] }
   ```
   The demo converts these into the canonical inputs map automatically.
3. **Wrapped spec**
   ```json
   { "spec": { "nodes": [...] } }
   ```

All formats are normalised through `@vizij/node-graph-wasm` before loading.

---

## Key Files

| File                | Purpose                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `src/App.tsx`       | Top-level UI: manages sample selection, playback, JSON editing, and renders graph IO panels. |
| `src/utils/file.ts` | File helpers for reading/staging uploaded graph specs.                                       |

---

## Troubleshooting

- **WASM module errors** – Ensure `@vizij/node-graph-wasm` has been built (`pkg/` present) and the wrapper points to `dist/src/index.js`. Linked packages must be rebuilt after Rust changes.
- **No output updates when playing** – Confirm playback is enabled and that the per-frame staging effect runs (check logs in `App.tsx`). Verify input paths match existing `Input` nodes.
- **React hook warnings when switching graphs** – The demo uses dedicated components for output subscriptions. If you replicate the pattern, avoid calling hooks inside arrays where the number of iterations can change between renders.
- **Missing inputs** – Graphs without explicit `Input` nodes won’t show controls; ensure your spec exposes host-modifiable data through dedicated nodes.

Enjoy exploring Vizij graphs! 🧩
