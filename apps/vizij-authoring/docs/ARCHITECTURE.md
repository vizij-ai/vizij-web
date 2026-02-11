# Vizij Authoring Architecture

Last updated: 2026-02-11
Audience: engineers familiar with Vizij/runtime concepts who are new to the `vizij-authoring` codebase.

## Purpose

`vizij-authoring` is the runtime-truthful authoring app for Vizij assets.

It is designed to let users:

- import GLB assets and graph payloads,
- author and inspect rig bindings,
- author and import/export pose rigs,
- validate behavior against live runtime wiring,
- export bundle-ready outputs.

The architecture prioritizes deterministic data flow from authored state to runtime graph evaluation, while keeping UI concerns decoupled from graph/build logic.

## Guiding Principles

1. Runtime-truthful authoring.
   The editor should represent what runtime executes. Graph/build outputs and runtime input staging drive the UI, not separate mock state.

2. Separation of domains.
   Scene rendering data, rig authoring state, pose authoring state, and transient UI layout state are isolated in separate stores/providers.

3. Explicit migration safety.
   Import and remap flows must be safe, conflict-aware, and explainable. Discrepancy review is first-class.

4. Compose from reusable hook/service modules.
   Complex logic (import, graph build, binding mutation, pose conversion) lives in hooks/services, not deeply inside UI components.

## Dependency Context

## External and workspace libraries

`apps/vizij-authoring/package.json` + import graph show these core dependencies.

Vizij packages:

- `@vizij/render`
  - world/animatable store, GLB loading, export helpers, render-side state.
- `@vizij/node-graph-authoring`
  - binding models, graph builders, IR compile/report utilities.
- `@vizij/node-graph-wasm`
  - GraphSpec typing/normalization and metadata signatures.
- `@vizij/node-graph-react`
  - value JSON conversion helpers and graph runtime interop types.
- `@vizij/runtime-react`
  - pose-rig config types used in runtime graph state.
- `@vizij/utils`
  - standard input conventions, path normalization, animatable helpers.
- `@vizij/authoring-shared`
  - shared dialogs/file IO/path suggestion helpers.

UI/runtime shell libraries:

- React 19 + TypeScript
- Zustand (workspace/store utilities)
- `react-resizable-panels` (workspace layout)
- `@base-ui/react`, Radix bits, `lucide-react`, `react-colorful`

Strategic intent:

- heavy graph/model logic is delegated to Vizij shared packages,
- app-level code focuses on orchestration, UI state, and app-specific workflows.

## Startup and Provider Tree

Entry point:

- `apps/vizij-authoring/src/main.tsx`

Boot sequence:

1. Create Vizij render store via `createVizijStore()`.
2. Wrap app in `VizijContext.Provider`.
3. Render `App`.

Provider composition inside `App`:

1. `RigControllerProvider`
   - central rig/runtime orchestration and bridge to binding/selection/graph stores.
2. `PoseRigProvider`
   - pose authoring state synchronized with current standard inputs and runtime face context.
3. `AuthoringUiProvider`
   - workbench and modal/export UI flags.
4. `ReferenceFaceProvider`
   - reference face context for standard feature space mapping workflows.

Why this structure:

- `RigControllerProvider` must be outermost for downstream consumers (`PoseRigProvider`, inspector/panels) to access canonical authoring/runtime state.
- Pose logic sits on top of rig state so it can derive from current visible standard inputs.
- UI-level mode toggles remain independent and lightweight.

## State Architecture

The app uses multiple stores with clear ownership.

## 1) Render/runtime state (`@vizij/render` store)

Primary source for:

- loaded world graph,
- animatable descriptors,
- live values and selection,
- load/export operations.

Consumed via `useVizijStore` / `useVizijStoreSetter` / `useVizijStoreGetter`.

## 2) Graph runtime store

File:

- `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`

Exposes runtime-facing state and actions:

- health/status: `graphStatus`, `graphError`, `graphWarning`,
- active specs: `graphSpec`, `poseGraphSpec`, `poseConfig`,
- diagnostics: `graphInsights`, `graphMachineReport`, discrepancy state,
- runtime-facing actions: `handleImportGraphSpec`, `handleFaceIdChange`, playback actions, `getGraphIr`.

Purpose:

- single source for graph/runtime lifecycle and diagnostic surfacing.

## 3) Binding authoring store

File:

- `apps/vizij-authoring/src/state/bindingAuthoringStore.tsx`

Exposes authoring graph state and mutation APIs:

- input universe: `managedStandardInputs`, `standardInputs`, lookup maps,
- binding graphs: `bindings` and `inputBindings`,
- compile diagnostics: `bindingIssues`,
- authoring mutations: slot edits, expression edits, input linking, input create/clone/disable/delete, parent binding edits,
- scene projections: `sceneObjects`, `sceneObjectRoots`,
- UI-assist flags: hidden drivers, selected rig/material.

Purpose:

- central API surface for all rig/binding UI components.

## 4) Selection store

File:

- `apps/vizij-authoring/src/state/selectionStore.tsx`

Tracks render selection stack and actions:

- `selectionStack`, `handleFocusSelectionIndex`, `handleClearSelection`.

Purpose:

- decouple multi-selection stack management from UI consumers.

## 5) Pose rig store and provider

Files:

- `apps/vizij-authoring/src/poseRig/store.tsx`
- `apps/vizij-authoring/src/state/PoseRigProvider.tsx`
- `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts`

Provides pose-domain state:

- neutral/current inputs,
- pose library definitions,
- pose graph/config draft outputs,
- rig kind/blend mode,
- pose import/export actions.

Synchronization:

- provider filters hidden standard inputs,
- syncs face id and standard inputs from binding/runtime stores,
- normalizes and forwards pose graph spec into graph runtime store.

Purpose:

- keep pose authoring pipeline isolated but in sync with active rig authoring model.

## 6) UI/workbench state

Files:

- `apps/vizij-authoring/src/state/AuthoringUiProvider.tsx`
- `apps/vizij-authoring/src/state/workspaceStore.ts`

Responsibilities:

- active workbench tab,
- export options and discrepancy-check flags,
- panel visibility/layout toggles.

Purpose:

- avoid polluting rig/runtime stores with purely presentational state.

## 7) Reference face state

Files:

- `apps/vizij-authoring/src/state/ReferenceFaceContext.tsx`
- `apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`

Responsibilities:

- reference face file/load state,
- reference standard inputs + bindings coverage,
- reference input playback bridge.

Purpose:

- keep standard-feature-space comparison flow independent from main rig authoring state.

## Core Data Flow

## A. Asset load and baseline setup

Key files:

- `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts`
- `apps/vizij-authoring/src/App.tsx`

Flow:

1. Load GLB (file or URL) through loader helper.
2. Populate render store world/animatables.
3. Capture root id + source metadata.
4. Bundle synchronizer imports embedded rig graph and pose config if present.

## B. Bundle synchronization

Key file:

- `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts`

Flow:

1. Fingerprint loaded bundle payload.
2. Import rig graph (GraphSpec/IR-prepared) once per fingerprint.
3. Apply discrepancy rules and optional skip-check behavior.
4. Import pose config after rig import settles and face id is consistent.

## C. Rig authoring -> graph build -> runtime spec

Key files:

- `apps/vizij-authoring/src/hooks/useRigController.ts`
- `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts`

Flow:

1. Build `BindingMap`/`InputBindingMap` from authoring edits.
2. Build rig graph via `buildRigGraphSpec`.
3. Resolve runtime spec source:
   - prefer IR compile output,
   - fallback to legacy spec with warning on recoverable IR issues,
   - block and preserve last-known-good on unrecoverable compile failure.
4. Publish status/errors/warnings and machine report into graph runtime store.

## D. Input staging and runtime output application

Key files:

- `apps/vizij-authoring/src/hooks/useRigController.ts`
- `apps/vizij-authoring/src/hooks/graphRuntime.ts`

Flow:

1. Input changes update `inputValues`.
2. Resolver maps input ids to graph paths.
3. `stageRuntimeInput` pushes values to runtime graph bridge.
4. Runtime writes are converted back into raw animatable values.
5. Values are applied to render store, with reset of no-longer-driven outputs.

## E. Pose pipeline

Key files:

- `apps/vizij-authoring/src/poseRig/services/poseConfigService.ts`
- `apps/vizij-authoring/src/poseRig/services/poseGraphService.ts`
- `apps/vizij-authoring/src/poseRig/services/poseSnapshotService.ts`
- `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`

Flow:

1. Pose library edits maintain config draft (`poseConfigDraft`).
2. Pose config compiles to pose graph spec and summary.
3. Pose import supports remap/confidence/conflict workflows.
4. Applied pose values can batch-stage into rig inputs.

## F. Scene projection and inspector traversal

Key files:

- `apps/vizij-authoring/src/scene/sceneGraph.ts`
- `apps/vizij-authoring/src/scene/useSceneComposer.ts`
- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`
- `apps/vizij-authoring/src/components/inspector/rigConnections.ts`

Flow:

1. Render world + bindings are projected into scene nodes/features/components.
2. Inspector consumes projected scene graph and binding APIs.
3. Chain routes navigate across scene/rig/pose contexts.
4. Trace layer computes transitive pose-rig-face paths and suggestions.

## Key APIs for UI Authors

These are the main APIs a new UI contributor should start with.

## `useBindingAuthoring(...)`

Primary rig authoring contract for UI components.

Read focus:

- `managedStandardInputs`, `standardInputs`, lookup maps
- `bindings`, `inputBindings`, `bindingIssues`
- `inputValues`, `hiddenDriverIds`

Write focus:

- binding slot/expression APIs,
- parent binding APIs,
- standard input lifecycle APIs,
- graph link/unlink APIs,
- value staging APIs.

File:

- `apps/vizij-authoring/src/state/bindingAuthoringStore.tsx`

## `useGraphRuntime(...)`

Primary runtime/diagnostics contract.

Read focus:

- compile status and warnings,
- active graph specs and pose config,
- discrepancy review state,
- machine report/graph insights.

Write/action focus:

- graph import,
- face id rename,
- discrepancy resolution,
- graph playback methods.

File:

- `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`

## `usePoseRig()`

Primary pose authoring contract.

Read focus:

- pose list, selected pose, neutral/current values,
- pose graph summary/spec,
- config draft/warnings.

Write focus:

- pose CRUD,
- capture/apply neutral/pose,
- import pose config/graph,
- blend mode and rig kind.

Files:

- `apps/vizij-authoring/src/state/PoseRigProvider.tsx`
- `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts`

## `useSceneComposer()`

Scene projection + edit bridge for inspector and hierarchy components.

Read focus:

- scene nodes/roots/materials and traversal helpers.

Write focus:

- feature animation/static toggles,
- animatable default/static values,
- binding input/slot edits,
- scene object and material mutation helpers.

File:

- `apps/vizij-authoring/src/scene/useSceneComposer.ts`

## `useUnifiedSelection()`

Mutually exclusive selection orchestrator across scene/pose/rig/material.

Purpose:

- keep inspector mode deterministic,
- avoid stale multi-domain selection states.

File:

- `apps/vizij-authoring/src/hooks/useUnifiedSelection.ts`

## Component Architecture Map

## App shell and layout

- `apps/vizij-authoring/src/App.tsx`
  - composition root for providers, loader, bundle sync, wizard overlays.
- `apps/vizij-authoring/src/layouts/WorkspaceLayout.tsx`
  - panel geometry and viewport split behavior.
- `apps/vizij-authoring/src/components/app/AppMenuBar.tsx`
  - top-level actions and panel visibility toggles.

## Primary panels

- Hierarchy: `src/components/panels/HierarchyPanel.tsx`
- Variables: `src/components/panels/VariablesPanel.tsx`
- Materials: `src/components/panels/MaterialsPanel.tsx`
- Inspector: `src/components/inspector/InspectorPanel.tsx` + `InspectorContent.tsx`
- Debug: `src/components/panels/DebugPanel.tsx`
- Animation: `src/components/panels/AnimationPanel.tsx`

## App-level workflows

- Export/import modals: `src/components/app/ExportDialog.tsx`, `AppWizards.tsx`
- Pose graph remap wizard: `src/components/poseRig/PoseGraphRemapWizard.tsx`
- Discrepancy wizard: `src/components/discrepancy/DiscrepancyWizard.tsx`
- Standard Feature Spaces workbench: `src/components/app/StdFeatureSpacesEditor.tsx` and related panels.

## Strategic Organization Rationale

1. `useRigController` as orchestrator.
   Why: all major side effects (graph build, runtime staging, import, diagnostics publication, store syncing) must stay coherent. A single orchestrator hook reduces ordering bugs.

2. Multi-store architecture instead of one global mega-store.
   Why: domain isolation keeps mental model clear and minimizes rerenders. Render/runtime data has different change rates and ownership than UI layout or pose config editing.

3. Scene graph projection layer (`sceneGraph` + `useSceneComposer`).
   Why: UI needs stable node/feature/component abstractions independent from low-level render world structure.

4. Service-oriented pose layer.
   Why: pose config parsing/serialization/building are durable business rules; putting them in services improves testability and keeps UI thin.

5. Explicit discrepancy/remap workflows.
   Why: migration is unavoidable in this product stage; safe, explicit resolution UI is better than hidden heuristics that can corrupt authored state.

## Dependency Boundaries

These boundaries are intentional and should guide where new logic is placed.

1. Shared Vizij package boundaries (`@vizij/*` workspace packages).

- Put reusable graph/runtime/domain behavior in shared packages when it is not specific to this app's UX.
- Examples:
  - expression/binding transform semantics -> `@vizij/node-graph-authoring`
  - GraphSpec/IR typing and normalization runtime contracts -> `@vizij/node-graph-wasm`
  - render-world and animatable primitives -> `@vizij/render`
  - common input/path/animatable utilities -> `@vizij/utils`

2. `vizij-authoring` app boundaries.

- Keep app-specific orchestration and workflows in this app.
- Examples:
  - discrepancy review UX and import apply decisions,
  - inspector chain traversal UI behavior,
  - panel/workbench composition and interaction affordances,
  - cross-store orchestration in `useRigController`.

3. Service vs component boundary inside the app.

- Put durable business logic in hooks/services (`src/hooks`, `src/poseRig/services`, `src/rig`, `src/scene`).
- Keep React components mostly declarative and driven by store/service APIs.
- If a component needs complex transformation logic, move it into a helper or hook first.

4. Store boundary rules.

- `graphRuntimeStore`: runtime graph lifecycle, status, diagnostics, import handlers.
- `bindingAuthoringStore`: rig/input/binding authoring model and mutators.
- `PoseRigStore`: pose-library/config graph domain.
- `workspaceStore` / `AuthoringUiProvider`: presentational/workbench toggles only.
- Avoid mixing presentational state into authoring/runtime stores unless it is required for deterministic domain behavior.

5. Import/export boundary rules.

- Import normalization/remap safety should happen before mutating persistent authoring state.
- Export should consume canonical authoring state and shared graph builders; avoid duplicating graph serialization logic in UI components.

## Patterns to Follow When Extending

1. Add logic in hooks/services before UI components.

- UI should consume small stable APIs.

2. Keep runtime-truthful invariant.

- If a UI control modifies authoring state, ensure it maps to staging/build semantics used by runtime.

3. Prefer binding/input helper functions over ad-hoc slot mutation.

- Use `@vizij/node-graph-authoring` mutation utilities and app wrappers.

4. Keep selection mode deterministic.

- Route new selection actions through `useUnifiedSelection` patterns.

5. Add targeted tests for new workflows.

- Prefer colocated tests near changed logic/components.

## Testing and Validation Model

App-level validate command:

- `pnpm --filter vizij-authoring run validate`
  - `lint`
  - `typecheck`
  - `test`

Test style:

- unit tests around services/helpers,
- focused component tests for routing and critical interaction contracts,
- hook tests for import/export/runtime edge cases.

## Common Onboarding Path

For a new engineer, recommended read order:

1. `apps/vizij-authoring/src/App.tsx`
2. `apps/vizij-authoring/src/hooks/useRigController.ts`
3. `apps/vizij-authoring/src/state/bindingAuthoringStore.tsx`
4. `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`
5. `apps/vizij-authoring/src/state/PoseRigProvider.tsx`
6. `apps/vizij-authoring/src/poseRig/store.tsx`
7. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
8. `apps/vizij-authoring/src/components/inspector/rigConnections.ts`
9. `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`
10. `apps/vizij-authoring/src/hooks/useVizijExport.ts`

After that, pick one panel and follow its store/hooks wiring end-to-end.

## Related Docs

- `apps/vizij-authoring/docs/README.md`
- `apps/vizij-authoring/docs/plans/GOAL.md`
- `apps/vizij-authoring/docs/plans/TRACKER.md`
- `apps/vizij-authoring/docs/plans/BACKLOG.md`
- `apps/vizij-authoring/docs/notes/SYNTHESIS.md`
- `apps/vizij-authoring/docs/notes/pr-draft-p0-p1-for-saad.md`
- `apps/vizij-authoring/docs/notes/CONTRIBUTOR_APPENDIX.md`
