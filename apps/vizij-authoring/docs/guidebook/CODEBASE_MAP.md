# Codebase Map

Last updated: 2026-02-20

This map describes the primary source directories for
`apps/vizij-authoring/src` and the responsibilities of each area.

## App Entry and Layout

1. `apps/vizij-authoring/src/App.tsx`
   - Top-level app composition.
   - Wires providers, workspace layout, import/export surfaces, and runtime bridge.
2. `apps/vizij-authoring/src/layouts/WorkspaceLayout.tsx`
   - Shell that arranges left/center/right authoring panels.

## State Ownership

1. `apps/vizij-authoring/src/state/RigControllerProvider.tsx`
   - Provides rig runtime + binding authoring + graph runtime state APIs.
2. `apps/vizij-authoring/src/state/PoseRigProvider.tsx`
   - Bridges pose-rig authoring state into runtime graph/config surfaces.
3. `apps/vizij-authoring/src/state/rigUiStore.tsx`
   - UI-only rig filtering/selection state.
4. `apps/vizij-authoring/src/state/workspaceStore.ts`
   - Panel visibility and workspace-level layout state.
5. `apps/vizij-authoring/src/state/AuthoringUiProvider.tsx`
   - App-level UI settings and toggles (including discrepancy behavior).

## Core Authoring Domains

1. `apps/vizij-authoring/src/rig/*`
   - Rig graph import/export/persistence/domain logic.
2. `apps/vizij-authoring/src/poseRig/*`
   - Pose config/IR/store/services and pose graph compile pipeline.
3. `apps/vizij-authoring/src/scene/*`
   - Scene hierarchy + selection + edit operations.

## Hooks and Orchestration

1. `apps/vizij-authoring/src/hooks/useRigController.ts`
   - Central rig orchestration hook.
2. `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts`
   - Auto-applies bundle graph/pose imports to active authoring state.
3. `apps/vizij-authoring/src/hooks/useBundleGraphMaintenance.ts`
   - Debug-panel bundle graph overwrite/rename orchestration.
4. `apps/vizij-authoring/src/hooks/useMachineReportDiff.ts`
   - Diagnostics report diff, parsing, and report template orchestration.
5. `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts`
   - GLB load and root resolution flow.

## UI Surfaces

1. `apps/vizij-authoring/src/components/app/*`
   - App-level shell panels, diagnostics, import/export dialogs, viewer wrappers.
2. `apps/vizij-authoring/src/components/panels/*`
   - Docked workspace panels (hierarchy, variables, debug, animation).
3. `apps/vizij-authoring/src/components/inspector/*`
   - Inspector-chain and section-level editors.
4. `apps/vizij-authoring/src/components/poseRig/*`
   - Pose-rig-specific UX components and wizard flows.
5. `apps/vizij-authoring/src/components/scene-composer/*`
   - Shared hierarchy tree state/filtering helpers for scene surfaces.

## Utilities and Types

1. `apps/vizij-authoring/src/utils/*`
   - Shared pure helpers for import/export/path/graph/runtime utilities.
2. `apps/vizij-authoring/src/types/*`
   - Shared type contracts for import outcomes and cross-domain payloads.

## Main Data Flows

1. Asset import:
   - `useVizijAssetLoader` -> `RigControllerProvider` stores -> runtime viewer.
2. Bundle sync:
   - `useBundleSynchronizer` -> rig graph import + pose config import -> runtime.
3. Pose authoring:
   - `poseRig/store.tsx` -> `PoseIrService`/`PoseGraphService` -> runtime pose graph.
4. Diagnostics:
   - `GraphDiagnosticsPanel` + `useMachineReportDiff` + runtime report stores.
