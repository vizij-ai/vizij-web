# Rigging Integration Plan

## Goals
- Fold the pose rig capture, editing, and export tooling from `demo-vizij-rigging` into `demo-vizij-authoring`, consolidating on a single authoring experience.
- Preserve the existing authoring workflow (asset loading, standard input editing, main rig export) without behaviour regressions.
- Mirror the rigging demo’s pose UI/UX inside the authoring app so rigs can be captured, exported, and later re-imported for editing.
- After migration, remove the standalone rigging demo; no shared package extraction is required.

## Current Authoring Architecture Snapshot
- `src/App.tsx` orchestrates layout: left sidebar for loading/export, centre `Viewer`, right sidebar `AnimatableValuesPanel`.
- Rig state lives in `useRigController` (manages standard inputs, bindings, GLB/graph export).
- Utility modules under `src/utils` handle downloads, dialogs, robot defaults, etc.
- Tests cover rig graph generation and binding logic (`src/rig/*.test.ts`).

## Proposed Structure Updates (Authoring App Only)
- Add a `src/poseRig/` directory that houses the migrated rigging logic:
  - `usePoseRigAuthoring.ts`: hook encapsulating neutral pose tracking, pose library CRUD, capture/apply, import/export, and graph/spec building.
  - `components/` subfolder with pose workbench UI parts (PoseRigWorkbench, PoseList, PoseEditor, NeutralEditor, ImportExportPanel).
  - `types.ts`, `graphBuilder.ts`, `persistence.ts`, `utils.ts` adapted from the rigging demo (namespaced locally, no shared package).
- Extend `useRigController` (or add a helper under `src/hooks/`) with a bulk setter so pose apply operations can push multiple input values efficiently.

## Pose Rig State & Data Flow
- `usePoseRigAuthoring` consumes authoring state: `faceId`, `standardInputs`, `inputValues`, and setters from `useRigController`.
- Internally maintain:
  - `neutralInputs`, `savedNeutral`, `poseDefinitions` (formerly “emotions”), selection, and derived summaries.
  - Live pose graph spec (`buildPoseGraphSpec`) and export filenames.
  - Validation warnings when imported configs reference missing inputs or mismatched faces.
- On Vizij asset change (`rootId` or `faceId` shift), reset pose state to avoid stale data. Keep pose UI disabled until required prerequisites (asset + standard inputs) are available.

## UI Layout Updates
- Update the central `Viewer` to render a new `<PoseRigWorkbench>` beneath the canvas. This component will:
  - Display neutral capture/apply controls.
  - Show a pose list with add/duplicate/delete actions.
  - Provide a pose detail editor (capture current pose, clear values, tweak individual channels).
  - Include an optional collapsible section summarising channel contributions (mirror of `GraphSummaryPanel` content).
- Left sidebar: insert a `PoseRigImportExportPanel` below the existing graph import controls. Surface pose rig config import/export, pose graph export, file name inputs, and validation feedback.
- Right sidebar (`AnimatableValuesPanel`) remains unchanged to avoid regression risk.
- Style additions go into `src/styles.css`, reusing the existing dark theme tokens for consistency.

## Import / Export Behaviour
- Export Pose Graph: use `buildPoseGraphSpec` output and `downloadBlob` to save `<face>_<rig>_pose_rig.json`.
- Export Pose Config: wrap neutral + pose definitions in a config derived from `buildRigConfig`, include metadata (faceId, timestamps, rig name).
- Import Pose Config: parse via `parseRigConfig`, reconcile against current standard inputs (report missing channels, drop invalid entries), update neutral inputs and pose library, and apply imported neutral to the live rig.
- Ensure imports trigger re-validation of pose graph and refresh UI summaries.

## Implementation Steps
1. Create `src/poseRig/` with migrated types/utilities/graph builder/persistence code (strip rigging-demo specific logging, align naming to “pose rig” terminology).
2. Implement `usePoseRigAuthoring` hook:
   - Setup initial state, neutral defaults, capture/apply handlers, graph/spec memoisation, file name slug helpers, and validation.
   - Expose data and callbacks for UI panels.
3. Enhance `useRigController` (or add a helper) with `applyStandardInputBatch(record)` so pose apply operations do not spam individual updates.
4. Build pose rig UI components (PoseRigWorkbench, PoseList, PoseEditor, NeutralEditor, PoseSummary) using the rigging demo as reference but adapted to authoring styles and props.
5. Add `PoseRigImportExportPanel` to the left sidebar; wire up to hook outputs and existing `downloadBlob`/`alertDialog` utilities.
6. Integrate the hook into `App.tsx` (initialise after `useRigController`, pass into `Viewer` and sidebar). Gate features when no Vizij asset is loaded.
7. Update `Viewer` to mount the workbench layout and tweak CSS accordingly.
8. Write unit tests for `usePoseRigAuthoring` (capture, duplicate, import validation) alongside existing rig tests.
9. Perform manual QA: load asset, capture poses, export/import config, export pose graph, ensure standard authoring flow (graph + GLB export) still functions.
10. Once stable, delete `apps/demo-vizij-rigging` and any redundant assets in a follow-up change.

## Testing & Validation
- Re-run existing authoring tests (`pnpm test --filter demo-vizij-authoring`) and new pose-rig hook tests.
- Manual regression for:
  - Authoring: load GLB, adjust bindings, export rig graph/glb.
  - Pose rig: capture multiple poses, export/import config, verify pose blend graph contents, reapply imported poses.
- Confirm there are no residual references to the old rigging app before removal.
