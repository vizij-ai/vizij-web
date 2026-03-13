# Pose Handling Report (`vizij-authoring`)

Date: 2026-02-11
Scope: current `apps/vizij-authoring` pose pipeline, with emphasis on staged/uncommitted changes.

> **Status note (2026-02-11):** Parts of section 4.1 are now outdated because targeted typecheck/test regressions were fixed after this report was written. See `apps/vizij-authoring/docs/notes/SYNTHESIS.md` for active findings.

## Executive Summary

Pose handling is split into three layers:

1. Creation/import and edit state in `PoseRigStore`/`usePoseRigAuthoring`.
2. Definition/compilation into GraphSpec in `graphBuilder` + `PoseGraphService`.
3. Runtime execution through `@vizij/runtime-react` (new staged direction), with `useRigController` now acting as a graph/input coordinator rather than direct evaluator.

The staged changes strongly move execution toward runtime-react truth, add IR/legacy runtime gating, and propagate blend mode into pose graph exports/builds. However, there are current regressions (failing tests/typecheck) and a few wiring gaps.

## 1) Pose Creation (How poses enter state)

### 1.1 Store-level creation/edit actions

- Pose state/actions are centralized in `apps/vizij-authoring/src/poseRig/store.tsx:146`.
- Creation primitives:
  - `createPose(...)` in `apps/vizij-authoring/src/poseRig/store.tsx:263`.
  - `addPose(...)` in `apps/vizij-authoring/src/poseRig/store.tsx:275`.
  - Snapshot capture into existing pose via `capturePose(...)` in `apps/vizij-authoring/src/poseRig/store.tsx:367`.
  - Neutral capture/apply in `apps/vizij-authoring/src/poseRig/store.tsx:394` and `apps/vizij-authoring/src/poseRig/store.tsx:401`.

### 1.2 Authoring hook behavior

- `usePoseRigAuthoring` exposes all pose operations in `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts:91`.
- `applyPose` updates store and pushes a full neutral+pose batch through `applyInputBatch` in `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts:151`.
- Pose graph import path is implemented in `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts:297`:
  - Parses graph.
  - Optionally applies imported neutral.
  - Rebases values when `applyNeutral=false`.
  - Handles ID collisions by suffixing.

### 1.3 Import paths (actively wired)

- Bundle auto-import path in `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:68`:
  - Imports rig graph first, then pose config (`loadedBundle.poses.config`) in `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:123`.
- Pose graph file import/remap flow in `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts:68`:
  - Remaps face segment.
  - Auto/review mapping wizard.
  - Optional input ID remap and output path rewrite.

### 1.4 UI reality

- Pose selection/apply is surfaced in `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:427` and `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx:434`.
- Pose variable editing/blending is in inspector mode in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx:130` onward.
- Notably, the visible workspace path does not appear to expose a clear “create new pose” entry even though the API exists.

## 2) Pose Definition (How pose data becomes graph)

### 2.1 Automatic build from pose state

- Store rebuild trigger in `apps/vizij-authoring/src/poseRig/store.tsx:159`.
- On pose/neutral/rig metadata changes, store regenerates:
  - `poseConfigDraft` via `PoseConfigService.create`.
  - `poseGraphSpec` + `poseGraphSummary` via `PoseGraphService.buildSpec`.

### 2.2 Graph structure

- Core builder: `apps/vizij-authoring/src/poseRig/graphBuilder.ts:62`.
- Per-pose input and record constants, plus weight join.
- Per-standard-input delta/mask vectors and weighted sum chain.
- Blend modes:
  - `average` -> `blendweightedaverageoverlay` in `apps/vizij-authoring/src/poseRig/graphBuilder.ts:255`.
  - `additive` -> `add` in `apps/vizij-authoring/src/poseRig/graphBuilder.ts:233`.
- Grouped pose weight path generation uses:
  - `buildPoseWeightPathMap` in `apps/vizij-authoring/src/poseRig/utils.ts:195`.

### 2.3 Staged blend-mode propagation

Staged changes now carry blend mode through build/export:

- Store rebuild includes `patch.blendMode` in `apps/vizij-authoring/src/poseRig/store.tsx:168`.
- `PoseGraphService.buildSpec` accepts options (`blendMode`, `poseGroupSegment`) in `apps/vizij-authoring/src/poseRig/services/poseGraphService.ts:11`.
- Hook returns real store blend mode (not hardcoded) in `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts:374`.
- Export recomputes pose graph with current blend mode in `apps/vizij-authoring/src/hooks/useVizijExport.ts:317`.

## 3) Pose Execution (How authored poses run)

## 3.1 New staged runtime path

The main viewer has moved to runtime-react execution:

- `VizijRuntimeProvider` + `VizijRuntimeFace` in `apps/vizij-authoring/src/components/app/Viewer.tsx:131`.
- Runtime input bridge writes `stageRuntimeInput` into graph runtime store in `apps/vizij-authoring/src/components/app/Viewer.tsx:11`.
- Runtime graph bridge pushes rig+pose payload via `setGraphBundle(..., { tier: "graphs" })` in `apps/vizij-authoring/src/components/app/Viewer.tsx:28` and `apps/vizij-authoring/src/components/app/Viewer.tsx:60`.

## 3.2 Graph runtime store as bridge

Staged additions in `apps/vizij-authoring/src/state/graphRuntimeStore.tsx:19` now include:

- `graphSpec`, `poseGraphSpec`, `poseConfig`, `graphWarning`, `stageRuntimeInput`.

`PoseRigProvider` now normalizes and publishes pose graph/config to that store in `apps/vizij-authoring/src/state/PoseRigProvider.tsx:73`.

## 3.3 Rig graph runtime spec gating

`useRigController` now resolves runtime graph source via `resolveRuntimeGraphSpec` in `apps/vizij-authoring/src/hooks/useRigController.ts:1293`:

- Uses IR spec when compile succeeds.
- Falls back to legacy spec with warning when IR compile returns issues.
- Uses last-known-good runtime spec when compile fails.

Gating logic is in `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:15` and consumed at `apps/vizij-authoring/src/hooks/useRigController.ts:1987`.

## 4) Staged-Change Findings (Problems/Risks)

### 4.1 Verified regressions

1. Runtime bundle test is broken.
   - `apps/vizij-authoring/src/utils/__tests__/runtimeBundle.test.ts:2` imports `buildRuntimeBundle`, but `apps/vizij-authoring/src/utils/runtimeBundle.ts:28` only exports `buildRuntimeBaseBundle`/`buildRuntimeGraphBundle`.
   - Repro: `pnpm --filter vizij-authoring test -- src/utils/__tests__/runtimeBundle.test.ts` fails with `buildRuntimeBundle is not a function`.

2. Viewer tests fail against current `RuntimeStatusDebug` assumptions.

   - `apps/vizij-authoring/src/components/app/Viewer.tsx:80` reads `outputPaths.length` unguarded.
   - Repro: `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx` -> 3 failures (`Cannot read properties of undefined (reading 'length')`).

3. `vizij-authoring` typecheck currently fails.
   - Repro: `pnpm --filter vizij-authoring typecheck`.
   - Major issues include:
     - `Viewer.tsx` pose config type mismatch at `apps/vizij-authoring/src/components/app/Viewer.tsx:60`.
     - `runtimeBundle.ts` pose config type mismatch at `apps/vizij-authoring/src/utils/runtimeBundle.ts:61`.
     - Test type mismatches in `apps/vizij-authoring/src/hooks/__tests__/useVizijExport.test.tsx`.
     - Missing export in `apps/vizij-authoring/src/utils/__tests__/runtimeBundle.test.ts:2`.

### 4.2 Integration risks

1. `stageRuntimeInput` is read non-reactively in `useRigController`.
   - `const stageRuntimeInput = graphRuntimeStore.getState().stageRuntimeInput;` at `apps/vizij-authoring/src/hooks/useRigController.ts:210`.
   - Since this is not selected from the store, callbacks can capture stale `undefined` until a re-render occurs for unrelated reasons.

2. Playback controls are now no-op in `useRigController`.
   - `playGraph/pauseGraph/stopGraph/stepGraph` are placeholders at `apps/vizij-authoring/src/hooks/useRigController.ts:1396`.
   - Debug panel still renders playback controls (`apps/vizij-authoring/src/components/panels/DebugPanel.tsx:259` onward), so UX currently advertises controls that do not drive runtime.

3. Pose graph import UI appears disconnected from active dialog.
   - `PoseRigImportPanel` exists and supports graph/config imports in `apps/vizij-authoring/src/components/app/PoseRigPanels.tsx:24`.
   - `ExportDialog` receives but ignores `onImportPoseGraph` (`apps/vizij-authoring/src/components/app/ExportDialog.tsx:42`) and only renders `PoseRigExportPanel` (`apps/vizij-authoring/src/components/app/ExportDialog.tsx:249`).

4. Pose summary generation API is still incomplete.
   - `PoseGraphService.generateSummary` throws by design in `apps/vizij-authoring/src/poseRig/services/poseGraphService.ts:55`.

## 5) What is working well in staged changes

- Pose blend mode now correctly propagates from UI state to graph build/export (`store` + `usePoseRigAuthoring` + `useVizijExport`).
- Runtime graph gating introduces a practical last-known-good policy for IR compile failures.
- Export flow now validates rig GraphSpec normalization and pose graph validity before GLB export (`apps/vizij-authoring/src/hooks/useVizijExport.ts:240`).
- Debug and viewer surfaces now expose runtime warning/error state.

## 6) Validation Commands Run

- `pnpm --filter vizij-authoring test -- src/hooks/__tests__/runtimeGraphGating.test.ts` (pass)
- `pnpm --filter vizij-authoring test -- src/poseRig/services/poseGraphService.test.ts` (pass)
- `pnpm --filter vizij-authoring test -- src/hooks/__tests__/useVizijExport.test.tsx` (pass)
- `pnpm --filter vizij-authoring test -- src/utils/__tests__/runtimeBundle.test.ts` (fail)
- `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx` (fail)
- `pnpm --filter vizij-authoring typecheck` (fail)
