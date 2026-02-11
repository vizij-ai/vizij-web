# Pose-Rig Two-Layer Blend Vision

Last updated: 2026-02-11
Owner: Vizij Authoring
Status: proposed target architecture (top priority)

## 1) Vision summary

Poses are authored as intent for rig-variable targets, not as direct animatable writes.
Compile must build a full chain:

1. blend poses inside each pose group
2. blend group outputs per rig target
3. combine those pose-layer outputs with non-pose drivers for the same rig target
4. propagate through rig-variable chains until low-level rig variables write animatable leaves

Runtime should execute this as one coherent graph contract, regardless of whether control comes from sliders, parent rig drivers, or pose groups.

## 2) Terminology (target)

1. Animatable leaf: renderer-facing property component (for example morph value or transform axis).
2. Low-level rig variable: leaf rig input that can write to animatable leaves.
3. Higher-order rig variable: drives other rig variables; must not write animatables directly.
4. Pose: named set of desired rig-variable values.
5. Pose group: set of sibling poses with a local blend strategy (for example `emotion`, `viseme`).
6. Pose-group output: per-rig-target aggregate result from one pose group.
7. Pose-layer output: final per-rig-target aggregate across pose groups.

## 3) Authoring workflow (target)

1. Import face and discover animatables.
2. Auto-create low-level rig variables for animatable leaves, with self slider handles.
3. Add higher-order rig variables that target rig variables only.
4. Create pose groups (for example `emotion`, `viseme`) and define poses within each group.
5. Configure blend strategy per pose group and across pose groups.
6. Compile to graph where pose-layer outputs bind into rig-variable targets (default additive), then resolve through rig bindings to animatables.

Neutral is the default value baseline for rig variables across low-level and higher-order layers.

## 4) Group/path semantics (target clarification)

Group semantics are structural, not just labels:

1. A pose path should represent hierarchy (`/<group>/<pose>/weight.value` or equivalent canonical representation).
2. Group identity must be first-class in authoring state and compile model.
3. `happy` alone is not the direct binder for a target.
   The binder is the aggregated pose-layer output that already includes group-local and cross-group blending.

## 5) Current code alignment

## What already aligns

1. Poses target rig inputs (standard input ids), not scene targets directly.
2. Neutral baseline exists and is applied during pose preview/apply.
3. Rig parent-binding model supports multi-source expression-based composition for rig variables.

Primary references:

1. `apps/vizij-authoring/src/poseRig/services/poseSnapshotService.ts`
2. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
3. `apps/vizij-authoring/src/hooks/useRigController.ts`

## What is partial

1. `pose.group` exists, but currently acts as metadata/path segment, not first-class group entity.
2. Pose import/remap can set `groupName`, but grouping strategy is implicit.

Primary references:

1. `apps/vizij-authoring/src/poseRig/types.ts`
2. `apps/vizij-authoring/src/poseRig/utils.ts`
3. `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`

## What does not align (critical)

1. No two-layer pose blend model in compiler.
   Current pose builder computes one blend layer across all poses for each target variable.
2. No explicit group-local blend configuration.
3. No explicit cross-group blend configuration per target.
4. No first-class pose-layer aggregate node surfaced for binding relationship in UI.
5. No hard boundary enforcing “only low-level rig variables write animatables”.

Primary references:

1. `apps/vizij-authoring/src/poseRig/graphBuilder.ts`
2. `apps/vizij-authoring/src/poseRig/services/poseGraphService.ts`
3. `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`

## 6) Docs alignment impact

The previous P1 spec needs correction:

1. group semantics must be defined as computational structure, not only organization/path labeling
2. compile requirements must include two blend stages (within-group and cross-group)
3. pose-to-rig binding semantics must reference aggregate outputs, not individual poses as direct binders

## 7) Required top-priority work

## P1-A Data model

Introduce first-class pose-group model:

1. group id/path/name
2. local blend strategy
3. optional metadata for migration and import mapping

## P1-B Compiler

Implement two-layer pose blending:

1. per-group per-target blend nodes
2. cross-group per-target blend nodes
3. explicit pose-layer outputs connected to rig-variable targets

Default cross-group strategy: additive.

## P1-C Rig boundary enforcement

Enforce low-level-only animatable writes:

1. higher-order rig variables can target rig variables only
2. compiler validates and rejects direct higher-order-to-animatable writes
3. migration path auto-fixes or flags invalid legacy patterns

## P1-D UI

Add first-class pose-group authoring:

1. create/rename/delete pose groups
2. group-local blend strategy editor
3. cross-group blend strategy editor
4. explicit relationship view showing aggregate pose-layer outputs feeding rig targets

## P1-E Import/export/migration

1. preserve/migrate pose group identity explicitly
2. make grouping strategy explicit in import review
3. export pose graph/config with stable group-aware semantics

## P1-F Diagnostics

1. per-target diagnostics for missing group aggregate or ambiguous blend sources
2. per-group diagnostics for empty/unreachable poses
3. clear messaging when legacy assets lack group structure

## 8) Acceptance criteria for “pose model aligned”

1. A pose group can be created and assigned a local blend strategy.
2. Two groups can target the same rig variable and blend deterministically via configured cross-group strategy.
3. The inspector shows that the rig variable is driven by pose-layer aggregate outputs, not just single pose rows.
4. Higher-order rig variables cannot directly bind animatables.
5. Exported graph reproduces equivalent runtime behavior when re-imported.

## 9) Notes on timestamps

`createdAt` and `updatedAt` currently exist in pose types as authoring metadata.
They are not part of pose blending semantics and should not be treated as functional requirements for the target model.
