# Work in Progress / Next Steps

This doc tracks what remains to finish the inline animation + node graph authoring flow that now stores typed editor state in `App.tsx`. Staged files show the last stable implementation that fed raw orchestrator configs; the current working tree introduces new state shapes, helpers, and defaults but the editors/bridge still need to be rebuilt around them. Use the notes below to close the gap.

---

## 1. Animation Authoring

### Current state

- `AnimationEditorState`, `AnimationTrackState`, `AnimationKeyframeState`, and `ValueKind` live in `src/types.ts`.
- `DEFAULT_ANIMATION_STATE` mirrors the old ramp demo and seeds `App.tsx` (`src/orchestratorDefaults.ts`).
- Helper utilities exist: `buildAnimatableOptions` + `updateTracksForSelectedAnim` (`src/utils/animatableOptions.ts`), `defaultValueForKind` / `valueToJSON` / `jsonToValue` (`src/utils/valueHelpers.ts`), and the reusable `ValueField` component for editing values (`src/components/ValueField.tsx`).
- `animationStateToConfig` in `src/utils/orchestratorConverters.ts` serializes the editor state to `AnimationRegistrationConfig`.
- `App.tsx` already swaps to `animationState` and wires `updateTracksForSelectedAnim` on animatable list changes, but `AnimationEditor.tsx` was removed during refactor.

### Remaining tasks

- Rebuild `src/components/AnimationEditor.tsx` to edit `AnimationEditorState` instead of `AnimationRegistrationConfig`.
  - Render collapsible track cards with a summary string (e.g. `"Ramp • demo/value • vec3 • 3 keys"`).
  - Track rows must let users pick: target animatable (`animatableOptions`, including component slices), `valueKind`, optional `shapeJson`, and provide add/remove controls.
  - Keyframe rows should use `ValueField` for `value`, expose stamp editors, and allow bezier handle editing; persist handles in state.
  - Include validation + inline warnings for invalid `shapeJson` (highlight the field, keep the raw string so the user can fix it).
- Keep tracks aligned with animatable metadata:
  - When a track target changes, call `updateTracksForSelectedAnim` so existing keyframe values coerce to the correct `ValueKind`.
  - Surface feedback if the selected animatable lacks defaults or if coercion failed.
- Decide how edits commit: the editor should mutate a cloned copy of the state and call `onChange(nextState)`; ensure we always clone arrays/objects when updating nested pieces.
- (Optional follow-up) Add a reverse `animationConfigToState` helper for loading existing orchestrator assets.

---

## 2. Node Graph Authoring

### Current state

- `GraphEditorState`, `GraphNodeState`, and `GraphParamState` are defined in `src/types.ts` with defaults in `DEFAULT_GRAPH_STATE`.
- `useNodeRegistry` (`src/hooks/useNodeRegistry.ts`) now loads schemas from `@vizij/node-graph-react`; `App.tsx` grabs `registry` and passes it to `GraphEditor`.
- `graphStateToSpec` in `src/utils/orchestratorConverters.ts` converts editor state into the orchestrator `GraphRegistrationInput`.
- The old `GraphEditor.tsx` (staged) still edits `GraphRegistrationInput` directly—working tree hasn’t implemented the state-based version yet.

### Remaining tasks

- Replace `src/components/GraphEditor.tsx` with a state-driven editor:
  - Drive the UI from `GraphEditorState`; when mutating nodes, clone state slices before calling `onChange`.
  - Populate node type dropdowns from the node registry (group by `category`, show friendly names, respect `loading`/`error`).
  - Render params and ports based on schema metadata:
    - Params → use `ValueField` according to declared types; allow per-param `ValueKind` overrides where needed.
    - Inputs/outputs → show slot pickers, handle variadic ports (add/remove rows).
  - Provide JSON editors for input/output shape overrides with validation feedback similar to the animation editor.
  - Add add/remove node controls and collapsible cards that summarize node type + connections when closed.
- Make sure `GraphEditor` returns `GraphEditorState`; `App.tsx` already holds `graphState` so the orchestrator bridge can serialize it later.
- Consider adding helper converters (`graphSpecToState`) if we ever need to ingest existing graphs.

---

## 3. Orchestrator Bridge Integration

### Current state

- `App.tsx` now passes `animationState` / `graphState` to `OrchestratorPanel`, but the panel still expects `AnimationRegistrationConfig` and `GraphRegistrationInput`.
- `animationStateToConfig` and `graphStateToSpec` exist but are not used yet; `orchestratorDefaults.ts` exposes default output paths.
- The existing bridge logic (`OrchestratorPanel.tsx`) clones configs before registering and manages connect/update/disconnect flows.

### Remaining tasks

- Update `OrchestratorPanel` props to accept editor state instead of orchestrator configs.
  - Before calling `registerAnimation` / `registerGraph`, convert state → config via the helpers. Pass the selected output path to `graphStateToSpec`.
  - Ensure conversions are cloned so the orchestrator never mutates editor state objects.
- Fix the compile break introduced when `App.tsx` switched props (types currently don’t match).
- Validate component-output mapping still works after state conversion (numbers, vectors, colors, transforms, etc.).
- Optional: layer in simple playback controls (`pause`, `step`) once the core wiring is stable.

---

## 4. Animatable Catalog & Data Sync

### Current state

- `useAnimatableList` now returns typed `AnimatableListGroup`s (`src/hooks/useAnimatableList.ts`).
- `buildAnimatableOptions` expands vector/color/quaternion animatables into per-component options; `updateTracksForSelectedAnim` coerces keyframes to the proper `ValueKind`.
- `App.tsx` refreshes options on namespace changes and seeds the editor state via defaults.

### Remaining tasks

- Hook the rebuilt `AnimationEditor` up to component slices (allow targeting `animId::component` when available, display friendly suffixes).
- Keep namespace filtering intact—confirm the registry only exposes animatables for the selected namespace.
- Add user feedback when animatable defaults are missing or when a track’s `valueKind` doesn’t align with the selected option.
- Ensure track state updates propagate when the user switches the animatable target mid-authoring.

---

## 5. Value / Shape Handling

### Current state

- `defaultValueForKind`, `valueToJSON`, and `jsonToValue` utilities provide conversions between UI state and orchestrator formats.
- `ValueField` renders editors for every `ValueKind`; it supports dynamic-length vectors and transform editing.
- `animationStateToConfig` / `graphStateToSpec` rely on `valueToJSON`; `parseShapeJson` inside the converter swallows errors but doesn’t surface them to the UI yet.

### Remaining tasks

- Integrate `ValueField` into both editors (tracks + graph params) once they’re rebuilt.
- Surface parse errors for `shapeJson`/custom JSON values directly in the UI (e.g., red border + error message) while preserving the user’s raw input.
- Confirm value conversion edge cases (custom JSON strings, transform sub-objects, large vector arrays) round-trip correctly.
- If we plan to load existing configs, add the inverse helpers (`configToAnimationState`, `specToGraphState`) so the editors can hydrate from orchestrator outputs.

---

## 6. UI Polish & Documentation

- Restore collapsible styling for tracks/nodes (CSS scaffolding for `.track`, `.graph-node`, etc. already exists in `src/styles.css`).
- Write brief summaries in collapsed cards so users can scan large graphs quickly.
- Once the editors are functional, update `apps/demo-render-no-rig/README.md` (or the main docs) with authoring instructions and orchestrator bridge usage.
- Clarify mapping guidance in the orchestrator panel (how to target transforms, vector components, etc.).

---

## 7. Testing & Validation

- Type-check/build the app after the editors compile (`pnpm build --filter demo-render-no-rig` or equivalent) to catch lingering type errors.
- Manually exercise the flow: edit animation/graph, connect via orchestrator, tweak gain/offset inputs, and verify the face reacts.
- Smoke-test wasm loading (StrictMode off) and confirm the Vite wasm config still works.
- Consider adding lightweight serialization tests for the new converters to ensure `AnimationEditorState` / `GraphEditorState` stay compatible with the orchestrator APIs.

Complete these tasks to finish the typed inline authoring experience and restore orchestrator integration.
