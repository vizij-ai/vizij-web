# P1 Pose Authoring Chain Spec

Last updated: 2026-02-17
Owner: Vizij Authoring
Status: in_progress (top-priority P1, partial implementation landed)

## 1) Scope and intent

This spec defines the next P1 tranche for pose authoring correctness:

1. formal pose-group semantics
2. two-layer pose blending in compile output
3. explicit pose-layer aggregate binding into rig variables
4. strict rig-layer boundaries and corresponding UI/diagnostics
5. control-surface decomposition for Face Elements / Variables / Poses / Pose Groups / Drivers and `/rig/element` metadata handling

Reference vision note:

`apps/vizij-authoring/docs/notes/pose-rig-two-layer-blend-vision-2026-02-11.md`

## 2) Target computational model

## 2.1 Authoring layers

1. Animatable layer: renderer-facing leaves.
2. Low-level rig layer: only layer that writes animatables.
3. Higher-order rig layer: drives rig variables only.
4. Pose group layer: blends poses inside each group.
5. Pose aggregate layer: blends pose-group outputs per rig target.
6. Rig metadata alias layer: auto-generated animatable-driven rig bindings with stable path namespaces (`/rig/element/...`) that are represented as metadata aliases in authoring UI.

## 2.2 Pose semantics

1. A pose is a set of desired rig-variable values.
2. A pose is authored relative to neutral defaults.
3. A pose does not directly bind to animatables.
4. Poses are surfaced as primary-face authoring constructs first; secondary-face workflows are deferred.

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
4. First-class pose-group entities are normalized in pose config/store state.
5. Compiler emits two-layer pose blending (group-local + cross-group).
6. Authoring UI exposes default group and cross-group blend strategy selection.
7. Sidebar pose-group inspector allows group-level previewing (weights/solo/reset) against neutral baseline.

## 3.2 Not aligned (must change)

1. Pose aggregate nodes are not yet surfaced as first-class binding sources in inspector semantics.
2. No strict guard yet that higher-order rig variables cannot bind animatable leaves.
3. Group lifecycle UI is still path-first; explicit create/rename/delete group workflows need dedicated surface.
4. Import/remap strategy controls for grouping and topology conflict handling are still implicit.
5. Diagnostics for aggregate/boundary/group-coverage gaps are not yet complete in editor/export surfaces.
6. Control panel still does not guarantee dedicated Face Elements / Variables / Poses / Pose Groups / Drivers surfaces; pose/group membership editing and `/rig/element` exclusion are pending.

## 4) P1 implementation tracks

## P1-T1 Pose group domain model (`done`)

Introduce first-class pose-group entities in authoring state:

1. id/path/name
2. local blend strategy
3. membership and validation metadata

Acceptance criteria:

1. groups are independently creatable/renamable/removable
2. poses are assigned by reference to group entities, not free-form text only
3. migration path preserves existing `pose.group` data

## P1-T2 Two-layer pose compiler (`done`)

Extend pose graph build pipeline:

1. emit per-group per-target blend nodes
2. emit per-target cross-group blend nodes
3. expose explicit pose aggregate outputs wired to rig target variable paths

Acceptance criteria:

1. two groups targeting same variable blend deterministically
2. strategy can differ at group-local and cross-group layers
3. export/import roundtrip preserves equivalent graph behavior

## P1-T3 Rig boundary enforcement (`planned`)

Enforce low-level-only animatable write boundary:

1. higher-order rig variables cannot target animatable components directly
2. compiler diagnostics for invalid boundary crossings
3. migration helper for legacy direct bindings

Acceptance criteria:

1. invalid higher-order-to-animatable mappings are blocked or auto-migrated with explicit diagnostics
2. inspector clearly explains boundary violations
3. tests cover valid and invalid boundary scenarios

## P1-T4 Pose/rig binding semantics in UI (`in_progress`)

Update inspector and binding UIs to show aggregate semantics:

1. distinguish `pose entry` vs `pose group output` vs `pose aggregate output`
2. show target rig variable receives aggregate output, not a single pose directly
3. preserve clickthrough across pose -> group -> aggregate -> rig -> animatable

Acceptance criteria:

1. typed relationship chips and labels are consistent across inspector contexts
2. every shown relationship is actionable or explicitly read-only
3. chain breadcrumb remains stable during multi-hop navigation

## P1-T5 Pose-group and blend strategy UI (`in_progress`)

Add dedicated UI for:

1. pose group lifecycle
2. group-local blend strategy editing (inspector-level)
3. cross-group strategy editing and preview (Pose Groups pane-level)

Acceptance criteria:

1. authors can configure strategies without touching raw JSON
2. strategy previews show expected target-value effect
3. strategy state is included in export/import contracts

## P1-T6 Migration/import/export updates (`planned`)

1. import supports explicit grouping strategy selection and mapping
2. export serializes first-class group/blend semantics
3. remap UI surfaces group-level conflicts and resolutions

Acceptance criteria:

1. legacy imports can be migrated with deterministic strategy choices
2. unresolved group topology conflicts are actionable
3. docs describe exact migration behavior

## P1-T7 Diagnostics and validation (`planned`)

Add targeted diagnostics:

1. no-group/no-membership conditions
2. missing aggregate-source conditions for rig targets
3. strategy conflict or unsupported configuration

Acceptance criteria:

1. diagnostics are visible during authoring and export validation
2. diagnostics link directly to relevant group/pose/target editor
3. regression tests cover each diagnostic class

## P1-T8 Authoring surface decomposition (`planned`)

Define and enforce new left-side surface topology:

1. Variables pane shows only true external inputs and path-grouped controls.
2. Poses pane is complete, independent list of all primary-face poses; pose inspector includes group-membership section with add/remove actions.
3. Pose Groups pane allows direct create/rename/delete/membership management plus cross-group blend-mode controls.
4. Pose Group inspector adds local blend-mode controls.
5. Drivers pane shows explicit incoming/outgoing relationship rows with deterministic navigation targets.
6. Rig auto-generated paths under `/rig/element` are hidden from Variables and Drivers and surfaced as rig metadata aliases.

Acceptance criteria:

1. A primary user flow can move between Variables, Poses, Pose Groups, and Drivers without reopening panels.
2. Inspecting a pose from Poses pane reveals all groups the pose belongs to and allows membership edits.
3. Inspecting a pose group exposes local blend-mode selector.
4. Inspecting a pose group in the Pose Groups pane exposes cross-group blend mode.
5. No `/rig/element` path is selectable from Variables for binding edits.
6. `/rig/element`-scoped rig variables still resolve to their corresponding runtime effect during rig-level inspection.

## P1-T9 Rig metadata namespace and aliasing (`planned`)

Standardize generated rig variable namespaces:

1. Lower-level generated rig inputs for animatable-driven paths are prefixed with `/rig/element`.
2. Those entries are treated as metadata aliases for face-property control, not direct variables.
3. Normalization logic for import/export/migration handles historical references consistently.

Acceptance criteria:

1. Authoring state emits `/rig/element`-prefixed rig paths for generated inputs.
2. Variables panel and Drivers filtering exclude these entries by default.
3. Rig inspector can trace the underlying face-property target for a `/rig/element` entry without exposing it as a user-edit variable.
4. Existing assets import with clear diagnostics if references are missing or ambiguous.

## 5) Test requirements

1. compiler tests for two-layer blend topology and output equivalence
2. UI tests for group lifecycle and strategy edits
3. integration tests for pose aggregate binding surfacing in inspector
4. migration tests for legacy `pose.group` and legacy direct pose output assumptions

## 6) Rollout sequence

1. T1 domain model (`done`)
2. T2 compiler (`done`)
3. T5 blend controls (`in_progress`, strategy controls landed; lifecycle/editor parity pending)
4. T4 aggregate-source semantics + chain labeling (`in_progress`)
5. T8 control-surface decomposition (`planned`)
6. T9 rig metadata namespace and aliasing (`planned`)
7. T3 boundary enforcement (`planned`)
8. T6 migration/import grouping strategy (`planned`)
9. T7 diagnostics and full validation pass (`planned`)

All steps must keep `pnpm --filter vizij-authoring run validate` green and include focused tests for changed semantics.
