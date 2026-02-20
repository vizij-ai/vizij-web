# Modularity and DRY Opportunities

Last updated: 2026-02-20

This list tracks concrete opportunities to improve modularity and reduce
duplication. Keep items file-specific so they are actionable.

Status legend:

1. `open` - not started
2. `in_progress` - partially extracted
3. `done` - completed

## Opportunities

1. `done` - Extract App-level file import handlers into a focused hook.
   - Current files:
     - `apps/vizij-authoring/src/App.tsx`
   - Why:
     - `App.tsx` still owns hidden-input refs and skip-check import flow details.
   - Target:
     - `useImportFileHandlers` or equivalent hook to isolate imperative file input plumbing.
   - Landed:
     - `apps/vizij-authoring/src/hooks/useImportFileHandlers.ts`
     - `apps/vizij-authoring/src/hooks/__tests__/useImportFileHandlers.test.ts`

2. `done` - Split `PoseRigProvider` sync effects into explicit sync hooks.
   - Current files:
     - `apps/vizij-authoring/src/state/PoseRigProvider.tsx`
   - Why:
     - Multiple large effects mix standard-input sync, schema sync, and neutral/current pruning.
   - Target:
     - Extract `usePoseRigStoreStateSync` and `usePoseRigNeutralSync` style boundaries.
   - Landed:
     - `apps/vizij-authoring/src/state/usePoseRigStoreSync.ts`
     - `apps/vizij-authoring/src/state/PoseRigProvider.tsx`

3. `open` - Reduce `GraphDiagnosticsPanel` component bloat.
   - Current files:
     - `apps/vizij-authoring/src/components/app/GraphDiagnosticsPanel.tsx`
   - Why:
     - Issue aggregation/filter effects and inspector-drawer rendering live in one large module.
   - Target:
     - Extract issue-filter hook and separate `IrInspectorDrawer`/diff list component modules.

4. `open` - Data-drive DebugPanel tab rendering.
   - Current files:
     - `apps/vizij-authoring/src/components/panels/DebugPanel.tsx`
   - Why:
     - Large switch block is harder to maintain and extend.
   - Target:
     - Tab registry map + shared tab content wrapper.

5. `open` - Continue reducing duplicated standard-input handling across binding/feature surfaces.
   - Current files:
     - `apps/vizij-authoring/src/components/app/StdFeatureSpacesControls.tsx`
     - `apps/vizij-authoring/src/components/app/StdFeatureSpacesChannelsPanel.tsx`
     - `apps/vizij-authoring/src/components/binding/*`
   - Why:
     - Some normalization and comparison behavior is still repeated in UI layers.
   - Target:
     - Push shared standard-input normalization/comparison helpers into `src/utils`.

6. `open` - Evaluate further segmentation of pose-rig store compile/projection logic.
   - Current files:
     - `apps/vizij-authoring/src/poseRig/store.tsx`
   - Why:
     - Store projection and compile guards are comprehensive but concentrated in a very large module.
   - Target:
     - Move projection helpers/validation into `poseRig/services` submodules with focused tests.

## Recently Landed Refactors

1. `done` - Sample asset loading extracted from `App.tsx` into:
   - `apps/vizij-authoring/src/hooks/useSampleAssetLoader.ts`
2. `done` - Bundle synchronizer failure/retry orchestration extracted from `App.tsx` into:
   - `apps/vizij-authoring/src/hooks/useBundleSyncState.ts`
