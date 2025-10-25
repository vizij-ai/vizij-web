# Vizij Authoring Demo – Authoring Surface Update Plan

## Goals
- Remove the manual “Add standard input” flow by auto-provisioning rig inputs for every animatable property.
- Increase information density in the feature tree while keeping the authoring experience navigable via nested collapsible groups.
- Let rig authors focus on relevant inputs by filtering the rig mapping list to specific shape groups.

## Scope Overview
- Automatic standard rig input generation and per-property toggles.
- Hierarchical feature tree UX refresh.
- Rig mapping filter controls keyed by root input group.

## Implementation Plan

### 1. Automate Standard Rig Input Generation
- **Inventory animatable fields**: Extend `apps/demo-vizij-authoring/src/components/animatable-panel/useFeatureCatalogue.ts` (or add a sibling utility) to expose, for each renderable element, the feature name, animatable id, individual property keys (scalar or component), and value constraints needed to seed inputs.
- **Introduce an auto-input generator**: In `apps/demo-vizij-authoring/src/hooks/useRigController.ts`, add a memoised builder that maps the catalogue entries into standard rig inputs using the `/ShapeName/feature/property` path convention. Reuse `createStandardRigInput` and derive human-friendly labels from the generated path.
- **Persist toggle state**: Replace the current `standardInputs` array state with a structure that distinguishes auto-generated inputs from user-defined overrides, e.g. `{ input: StandardRigInput, source: "auto" | "custom", disabled?: boolean }`. Keep supporting legacy saved rigs by migrating persisted JSON in `loadRigState` and defaulting `disabled` to `false`.
- **Sync on scene changes**: When the available animatables change (scene load, toggling animation), reconcile the auto-generated set with existing state: add new inputs, mark missing ones as disabled, and preserve any manual edits to labels/ranges.
- **Expose a toggle API**: Replace `handleCreateStandardInput` / `handleDeleteStandardInput` usage with a new `handleToggleStandardInput(path: string, enabled: boolean)` that flips the `disabled` flag and clears bindings when turning an input off.
- **Update persistence**: Ensure `saveRigState` writes the new shape `{ standardInputs: { id, path, label, disabled }[] }` format and still stores custom inputs verbatim so older exports remain editable.

### 2. Rig Mapping UI Refresh
- **Remove the add/delete affordances**: In `apps/demo-vizij-authoring/src/components/animatable-panel/StandardInputsSection.tsx`, replace the “Add standard input” button and delete icon with a compact enable/disable toggle per entry. Show disabled inputs in a secondary state so they can be re-enabled quickly.
- **Display hierarchical metadata**: Surface the `/Shape/feature/property` structure in the list (e.g. `Shape` badge + `feature • property`) to tie the inputs back to the tree view.
- **Integrate filter dropdown**: Compute the unique root segments (first path token) inside the section component. Add a multi-select dropdown (or tag selector) that controls which roots render. Persist the selected roots in rig state so the authoring session restores the same focus.
- **Wire bindings to toggle changes**: When an input is disabled, automatically call `onBindingInputChange(targetId, null)` for any mappings referencing the input so the rig author sees the update reflected immediately.

### 3. Nested Feature Tree Layout
- **Define tree data**: Extend the catalogue hook to emit a nested structure: `Shape -> Feature -> Animatable -> Field -> Property`. Include references required to drive updates (animatable id, component key, binding target id, etc.).
- **Refactor UI components**: Replace `FeatureGroupList`, `FeatureRow`, `NumericFeatureBody`, and `VectorFeatureBody` with a set of smaller tree-aware components (e.g. `ShapeNode`, `FeatureNode`, `AnimatableNode`, `FieldNode`, `PropertyControls`). Each node should render its header row plus an expandable body div per the spec.
- **Manage collapse state**: Move collapsed-state tracking into a dedicated reducer (e.g. `useAnimatableTreeState`) that stores expanded flags for each node type. Provide sensible defaults (fully expanded) and remember state in local storage to avoid user frustration.
- **Reorganise control panels**: Within `PropertyControls`, lay out the sections in the required order: animatable metadata (name/label), animatable properties (min/default/max), control mapping properties (input id, toggles, remap values), and the control slider preview. Reuse existing subcomponents where possible to avoid regressions.
- **Refresh styling**: Update `apps/demo-vizij-authoring/src/styles.css` (and any component-specific styles) to support the denser tree layout—smaller paddings, clear indentation, and consistent disclosure icons. Confirm the styling still works in dark/light themes if applicable.

### 4. Rig Mapping Filter & Preview
- **Dropdown plumbing**: Store the selected root paths inside `useRigController` so other consumers (e.g. export routines) can access them if needed. Default to “All” when nothing is selected.
- **Filter derived data**: Update the memoised selectors that feed `BindingMatrix` and `RigPreview` so they only include inputs whose root is active. Ensure input ranges and usage chips respect the filter to avoid stale UI.
- **Empty state messaging**: Provide clear messaging when the filter hides every input (“No inputs for L_Eye yet. Enable the toggle in the feature tree to add one.”) so authors understand how to recover.

### 5. Migration & Validation
- **Interaction QA**: Verify toggling animation on/off regenerates inputs correctly, collapsed state persists, and disabling an input removes its binding.
- **Authoring export smoke test**: Run the existing export workflow and ensure the new state shape serialises/deserialises cleanly.
- **Lint/type coverage**: Run `pnpm run lint`, `pnpm run typecheck`, and the relevant demo build targets after refactors to catch regressions.

### 6. Follow-Up Considerations (Optional)
- Evaluate surfacing aggregate controls (enable/disable all inputs for a root) once the base toggles ship.
- Consider lazy-loading large trees if performance becomes a concern with dense scenes.
- Revisit naming heuristics for auto-generated labels once authors try the `/Shape/feature/property` format in practice.
