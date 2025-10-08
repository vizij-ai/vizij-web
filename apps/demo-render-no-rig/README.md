# demo-render-no-rig

> **Drive Vizij faces directly through the renderer without loading a rig.**  
> This demo lets you swap between bundled GLB faces, tweak animatable values live, and route orchestrator outputs into the renderer.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Key Components](#key-components)
5. [Development Notes](#development-notes)
6. [Ideas for Expansion](#ideas-for-expansion)

---

## Overview

- Built with Vite + React on top of the Vizij renderer (`packages/render`) and orchestrator bindings.
- Loads GLB faces directly, injects them into the Vizij store, and exposes every animatable for inspection.
- Embeds the orchestrator demo from `demo-orchestrator`, piping merged writes into any selected animatable.

---

## Quick Start

```bash
pnpm install
pnpm --filter demo-render-no-rig dev
```

Open `http://localhost:5173` to interact with the face viewer, inspector, and orchestrator panel.

---

## Architecture

### Loader & Store

- `useFaceLoader` wraps the shared `loadGLTF` helper (`aggressiveImport=true`) and pushes world elements + animatables into the Vizij store.
- When switching faces, the hook clears stale state for the active namespace before applying the new assets.
- Face metadata and bounds live in `src/data/faces.ts`, shared with the marketing site to keep demos consistent.

### Canvas & Inspector

- `FaceViewer` renders the `<Vizij>` component once the loader returns a `rootId`, with controls for toggling the safe area overlay.
- `AnimatableInspector` uses `useAnimatableList` to group animatables and renders type-aware editors (numbers, vectors, colours, booleans, text) with constraints + reset buttons.
- `ActiveValuesPanel` mirrors the store’s `values` map so you can track all animatable changes in real time.

### Orchestrator Bridge

- `OrchestratorProvider` runs the wasm orchestrator; the panel registers a ramp animation, gain/offset graph, and streams merged writes back into Vizij via `setValue`.
- Gain/offset sliders send blackboard inputs through `setInput`, illustrating how controller math flows into the face.
- You can route orchestrator output to any animatable selected in the inspector.

---

## Key Components

| File                                     | Responsibility                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| `src/App.tsx`                            | Top-level layout, orchestrator wiring, and namespace controls.                   |
| `src/hooks/useFaceLoader.ts`             | GLB loader + Vizij store integration.                                            |
| `src/hooks/useAnimatableList.ts`         | Groups/filters animatables for the inspector UI.                                 |
| `src/components/AnimatableInspector.tsx` | Type-specific editors and reset helpers.                                         |
| `src/components/OrchestratorPanel.tsx`   | Orchestrator UI (register controllers, gain/offset sliders, animatable routing). |
| `src/data/faces.ts`                      | Face catalogue (GLB paths, bounds, metadata).                                    |

---

## Development Notes

- Build or link the renderer (`@vizij/render`) before starting the demo if you are editing it locally.
- The Vite config already preserves symlinks and excludes WASM packages, making it friendly for linked development.
- When adding new faces, keep file sizes moderate so the demo stays responsive.

---

## Ideas for Expansion

1. Share face metadata directly with the public website to eliminate duplication.
2. Add regression tests (Vitest/Playwright) that load a face, tweak an animatable, and assert orchestrator playback updates the selection.
3. Extend the orchestrator panel with transport controls (pause/scrub) or multi-output routing for complex demos.

Enjoy experimenting with Vizij faces! 😄
