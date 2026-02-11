# P1 Pose Authoring Chain Spec

Last updated: 2026-02-11
Owner: Vizij Authoring
Status: planned (top-priority P1)

## 1) Scope and intent

This spec defines the next P1 tranche for pose authoring correctness:

1. formal pose-group semantics
2. two-layer pose blending in compile output
3. explicit pose-layer aggregate binding into rig variables
4. strict rig-layer boundaries and corresponding UI/diagnostics

Reference vision note:

`apps/vizij-authoring/docs/notes/pose-rig-two-layer-blend-vision-2026-02-11.md`

## 2) Target computational model

## 2.1 Authoring layers

1. Animatable layer: renderer-facing leaves.
2. Low-level rig layer: only layer that writes animatables.
3. Higher-order rig layer: drives rig variables only.
4. Pose group layer: blends poses inside each group.
5. Pose aggregate layer: blends pose-group outputs per rig target.

## 2.2 Pose semantics

1. A pose is a set of desired rig-variable values.
2. A pose is authored relative to neutral defaults.
3. A pose does not directly bind to animatables.

## 2.3 Group semantics

1. Pose groups are first-class entities (not only string labels).
2. Group identity participates in compile topology.
3. Group path form is hierarchical (`/<group>/<pose>/weight.value` or canonical equivalent).

## 2.4 Compile semantics

For each rig target variable:

1. blend all relevant poses within each pose group using that group strategy
2. blend resulting group outputs across groups using cross-group strategy (default additive)
3. bind resulting pose aggregate into rig-variable binding composition
4. evaluate parent/self rig expressions and continue chain to low-level animatable writes

## 3) Current-state alignment summary

## 3.1 Aligned

1. Poses currently target rig input ids.
2. Neutral baseline exists and is used in apply/capture flows.
3. Rig parent-binding expressions support multi-source composition.

## 3.2 Not aligned (must change)

1. Pose compiler currently performs one global blend layer across all poses, not two layers.
2. `pose.group` is metadata/path segment only; group is not first-class compiler structure.
3. No explicit pose aggregate nodes are exposed as binding sources in authoring UI.
4. No strict guard that higher-order rig variables cannot bind animatable leaves.

## 4) P1 implementation tracks

## P1-T1 Pose group domain model

Introduce first-class pose-group entities in authoring state:

1. id/path/name
2. local blend strategy
3. membership and validation metadata

Acceptance criteria:

1. groups are independently creatable/renamable/removable
2. poses are assigned by reference to group entities, not free-form text only
3. migration path preserves existing `pose.group` data

## P1-T2 Two-layer pose compiler

Extend pose graph build pipeline:

1. emit per-group per-target blend nodes
2. emit per-target cross-group blend nodes
3. expose explicit pose aggregate outputs wired to rig target variable paths

Acceptance criteria:

1. two groups targeting same variable blend deterministically
2. strategy can differ at group-local and cross-group layers
3. export/import roundtrip preserves equivalent graph behavior

## P1-T3 Rig boundary enforcement

Enforce low-level-only animatable write boundary:

1. higher-order rig variables cannot target animatable components directly
2. compiler diagnostics for invalid boundary crossings
3. migration helper for legacy direct bindings

Acceptance criteria:

1. invalid higher-order-to-animatable mappings are blocked or auto-migrated with explicit diagnostics
2. inspector clearly explains boundary violations
3. tests cover valid and invalid boundary scenarios

## P1-T4 Pose/rig binding semantics in UI

Update inspector and binding UIs to show aggregate semantics:

1. distinguish `pose entry` vs `pose group output` vs `pose aggregate output`
2. show target rig variable receives aggregate output, not a single pose directly
3. preserve clickthrough across pose -> group -> aggregate -> rig -> animatable

Acceptance criteria:

1. typed relationship chips and labels are consistent across inspector contexts
2. every shown relationship is actionable or explicitly read-only
3. chain breadcrumb remains stable during multi-hop navigation

## P1-T5 Pose-group and blend strategy UI

Add dedicated UI for:

1. pose group lifecycle
2. group-local blend strategy editing
3. cross-group strategy editing and preview

Acceptance criteria:

1. authors can configure strategies without touching raw JSON
2. strategy previews show expected target-value effect
3. strategy state is included in export/import contracts

## P1-T6 Migration/import/export updates

1. import supports explicit grouping strategy selection and mapping
2. export serializes first-class group/blend semantics
3. remap UI surfaces group-level conflicts and resolutions

Acceptance criteria:

1. legacy imports can be migrated with deterministic strategy choices
2. unresolved group topology conflicts are actionable
3. docs describe exact migration behavior

## P1-T7 Diagnostics and validation

Add targeted diagnostics:

1. no-group/no-membership conditions
2. missing aggregate-source conditions for rig targets
3. strategy conflict or unsupported configuration

Acceptance criteria:

1. diagnostics are visible during authoring and export validation
2. diagnostics link directly to relevant group/pose/target editor
3. regression tests cover each diagnostic class

## 5) Test requirements

1. compiler tests for two-layer blend topology and output equivalence
2. UI tests for group lifecycle and strategy edits
3. integration tests for pose aggregate binding surfacing in inspector
4. migration tests for legacy `pose.group` and legacy direct pose output assumptions

## 6) Rollout sequence

1. T1 domain model
2. T2 compiler
3. T3 boundary enforcement
4. T4/T5 UI
5. T6 migration/export
6. T7 diagnostics and full validation pass

All steps must keep `pnpm --filter vizij-authoring run validate` green and include focused tests for changed semantics.
