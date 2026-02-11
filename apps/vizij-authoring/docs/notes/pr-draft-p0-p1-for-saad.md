# PR Draft (For Saad): P0 Stabilization + P1 Pose Architecture and Inspector Authoring Pass

Last updated: 2026-02-11
Branch: `chris-work`
Compare against: `vizij_workspace_as_authoring`

## Proposed PR Title

`feat(vizij-authoring): complete p0 stabilization and land p1 pose architecture + inspector chain authoring foundations`

## Executive Summary

This branch completes the P0 hardening goals and lands the first major P1 architecture tranche.

What is now in place:

1. Runtime/apply/import reliability for migrated assets is significantly stronger (deterministic mismatch handling, safer remap, graph/runtime clear semantics, restage correctness).
2. Inspector chain authoring is bidirectional and actionable across Pose -> Rig -> Animatable with binding editor parity.
3. Pose system now has first-class group semantics and two-layer compile behavior (within-group and cross-group).
4. Pose authoring UX now supports practical creation/preview workflows, including a sidebar pose-group inspector.

What remains (P1 wrap items):

1. Surface aggregate pose outputs as explicit binding sources in inspector semantics.
2. Enforce low-level-only animatable write boundaries for rig variables.
3. Add first-class group lifecycle + import grouping strategy controls + broader diagnostics.

---

## Why This Work Was Prioritized

The migration from split-graph authoring had three critical risks:

1. Import/remap/runtime inconsistencies that could make migrated assets look broken.
2. Chain visibility gaps that blocked debugging and trust (`what drives me` vs `what I drive`).
3. Pose architecture mismatch (metadata groups and one-layer blend behavior) versus target runtime model.

This branch addresses those in order: correctness first, then authoring chain UX, then pose architecture foundation.

---

## What Shipped

## 1) Runtime + Import Correctness (P0)

1. Runtime graph clear/update semantics fixed to avoid stale controllers.
2. Runtime input values are restaged when bridge readiness arrives late.
3. Graph import discrepancy handling and face mismatch auto-resolution are deterministic.
4. Pose remap/import handling is conflict-safe and non-mutating.

Primary files:

- `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`
- `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`
- `apps/vizij-authoring/src/hooks/useRigController.ts`
- `apps/vizij-authoring/src/components/app/Viewer.tsx`
- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`

## 2) Inspector Chain Traversal + Binding Parity

1. Chain clickthrough now routes predictably across Pose, Rig, and Animatable contexts.
2. Breadcrumb context is preserved through multi-hop inspection.
3. Binding authoring is available from scene, rig, and pose flows with consistent slot/expression behavior.
4. Quick-edit sections resolve effective binding slots robustly instead of assuming `slots[0]`.
5. Compile issues are surfaced in active editor panels.

Primary files:

- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`
- `apps/vizij-authoring/src/components/inspector/FeatureList.tsx`
- `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts`
- `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`

## 3) Pose Architecture Tranche (P1)

1. First-class pose-group model and normalization are now part of pose config/store contracts.
2. Pose compiler now emits two-layer blending:
   - group-local blend per target,
   - cross-group blend per target.
3. Blend strategies are surfaced in authoring export controls.
4. Pose group reassignment/import handling is more robust for legacy group ids.

Primary files:

- `apps/vizij-authoring/src/poseRig/types.ts`
- `apps/vizij-authoring/src/poseRig/services/poseConfigService.ts`
- `apps/vizij-authoring/src/poseRig/store.tsx`
- `apps/vizij-authoring/src/poseRig/graphBuilder.ts`
- `apps/vizij-authoring/src/components/app/ExportPanel.tsx`
- `apps/vizij-authoring/src/hooks/useVizijExport.ts`

## 4) Pose Authoring UX Additions

1. Pose creation flow and target authoring affordances were expanded.
2. Pose inspector semantics now use `Pose Target` terminology.
3. Pose target number fields were widened for better readability.
4. Single-pose preview uses neutral baseline composition (avoids zero-collapse behavior).
5. Pose-group inspector is now integrated into the bottom of the inspector sidebar (not popup), with weights/solo/play/reset behavior scoped to selected group.

Primary files:

- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- `apps/vizij-authoring/src/components/inspector/InspectorPanel.tsx`

---

## UI Surfaces Saad Should Review/Polish

## High-priority visual cleanup targets

1. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
2. `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`
3. `apps/vizij-authoring/src/components/inspector/InspectorPanel.tsx`
4. `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
5. `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`
6. `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`

## Cleanup focus for these files

1. Consistent hierarchy for labels/actions/status chips.
2. Clear affordance split between informational rows and actionable rows.
3. Better density management in inspector while preserving chain context.
4. Consistent control treatment across pose, rig, and scene contexts.

---

## API/Contract Reference for UI Work

Use these as source-of-truth contracts instead of reimplementing logic in UI components.

## Core stores/hooks

1. `useBindingAuthoring(...)`
   - Source: `apps/vizij-authoring/src/state/bindingAuthoringStore.tsx`
   - Key reads: `managedStandardInputs`, `bindings`, `inputBindings`, `inputValues`, `bindingIssues`.
   - Key writes: `handleInputValueChange`, `applyStandardInputBatch`, binding slot/expression actions, `handleLinkChildInput`.

2. `usePoseRig(...)`
   - Source: `apps/vizij-authoring/src/state/PoseRigProvider.tsx`
   - Key reads: `poses`, `neutralInputs`, `blendMode`, `crossGroupBlendMode`.
   - Key writes: `createPose`, `updatePoseValue`, `applyPose`, `setBlendMode`, `setCrossGroupBlendMode`, group assignment actions.

3. `useGraphRuntime(...)`
   - Source: `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`
   - Key reads: `graphStatus`, `graphWarning`, `graphError`, `graphSpec`, `poseGraphSpec`, `discrepancyReview`.
   - Key writes: import/discrepancy resolution and playback operations.

4. `useUnifiedSelection()`
   - Source: `apps/vizij-authoring/src/hooks/useUnifiedSelection.ts`
   - Contract: single-mode selection routing (`scene`, `pose`, `rig`, `material`, `default`).

## Key helpers to reuse

1. `resolveEffectiveBindingInputId(...)`
   - `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts`
   - Required for quick-edit parity with binding editor.

2. Pose/rig trace helpers in:
   - `apps/vizij-authoring/src/components/inspector/rigConnections.ts`
   - Includes chain summaries and safe suggestion selection.

3. Remap apply planning:
   - `buildPoseGraphRemapApplyPlan(...)` in `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`

4. Runtime graph resolver:
   - `resolveRuntimeGraphSpec(...)` in `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts`

---

## Runtime Computational Flow (Current)

1. Authoring state (`standardInputs`, `inputBindings`, `bindings`) is maintained in rig/pose stores.
2. Rig and pose compile outputs are generated in authoring layer.
3. Runtime graph payload is selected through IR-first resolver with fallback behavior.
4. Runtime receives graph updates incrementally.
5. Input staging writes into runtime input paths; output writes apply back to animatables with reset semantics.
6. Pose compilation now blends:
   - inside each group first,
   - then across groups per target (strategy-controlled).

---

## Validation Status

Latest run in this branch:

1. `pnpm --filter vizij-authoring run validate` -> pass.
2. Full Vitest status -> `45 test files`, `200 tests`, all passing.

---

## Remaining Work Before Full P1 Close

1. Aggregate pose-source semantics and editor routing (entry/group/aggregate clarity).
2. Rig boundary enforcement + migration diagnostics.
3. Explicit group lifecycle and import grouping strategy UI.
4. Expanded diagnostics coverage and direct routing from diagnostic to fix surface.

---

## Commit Clusters (Recent)

1. Pose architecture foundation:
   - `e548489`, `e5b19f1`, `a1fbee6`, `689f177`
2. Pose authoring UX:
   - `755c3ad`, `9b695f3`, `a54cb55`, `c00464d`
3. Runtime/rig control correctness:
   - `4ec8217`, `886dc65`, `1fb01a0`
4. Inspector/import/parity tranche:
   - `1c5bb3f`, `aa040fb`, `225c6e9`, `baa0579`, `a17092f`, `6a1fa45`

---

## Reviewer Guidance (Saad)

1. Treat data-flow helpers/stores as fixed contracts unless there is a correctness reason to change them.
2. Prioritize compositional cleanup and visual hierarchy over behavior rewrites.
3. If behavior updates are needed, keep them isolated and backed by tests in existing suites.
