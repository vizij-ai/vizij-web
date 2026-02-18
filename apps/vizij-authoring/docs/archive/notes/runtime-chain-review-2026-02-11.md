# Runtime Chain and Import Review

Date: 2026-02-11
Compared branches: `chris-work` vs `vizij_workspace_as_authoring`
Legacy UX reference: `main` branch `apps/vizij-authoring` inspector flow
Status: historical deep review; most P0/P1 findings are resolved, remaining architecture items are tracked in `plans/TRACKER.md` and `plans/BACKLOG.md`.

## Scope

This review focused on:

1. Import process correctness and migration UX.
2. IR -> GraphSpec runtime path correctness.
3. Editor chain visibility from poses -> rig inputs -> animatable targets.
4. Driver authoring behavior, especially leaf-property targeting.
5. Documentation accuracy for done/not-done backlog items.

## Validation Run

- `pnpm --filter vizij-authoring typecheck` -> pass
- `pnpm --filter vizij-authoring test -- src/components/inspector/rigConnections.test.ts src/hooks/__tests__/usePoseGraphImport.test.ts src/utils/graphDiff.test.ts src/hooks/__tests__/useVizijExport.test.tsx` -> pass (21 tests)

## Executive Summary

The branch has meaningful progress in migration tooling:

- import face mismatch auto-resolution is now deterministic by residual diff,
- pose output remap has confidence + conflict handling,
- pose->rig->face trace has actionable suggestions and apply actions,
- runtime/IR fallback path remains coherent.

However, there are still critical correctness/authoring gaps:

1. Rig "Add Driven Variable" still binds whole features (e.g. translation x/y/z together), not leaf channels.
2. Variables pane does not expose all path-backed variables (it currently only lists `custom` main-face rig inputs).
3. Old `main` inspector workflows for feature animated/static state, driver lists, and binding expression editing are not exposed in the active UI path.
4. UI summaries are inconsistent about indirect chains: some views are graph-aware (`collectRigDependents`), others are still direct-only.
5. Runtime graph clear/removal semantics can keep stale controllers alive.
6. Staged runtime inputs can miss first-ready replay when runtime bridge initializes later.

## Findings (By Severity)

### F1 - Critical: Add Driven Variable is feature-level, not leaf-level

In rig inspector mode, selecting a property drives every component in the feature:

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:746`
- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:753`
- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:756`

The selector only returns `{ objectId, featureId }`, not component/leaf identity:

- `apps/vizij-authoring/src/components/inspector/VariableSelector.tsx:13`
- `apps/vizij-authoring/src/components/inspector/VariableSelector.tsx:353`

Result: choosing translation as driven binds x, y, and z together. This is exactly the regression callout.

### F2 - High: Variables pane does not represent all path-backed variables

`VariablesPanel` includes only `managedStandardInputs` where source is `custom` for main face:

- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:253`

Auto/preset standard inputs (which still have paths and can be part of rig/pose/runtime chains) are not listed as first-class variables there. This conflicts with the requirement that everything path-backed should be visible and selectable as a variable.

### F3 - High: Chain surfacing is partially upgraded, but still inconsistent

Good:

- `collectRigDependents` now traverses `inputBindings` transitively and correctly reports indirect rig dependents:
  - `apps/vizij-authoring/src/components/inspector/rigConnections.ts:126`
  - `apps/vizij-authoring/src/components/inspector/rigConnections.ts:166`
  - `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:738`

Gaps:

- Top "Connected To" summary in `BindingConnections` still starts from direct animatable slot bindings (then infers poses only from those direct ids):
  - `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx:50`
  - `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx:77`
- Pose grouping in inspector similarly resolves via direct binding slots and can label indirect-chain variables as unassigned:
  - `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:185`

The newer trace panel is chain-aware, but primary summaries are not fully aligned with it.

### F4 - High: Main inspector parity regressions (feature state + binding editor UX)

The legacy app on `main` had a unified object inspector with tabs for:

- Drivers,
- Bindings (including `BindingEditor` per feature/leaf),
- Default animatable properties (static/animated toggles and default/constraint controls).

Main references:

- `main:apps/vizij-authoring/src/components/inspector/ObjectInspector.tsx`
- `main:apps/vizij-authoring/src/components/inspector/FeatureList.tsx`
- `main:apps/vizij-authoring/src/components/inspector/DriverPanel.tsx`
- `main:apps/vizij-authoring/src/components/inspector/DriverBindingSection.tsx`

Current branch still contains some of these components, but active inspector flow is now `InspectorContent`-driven and does not route users to the feature-level `BindingEditor`/matrix workflows:

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:110`
- `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`

Impact:

- no active UI path to the old per-feature binding-expression authoring model,
- reduced direct visibility/editability for static vs animatable feature state,
- driver-chain editing is summarized/traced but not fully authorable from one place.

### F5 - High: Runtime graph clear/remove semantics can keep stale graphs

Bridge emits `undefined` when graph payload is absent:

- `apps/vizij-authoring/src/components/app/Viewer.tsx:37`

Runtime provider merges incoming bundle with existing bundle:

- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2032`
- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2034`
- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2035`

So `undefined` means "keep previous" rather than "clear". This can leave stale controllers running after removal/invalid transitions.

### F6 - High: Runtime input staging can miss first-ready replay

`stageInputsFromState` calls optional bridge function:

- `apps/vizij-authoring/src/hooks/useRigController.ts:1375`
- `apps/vizij-authoring/src/hooks/useRigController.ts:1383`

Replay effect depends on `graphInputDefaults` + `graphStatus`, not `stageRuntimeInput` readiness:

- `apps/vizij-authoring/src/hooks/useRigController.ts:2139`

Bridge setter appears later when runtime flips ready:

- `apps/vizij-authoring/src/components/app/Viewer.tsx:16`
- `apps/vizij-authoring/src/components/app/Viewer.tsx:17`

If graph was already ready before bridge function is installed, first staging can be skipped until manual input interaction.

### F7 - Medium: `exportPoseGraphFile` still has uncaught build failure path

GLB export has guarded build:

- `apps/vizij-authoring/src/hooks/useVizijExport.ts:227`

Pose-graph-file export does not:

- `apps/vizij-authoring/src/hooks/useVizijExport.ts:334`
- `apps/vizij-authoring/src/hooks/useVizijExport.ts:342`

Build exceptions can bubble before user-facing dialog.

### F8 - Medium: Import/remap coverage has improved, with notable constraints

Implemented improvements:

- face mismatch auto-resolve only after namespace rewrite + empty residual diff:
  - `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:269`
  - `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:286`
  - `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:295`
- order-insensitive canonical graph comparison:
  - `apps/vizij-authoring/src/utils/graphDiff.ts:69`
- remap suggestions with confidence/rationale and conflict blocking:
  - `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts:192`
  - `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts:285`

Constraint to document:

- import remap rows are filtered by active delta inputs when available:
  - `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts:111`

This means non-active outputs may not appear in remap UI.

## Computational Explainer

### 1) Authoring data model

The editor models chain relationships in three layers:

1. `standardInputs` (path-backed variables).
2. `inputBindings` (rig input depends on upstream rig inputs).
3. `bindings` (animatable target depends on rig input slots).

Poses write values keyed by input id; neutrals define deltas.

### 2) Rig graph build and IR

Rig authoring state is compiled by `buildRigGraphSpec(...)` into:

- legacy GraphSpec (`rigGraphBuild.spec`)
- IR build object (`rigGraphBuild.ir`)
- issues/summary

See:

- `apps/vizij-authoring/src/hooks/useRigController.ts:1273`

### 3) Runtime spec resolution (IR-first with fallback)

`resolveRuntimeGraphSpec(...)` chooses runtime payload:

1. If IR exists: compile with `preferLegacySpec: false`.
2. If compile has issues: fall back to legacy spec with warning.
3. If compile fails/no spec: block and use last-known-good runtime spec when available.
4. If no IR: use legacy spec.

See:

- `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:15`
- `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:23`
- `apps/vizij-authoring/src/hooks/useRigController.ts:1296`
- `apps/vizij-authoring/src/hooks/useRigController.ts:1996`

### 4) Runtime application path

Resolved runtime spec is pushed to graph runtime store:

- `apps/vizij-authoring/src/hooks/useRigController.ts:1322`

Viewer bridge publishes graph payload to runtime provider:

- `apps/vizij-authoring/src/components/app/Viewer.tsx:35`
- `apps/vizij-authoring/src/components/app/Viewer.tsx:60`

Runtime provider registers rig/pose graph controllers; if IR-only asset is present, it can compile IR at registration time too:

- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:438`
- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:1394`
- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:1458`

### 5) Import and migration mapping path

Rig graph import:

1. rehydrate authoring state from imported graph,
2. rebuild canonical graph from rehydrated state,
3. diff imported vs rebuilt canonical forms,
4. if needed, attempt deterministic face namespace rewrite and auto-accept only if residual diff is empty.

See:

- `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:102`
- `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:205`
- `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:259`

Pose graph import/remap:

1. normalize/remap imported paths to face segment,
2. classify outputs into auto/review rows,
3. rank candidates by path/id similarity,
4. apply remap by output-path rewrite + input-id remap,
5. block conflicting many-to-one source->target assignments.

See:

- `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts:90`
- `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts:192`
- `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts:249`

## Editor Chain Surfacing: What Is and Is Not Visible

### Working surfaces

- Rig dependents list in rig inspector is now transitive (`inputBindings` aware).
- Pose-Rig-Face trace panel shows:
  - direct + upstream rig chain,
  - matched/unmatched pose outputs,
  - suggested fixes (link parent binding / retarget pose output),
  - one-click apply and safe bulk apply.

### Incomplete surfaces

- "Connected To" top summaries are still direct-slot-centric.
- Pose grouping can miss indirect chain ownership.
- Add-driven interaction remains feature-level, not component/leaf-level.
- Variables panel does not expose all path-backed inputs.
- Active inspector flow does not expose the legacy per-feature binding editor path that existed on `main`.

Net: trace tooling is strong, but everyday authoring entry points (Variables + Add Driven + top summaries + direct binding-expression editing) are not yet chain-complete.

## Main Branch Legacy Inspector Comparison

This follow-up explicitly compared current UI with `main`'s old app (the intended reference point).

What `main` did better for chain authoring:

1. Feature-level static/animated control matrix in inspector.
2. Direct access to `BindingEditor` per feature component for slots, aliases, value types, and expressions.
3. Driver list with grouped sliders, hidden-driver controls, and upstream driver visibility.
4. Driver-to-driver binding editor path (`DriverBindingSection`) for higher-order driver expressions.

Current status:

1. Data/model still supports much of this (`sceneGraph`, bindings, inputBindings, `BindingEditor` implementation).
2. Active inspector routing (`InspectorContent`) does not expose equivalent end-to-end editing surfaces.
3. Some legacy inspector components remain in tree but are effectively dormant in the current flow.

Main references:

- `main:apps/vizij-authoring/src/components/inspector/ObjectInspector.tsx`
- `main:apps/vizij-authoring/src/components/inspector/FeatureList.tsx`
- `main:apps/vizij-authoring/src/components/inspector/DriverPanel.tsx`
- `main:apps/vizij-authoring/src/components/inspector/DriverBindingSection.tsx`

Current references:

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

## Backlog Mapping (Done vs Not Done)

### Done or largely done

- import review auto-rename + order-insensitive matching
- pose output remap with confidence + conflict handling
- actionable trace suggestions with apply actions (partial vs final UX criteria)
- false "No Driven properties" diagnostics for indirect rig chains
- IR fallback and runtime warning path consistency

### Not done / still blocking

- runtime graph clear/remove semantics
- runtime input restage when bridge becomes ready late
- guard `exportPoseGraphFile` build failures
- leaf-level variable/driven selection and binding
- all path-backed variables visible and selectable in Variables pane
- consistent chain-aware summaries across inspector surfaces
- restore direct binding-expression authoring surfaces from legacy `main` inspector flow
- restore clear static vs animatable feature editing affordances in active inspector path
- trace apply UX still missing preview/undo and explicit ignore flows

## Recommended Next Steps (Priority)

1. **Leaf-first authoring model**
   - Extend selector types to include component/leaf identity.
   - Add explicit "feature" vs "component" selection modes.
   - In `handleAddRigDrivenVariable`, bind exactly one selected leaf target unless user explicitly chooses "bind all components".

2. **Variables pane parity**
   - Show all path-backed standard inputs (`auto`, `preset`, `custom`) with source badges/filters.
   - Keep custom/create workflows, but do not hide auto/preset variables.

3. **Chain UI consistency**
   - Rebase top summaries on transitive chain graph (`inputBindings` traversal), not only direct slots.
   - Align pose grouping logic with same traversal.
   - Restore/replace legacy `main` inspector affordances for direct binding expression editing in active flows.

4. **Restore legacy authoring affordances from `main`**
   - Reintroduce explicit static-vs-animatable editing surfaces (or equivalent) in active inspector modes.
   - Reintroduce direct feature/leaf binding editing (slots + expressions), not just chain diagnostics.

5. **Runtime correctness follow-ups**
   - Implement explicit graph clear API semantics in runtime provider and bridge payloading.
   - Trigger input restage when `stageRuntimeInput` transitions undefined -> defined while graph is ready.

6. **Migration UX hardening**
   - Add dry-run preview + undo-safe apply in trace suggestion actions.
   - Add explicit ignore/dismiss affordance for low-confidence suggestions.
