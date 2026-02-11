# PR Draft (For Saad): P0/P1 Authoring Stabilization, Import Reliability, and Inspector Chain Parity

Last updated: 2026-02-11
Branch: `chris-work`
Compare against: `vizij_workspace_as_authoring`

## Proposed PR Title

`feat(vizij-authoring): complete P0/P1 migration hardening for import/remap, inspector chain traversal, and binding-authoring parity`

## Executive Summary

This branch finishes the P0 and P1 hardening passes for `vizij-authoring` after the runtime/face migration. The work is focused on migration correctness first, then editing reliability and inspector workflow parity.

Core outcomes:

- Import pipeline now handles face namespace mismatch and discrepancy review with deterministic behavior.
- Pose graph remap/import is conflict-safe and non-mutating; pose output retargeting is supported in place.
- Inspector now supports chain-aware navigation across Pose -> Rig -> Animatable (and back) with breadcrumb context.
- Binding editor behavior is more truthful: unsupported `self` contexts are surfaced/guarded, quick-edit uses effective slot resolution, and compile issues are visible where authors edit.
- UI now exposes trace diagnostics with actionable suggestions (preview/apply/ignore/undo) for migration fixes.
- P1 coverage was expanded and `vizij-authoring` now has an app-local `validate` script (`lint + typecheck + test`).

The branch is functionally strong but still needs visual/design cleanup and interaction polish. This document is intended to let Saad focus on UI quality without re-deriving behavior contracts.

---

## Why We Did This

### Problem Context

The migration from prior split graph authoring left gaps in three places:

1. Import reliability under face/path mismatches and normalized graph diffs.
2. Authoring chain visibility and traversal (pose -> rig -> driven leaves).
3. Binding edit correctness in inspector quick-edit surfaces (especially around slot selection and `self`).

### Product Goal

Ensure authors can:

- import legacy/variant graphs safely,
- understand what drives what,
- click through the chain and edit binding semantics from any context,
- trust that sliders and controls map to actual runtime-driving values.

---

## What Changed

## 1) Import and Migration Reliability

### Rig graph import (`useRigGraphImport`)

- Added discrepancy workflow for graph import differences and missing auto-input metadata.
- Added deterministic auto-resolution for safe face mismatch permutations.
- Added safe handling for missing blueprint inputs with explicit choices.
- Added non-mutating, conflict-safe import behavior and better diff canonicalization support.

Key file:

- `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`

### Pose graph import/remap (`usePoseGraphImport` + wizard)

- Added structured remap state (`autoRows` + `reviewRows`) with confidence/rationale.
- Added apply-plan conflict detection to prevent many-to-one remap collisions.
- Added path and id remapping pipeline with immutable copy semantics before apply.
- Added support for in-place pose output retargeting.

Key files:

- `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`
- `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`
- `apps/vizij-authoring/src/poseRig/graphImport.ts`
- `apps/vizij-authoring/src/poseRig/graphTransforms.ts`

---

## 2) Pose-Rig-Face Trace Diagnostics + Actionable Fixes

### Trace computation and suggestions

- Added transitive trace through rig chains, not only direct links.
- Added unmatched pose output diagnostics.
- Added suggestion generation for:
  - link missing parent bindings,
  - retarget pose outputs.
- Added safe suggestion selection helper (`confidence` threshold + conflict exclusion).

### Trace UI behavior

- Added preview/apply/ignore/undo loop for suggestions.
- Added “Apply Safe” bulk path for high-confidence actions.
- Added trace cards that can route to target/rig/pose when callbacks are provided.

Key files:

- `apps/vizij-authoring/src/components/inspector/rigConnections.ts`
- `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`

---

## 3) Inspector Chain Traversal and Binding Parity

### Chain-aware inspector navigation

- Added chain path model (breadcrumbs) for scene/rig/pose drill-down.
- Added deterministic routing callbacks for connected/driven surfaces.
- Added focused binding target routing (jump from rig dependent to specific scene binding row).
- Fixed breadcrumb regression: preserve chain when switching view tabs on same node.

Key file:

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`

### Cross-context binding edit parity

- Scene context: existing feature/binding editing retained and expanded.
- Rig context: can edit driven scene target binding in-place.
- Pose context: can open binding editor for pose-driven variable without leaving pose flow.

Key files:

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- `apps/vizij-authoring/src/components/inspector/FeatureList.tsx`
- `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`

---

## 4) Slider and Binding Correctness Fixes

### Effective slot resolution (quick-edit)

Quick-edit sections previously assumed `slots[0]` was authoritative. This caused inert or wrong sliders when slot 0 was `self` or stale.

- Added `resolveEffectiveBindingInputId` helper to choose first valid non-self slot, then fallback.
- Applied helper in transform, morph, and material quick-edit sections.

Key files:

- `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts`
- `apps/vizij-authoring/src/components/inspector/RiggingTransformSection.tsx`
- `apps/vizij-authoring/src/components/inspector/RiggingMorphTargetsSection.tsx`
- `apps/vizij-authoring/src/components/inspector/RiggingMaterialSection.tsx`

### Unsupported `self` handling

- `BindingEditor` now supports `allowSelfBinding` guard.
- When disallowed, unsupported `self` slot states surface explicit issues instead of appearing silently interactive.

Key file:

- `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`

### Compile/issue surfacing

- Bound editor call sites now pass `issues` through in active inspector contexts, so broken states are visible at edit time.

Key files:

- `apps/vizij-authoring/src/components/inspector/FeatureList.tsx`
- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`

---

## 5) Runtime Staging and Graph Pipeline Reliability

### Runtime graph selection

`resolveRuntimeGraphSpec` now consistently prefers IR compile output, but falls back to legacy spec with warning when IR compile reports issues; preserves last-known-good on compile failure.

Key file:

- `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts`

### Input and output synchronization

- Input staging now reacts to runtime bridge availability.
- Removed stale graph payloads correctly on graph-tier updates.
- Output writes are applied to animatables with driven reset semantics.

Key files:

- `apps/vizij-authoring/src/hooks/graphRuntime.ts`
- `apps/vizij-authoring/src/hooks/useRigController.ts`
- `apps/vizij-authoring/src/components/app/Viewer.tsx`

---

## 6) UI Surfaces Touched (For Cleanup/Polish)

This is the UI inventory Saad should treat as primary cleanup targets.

### A. Inspector core

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
  - Added chain breadcrumbs, status strip, pose/rig binding modals, target focusing.
  - Cleanup needs: spacing consistency, button hierarchy clarity, reduced visual density.

- `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`
  - Added trace cards + suggestion controls.
  - Cleanup needs: card hierarchy, chip contrast, clearer read-only vs actionable affordance.

- `apps/vizij-authoring/src/components/inspector/FeatureList.tsx`
  - Added focused row behavior for navigated target.
  - Cleanup needs: row emphasis style and less visual noise under expanded binding editors.

### B. Binding authoring shell

- `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`
  - Added unsupported-self handling and stronger diagnostics.
  - Cleanup needs: control grouping, long form readability, consistent typography scales.

### C. Rigging quick-edit strips

- `apps/vizij-authoring/src/components/inspector/RiggingTransformSection.tsx`
- `apps/vizij-authoring/src/components/inspector/RiggingMorphTargetsSection.tsx`
- `apps/vizij-authoring/src/components/inspector/RiggingMaterialSection.tsx`
  - Correctness fixes done, but style is inconsistent across sections.
  - Cleanup needs: shared componentization and consistent affordance language.

### D. Import/remap workflow UI

- `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`
  - Added conflict grouping, filtering, confidence display, non-delta toggles.
  - Cleanup needs: table/scannability improvements, conflict resolution action prominence.

### E. Variables/navigation panels

- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `apps/vizij-authoring/src/components/inspector/VariableSelector.tsx`
  - Added path-complete listing and leaf-level/bulk property selection.
  - Cleanup needs: reduce tree complexity and improve split between selection vs action.

### F. Diagnostics/supporting UI

- `apps/vizij-authoring/src/components/panels/DebugPanel.tsx`
- `apps/vizij-authoring/src/components/app/StandardInputCoveragePanel.tsx`
  - Improved status visibility and coverage context.
  - Cleanup needs: unify panel visual language and reduce “debug-first” styling.

---

## 7) API Reference for UI Work

This section lists the APIs Saad’s UI pass should rely on (instead of re-implementing behavior logic).

## 7.1 Store Hooks and State Contracts

### `useBindingAuthoring(...)`

Source: `apps/vizij-authoring/src/state/bindingAuthoringStore.tsx`

Important read state:

- `managedStandardInputs`
- `standardInputs`, `standardInputsById`, `standardInputsByPath`
- `bindings` (scene target bindings)
- `inputBindings` (parent/input bindings)
- `inputValues`
- `bindingIssues`
- `hiddenDriverIds`
- `selectedRigId`, `selectedMaterialId`

Important actions:

- Input value/edit:
  - `handleInputValueChange`
  - `applyStandardInputBatch`
  - `handleResetAllInputValues`
- Target binding edits:
  - `handleBindingInputChange`
  - `handleAddBindingSlot`
  - `handleRemoveBindingSlot`
  - `handleUpdateBindingExpression`
  - `handleUpdateBindingSlotAlias`
  - `handleBindingSlotValueTypeChange`
  - `handleResetBinding`
- Parent/input binding edits:
  - `handleEnsureParentBinding`
  - `handleParentBindingInputChange`
  - `handleParentAddBindingSlot`
  - `handleParentRemoveBindingSlot`
  - `handleParentBindingExpressionChange`
  - `handleParentBindingSlotAliasChange`
  - `handleParentBindingSlotValueTypeChange`
  - `handleParentResetBinding`
- Standard input lifecycle:
  - `handleCreateCustomStandardInput`
  - `handleUpdateStandardInput`
  - `handleDisableStandardInput`
  - `handleEnableStandardInput`
  - `handleDeleteCustomStandardInput`
  - `handleCloneStandardInputs`
- Link graph/input topology:
  - `handleLinkChildInput`
  - `handleUnlinkChildInput`
  - `handleCreateParentDriverBinding`
- Driver visibility controls:
  - `handleHideDriver`, `handleShowDriver`, `handleShowAllDrivers`
- Selection bridge:
  - `handleSelectRig`, `handleSelectMaterial`

### `useGraphRuntime(...)`

Source: `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`

Important read state:

- Graph health: `graphStatus`, `graphError`, `graphWarning`
- Playback: `graphPlaybackState`, `graphPlaybackAvailable`, `graphTimeSeconds`, `graphFrameRate`
- Runtime specs: `graphSpec`, `poseGraphSpec`, `poseConfig`
- Runtime diagnostics: `graphInsights`, `graphMachineReport`, `discrepancyReview`
- Render/runtime world state: `world`, `animatables`, `values`

Important actions:

- Playback: `playGraph`, `pauseGraph`, `stopGraph`, `stepGraph`
- Import: `handleImportGraphSpec`
- Face: `handleFaceIdChange`
- Discrepancy: `resolveDiscrepancyReview`
- IR inspection: `getGraphIr`

### `useSelectionStore(...)`

Source: `apps/vizij-authoring/src/state/selectionStore.tsx`

Important state/actions:

- `selectionStack`
- `handleFocusSelectionIndex`
- `handleClearSelection`

### `useUnifiedSelection()`

Source: `apps/vizij-authoring/src/hooks/useUnifiedSelection.ts`

Provides mutually exclusive selection orchestration and inspector mode derivation.

- `inspectorMode`: `scene | pose | rig | material | default`
- `handleSelectObject`, `handleSelectPose`, `handleSelectRig`, `handleSelectMaterial`

---

## 7.2 Component Contracts

### `BindingEditor`

Source: `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`

Notable props relevant to UI behavior:

- `issues?: readonly string[]`
- `allowSelfBinding?: boolean` (newly important for leaf/component contexts)
- `featureFlags` (`vectorAuthoringBeta`, `conditionalAuthoringBeta`)
- `currentValues` + `onInputValueChange` for live slider behavior

### `BindingConnections`

Source: `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`

Notable props:

- `onSelectPose?: (poseId: string) => void`
- `onSelectRig?: (rigId: string) => void`
- `onSelectTarget?: (targetId: string) => void`

If callbacks are absent, UI should communicate read-only trace state (already implemented).

### `FeatureList`

Source: `apps/vizij-authoring/src/components/inspector/FeatureList.tsx`

Notable prop:

- `focusedTargetId?: string | null`

Used to auto-expand/highlight/scroll target binding row after chain navigation.

### `VariableSelector`

Source: `apps/vizij-authoring/src/components/inspector/VariableSelector.tsx`

Selection payload:

- `VariableSelection = { type: "variable", id } | { type: "property", objectId, featureId, label, targetId?, targetIds? }`

Key behavior:

- leaf selection emits `targetId`.
- “All” emits `targetIds` for explicit bulk binding.

### `PoseGraphRemapWizard`

Source: `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`

Key types:

- `PoseGraphRemapRow`
- `PoseGraphRemapOption`
- `PoseRemapConfidence`

This UI now supports conflicts, confidence, filtering, and non-delta inclusion.

---

## 7.3 Logic Helpers (UI Should Reuse)

### Binding slot resolution helper

- `resolveEffectiveBindingInputId(binding)`
- File: `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts`

Purpose:

- Choose first valid non-`self` slot input, then fallback.
- Avoid direct `slots[0]` assumptions in UI controls.

### Rig/Pose trace helpers

- `buildPoseRigFaceTrace(...)`
- `summarizeTraceConnections(...)`
- `collectRigDependents(...)`
- `collectDirectDownstreamRigInputs(...)`
- `selectSafePoseRigTraceSuggestions(...)`
- File: `apps/vizij-authoring/src/components/inspector/rigConnections.ts`

Purpose:

- Build UI chain summaries and actionable suggestions with deterministic safety rules.

### Pose import apply planning

- `buildPoseGraphRemapApplyPlan(...)`
- `resolvePoseGraphSourceInputId(...)`
- File: `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`

Purpose:

- Prevent conflicting remaps and keep apply deterministic.

### Runtime spec resolver

- `resolveRuntimeGraphSpec(...)`
- File: `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts`

Purpose:

- Select runtime spec source (`ir` preferred, fallback/warnings/blocked semantics).

---

## 8) Computational Flow (How Data Moves End-to-End)

## 8.1 Rig authoring -> runtime execution

1. Authoring state (`bindings`, `inputBindings`, `standardInputsById`, animatable metadata) is maintained in `useRigController` and surfaced via `useBindingAuthoring`.
2. Rig graph is built using `buildRigGraphSpec(...)` (legacy spec + optional IR).
3. Runtime selection uses `resolveRuntimeGraphSpec(...)`:
   - prefer compiled IR spec if valid,
   - fallback to legacy spec if IR has issues,
   - preserve last known good if IR compile blocks.
4. Graph/runtime state is pushed into `graphRuntimeStore`.
5. Input staging:
   - UI writes update `inputValues`.
   - `stageRuntimeInput` sends value updates to runtime graph paths.
6. Output application:
   - graph writes are converted to raw animatable values and applied to scene animatables.
   - previously driven values are reset when no longer written.

## 8.2 Graph import -> discrepancy/remap -> apply

1. Import spec is rehydrated into authoring model (inputs/bindings/metadata).
2. Imported graph is compared against rebuilt graph (canonicalized diff).
3. If mismatch exists, discrepancy review opens unless auto-resolvable.
4. For pose graph import:
   - outputs are grouped into auto/review rows,
   - confidence/rationale computed,
   - apply plan validates collisions,
   - remaps are applied immutably.

## 8.3 Inspector chain rendering

1. User selects pose/rig/scene item.
2. `BindingConnections` + `rigConnections` compute chain and suggestions.
3. Inspector callbacks route to target mode and append breadcrumb node.
4. `FeatureList` receives `focusedTargetId` and opens exact row.
5. Binding editor in that context renders with real compile issues and proper self/slot guards.

---

## 9) Validation and Test Coverage

### Validation commands

- App-level required path added:
  - `pnpm --filter vizij-authoring run validate`
  - (`lint && typecheck && test`)

### Added/expanded tests

- `apps/vizij-authoring/src/components/inspector/BindingConnections.test.tsx`
- `apps/vizij-authoring/src/components/app/StandardInputCoveragePanel.test.tsx`
- `apps/vizij-authoring/src/poseRig/services/poseConfigService.test.ts`
- `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.test.ts`

### Current status in branch

- `vizij-authoring` validate: green (44 files / 172 tests).

---

## 10) Known UI Debt / Cleanup Targets (Saad Focus)

1. Visual consistency across inspector subpanels is not yet unified.
2. Binding editor and trace cards are information-dense; hierarchy can be improved.
3. Some panels still read as debug tools rather than production authoring surfaces.
4. Interaction affordances vary (button vs row click vs chip action); should normalize.
5. Spacing/typography scale differs between old and newly touched surfaces.
6. No full end-to-end visual regression harness for chain drill-down yet.

---

## 11) Suggested UI Cleanup Strategy

1. Normalize primitives first:

- shared spacing/typography tokens for inspector rows/cards/chips.
- consistent action tiers (primary/secondary/ghost/destructive).

2. Unify chain surfaces:

- same row pattern for pose/rig/target chain items.
- explicit read-only badges only where callbacks are absent.

3. Reduce local complexity:

- move repeated “status strip + chain path + tabs” patterns into shared inspector shell.
- componentize repeated “small metric chip rows”.

4. Improve mapping/remap tables:

- stronger conflict affordance and apply guard UX.
- optional compact mode for power users.

---

## 12) Commit Grouping (High-Level)

### Migration/import correctness tranche

- `1f548b3`, `fbf2526`, `3a978ab`, `5664331`, `d06f6d4`, `2614cbe`, `3cf8af9`, `b6134de`, `c15e19f`

### Inspector chain + binding parity tranche

- `7005e4e`, `e2d7ca1`, `5b973eb`, `107c58d`, `f22d31e`, `d2e85b6`, `386f056`

### Slider/slot/diagnostic correctness tranche

- `4871823`, `fe22c6d`

### Validation/tests/docs tranche

- `7379cc2`, `8e39344`, plus earlier P0/P1 planning/doc updates

---

## 13) Reviewer Notes (Saad)

If your objective is UI quality pass rather than behavior changes, use this guardrail:

- Keep store contracts untouched unless necessary (`useBindingAuthoring`, `useGraphRuntime`, `useSelectionStore`).
- Keep resolver/helper logic as source of truth (`bindingSlotResolution`, `rigConnections`, `usePoseGraphImport` apply planning).
- Focus refactors on composition and styling, not on data-flow semantics.

If we need to simplify UI architecture further, we should do it as a dedicated follow-up PR after this merge.
