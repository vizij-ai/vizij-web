# Vizij Renderer No-Rig Demo

This Vite app showcases how to drive a Vizij face directly through the render pipeline without loading a rig. It lets you pick one of the bundled GLB faces, streams it into the shared Vizij store, inspects every animatable exposed by the renderer, and lets you tweak values live. An embedded orchestrator demo mirrors the standalone `demo-orchestrator` example, piping its output into any animatable you select.

## Running the demo

```bash
# from repo root
npm install
npm run dev --workspace demo-render-no-rig
```

The dev server opens at <http://localhost:5173>. Use the toolbar to swap faces or change the namespace, then drag sliders or inputs in the inspector to see updates in real time.

## Architecture overview

### Loader + store

- `useFaceLoader` wraps `loadGLTF` with `aggressiveImport=true`, injects world and animatables into a dedicated Vizij store, and scrubs stale state for the active namespace before applying the new face.
- Faces and bounds live in `data/faces.ts`, reusing the website's GLB assets so every demo stays in sync.

### Canvas + inspector

- `FaceViewer` renders `<Vizij>` once the loader returns a `rootId`, with a toggle for the safe area.
- `AnimatableInspector` combines `useAnimatableList` (store selector) with type-aware editors for numbers, vectors, booleans, strings, and RGB/HSL colors. Every row shows constraints, the current namespace, and quick reset buttons, while subscribing directly to the Vizij store for live updates.
- `ActiveValuesPanel` mirrors the `values` map so you can see exactly what the store is tracking.

### Orchestrator bridge

- `OrchestratorProvider` runs the wasm runtime on the client (autostarted).
- `OrchestratorPanel` registers the ramp animation + gain/offset graph, lets you choose which animatable the graph output should drive, and pushes the merged writes back into Vizij via `setValue`.
- Gain/offset sliders issue blackboard inputs through `setInput`, making it easy to inspect how controller math affects the active face.

## Key files

- `src/App.tsx` – top-level layout plus orchestrator wiring.
- `src/hooks/useFaceLoader.ts` – GLB loader + Vizij store bridge.
- `src/components/AnimatableInspector.tsx` – type-specific UI and reset helpers.
- `src/hooks/useAnimatableList.ts` – grouping/filtering logic for the inspector.
- `src/data/faces.ts` – face catalog shared with other demos.
- `src/components/OrchestratorPanel.tsx` – orchestrator controls that stream merged writes into Vizij.

## Next steps

1. Share the face metadata with the marketing website to remove duplicated bounds.
2. Add regression smoke tests (e.g., Vitest + Playwright) that load a face, tweak an animatable, and confirm orchestrator playback updates the target.
3. Expand the orchestrator UI with transport controls (pause/scrub) or multi-output routing for complex demos.
