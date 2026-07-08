# Quori Smoke Findings and Action Plan

Last updated: 2026-02-11
Scope: inspector + import/migration behavior observed during Quori face smoke testing.
Status: mostly resolved; active residual items are tracked in `plans/BACKLOG.md` P1 remaining queue.

## Executive Summary

The smoke run surfaced three distinct problem classes:

1. Terminology and inspector affordances are inconsistent with the graph mental model ("what drives me" vs "what I drive").
2. Some inspector controls appear inert due binding/input-id resolution gaps, especially on legacy-loaded data.
3. Pose import and pose-binding inspection are strict id-based today, which makes legacy pose outputs look disconnected when ids drift.

This is not a source-asset absence problem for Quori transforms: `L_Eye` scale is present and animated in RobotData.

## Confirmed Facts

1. Quori `L_Eye` includes animated `translation`, `rotation`, and `scale` RobotData features.
2. Pose values are keyed by standard input ids (variables), not direct scene property target ids.
3. Disabling animatable features currently removes corresponding auto low-level rig inputs after blueprint rebuild (unless preserved as custom/manual state).

## Findings

### F1. Terminology in inspector is still mixed and ambiguous

- Current labels (`Binding Editor`, `Edit binding`, `Driving`) do not consistently encode perspective.
- Users cannot quickly distinguish:
  - "inputs that drive this variable/property"
  - "variables/properties this variable drives"

Impact: chain traversal works, but authoring intent is harder to understand than necessary.

### F2. Rig inspector action labeling does not match behavior

- The `Add Driven Variable` action in rig inspector opens scene-property selection and only handles `selection.type === "property"`.
- There is no parallel "add driven variable" flow from this action.

Impact: button text and modal behavior are mismatched, causing confusion and wrong expectations.

### F3. Inert quick-edit controls likely stem from unresolved binding input ids in quick sections

- `BindingEditor` has fallback resolution for normalized/legacy slot ids.
- Quick-edit sections (`Transform`, `Morph`, `Material`) currently rely on direct `standardInputsById.get(resolvedInputId)` from slot selection logic.
- For legacy/non-canonical ids, quick sections can treat bindings as unbound while the binding editor still appears valid.

Impact: users can see "bound" relationships in one place while sliders in quick strips appear non-functional in another.

### F4. "No Parent Binding" in pose binding editor is overloaded

- It can mean either:
  - valid root variable (no parent binding by design), or
  - unresolved/missing parent chain due import/mapping drift.

Impact: users interpret many cases as breakage because UI does not disambiguate root vs mismatch.

### F5. Pose config normalization prunes by exact input id only

- `PoseConfigService.normalize` keeps neutral/pose values only when ids exist in current `standardInputs`.
- No path/source-id based remap is attempted during config import.

Impact: legacy pose configs can silently drop meaningful values after id evolution, leaving poses looking disconnected.

### F6. Variable/property chain legend is implicit

- Inspector currently uses visual cues (colors/chips) but not explicit grouped labels for:
  - downstream variables
  - downstream properties

Impact: chain readability is weaker than required for migration debugging.

## Clarifications to Keep in Docs

1. Animatables come from GLB RobotData features (shape/group transform/material/morph descriptors).
2. Each animatable vector feature maps to leaf component targets (`:x`, `:y`, `:z` or `:r`, `:g`, `:b`) in the binding graph.
3. Standard rig inputs are the variable layer; bindings connect variables to leaf targets; inputBindings connect variables to upstream variables.
4. Poses drive variables (input ids), not direct scene property targets.

## Implementation Plan (Ready for Fixes)

1. Inspector terminology and IA pass:
   - rename tabs/buttons to perspective-first language (`My Inputs`, `What I Influence`, etc.).
   - split rig quick action into `Add Driven Property` and `Add Driven Variable`.
   - add explicit grouped headers and counts for downstream variable/property sections.

2. Quick-edit binding resolution hardening:
   - unify quick-section driver lookup with the same normalized fallback path used in `BindingEditor`.
   - surface explicit inline reason when a target is unresolved (instead of silent inert controls).

3. Pose binding disambiguation:
   - show `Root variable (no parent binding)` vs `Missing parent binding` states explicitly.
   - provide CTA only for actionable missing-link cases.

4. Legacy pose import remap pass:
   - add optional id remap by normalized path/source-id before pruning.
   - emit explicit migration report: remapped, pruned, unresolved.

5. Regression tests:
   - quick-edit resolves legacy-normalized slot ids.
   - rig inspector dual add flow (variable + property).
   - pose import remap keeps values across id drift.
   - root-variable pose binding state is not flagged as error.

## Acceptance Criteria for This Tranche

1. Quori `L_Eye` scale controls are functional and explainable in both quick and binding-editor views.
2. Rig inspector actions clearly separate driving properties vs driving variables.
3. Pose binding modal clearly distinguishes root/no-parent from missing-link states.
4. Legacy pose configs retain expected values via deterministic remap or produce explicit unresolved diagnostics.
5. Inspector chain surfaces are labeled by relationship type (variables vs properties), not only by color.
