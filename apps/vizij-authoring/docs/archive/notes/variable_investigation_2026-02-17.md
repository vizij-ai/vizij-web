# Variable Investigation: Autorig Binding/What-I-Drive Behavior

## Status update date

- 2026-02-17

## Issue observed

When adding a driven target from a selected rig/input and then inspecting **What I Drive**:

1. The driven scene property appears (expected).
2. The corresponding `/autorig/...` intermediate input also appears in the Variables subsection (unexpected in this UX path).
3. In some sessions, moving the source slider still does not propagate to scene output, even though input UI updates show a binding exists.

The duplicate entry is now fixed in the UI by excluding direct downstream `/autorig` inputs from the downstream-variable list used by the inspector.

## Why this likely happened

- `collectDirectDownstreamRigInputs` enumerates direct children in `inputBindings` and currently did not distinguish between authored-level variables and low-level autorig variables.
- During **Add Driven Property**, selection is resolved to the corresponding autorig input via `autorigInputIdByComponentId`, and the parent-binding is created on that autorig input.
- Scene outputs are already represented in `collectRigDependents` by `bindings`.
- Result: one selected source can appear in both buckets:
  - autorig input in variable dependents
  - concrete scene targets in property dependents
- This produces the “one source, two entries” experience.

## What has already been changed

Commits in the current local chain that are directly related:

- `d7a9d24` — route rig-driven property bindings through autorig inputs.
- `a75290e` — scope rig-boundary checks to animatable targets.
- `88ef657` — replace drivers surface with inputs and update autorig namespace handling.
- `d0d7994` — detect and normalize legacy `/rig/element/...` autorig metadata.
- `636b4a3` — VariablesPanel input slider callback wiring fix.

Additional local fix in this change set:

- Updated `collectDirectDownstreamRigInputs` to ignore direct downstream autorig variables so they no longer render as duplicate “What I Drive” variable entries.
- Added a unit test in `rigConnections.test.ts` to lock this behavior in:
  - `omits direct child autorig inputs from downstream variable list`.

## Why slider flow still appears broken (still unsolved here)

The remaining runtime symptom (slider edits not visibly affecting face output) is likely not a UI list bug and still needs IR/runtime confirmation. The most plausible causes are:

1. **Binding split is incomplete for autorig targets**
   - The current add-driven-property flow creates/updates `inputBindings` for the autorig input, but scene target binding continuity may rely on a different identity than expected by runtime.
2. **Graph path canonicalization mismatch**
   - `autorig`/`rig/element` legacy alias handling is now broader, but there may still be an edge case where the runtime input id used for graph staging does not match what `buildRigGraphSpec` emits.
3. **Missing or stale compiled graph input edge**
   - The compiler may be emitting a graph that includes autorig nodes but not the expected parent -> child flow for the newly created link until a specific refresh/rebuild path runs.
4. **Source binding slot targeting**
   - `handleCreateParentDriverBinding` may be writing a valid parent slot, but downstream expression evaluation may be pointing at a stale slot/input alias in that binding.

## Next attempts to try (not implemented yet)

- Add a focused “binding integrity” debug log immediately after `handleAddRigDrivenVariable` runs:
  - selected input id
  - autorig target id
  - updated `inputBindings[targetAutorig]` and scene `bindings[targetProperty]`
- Run a compile-diff check before/after a new autorig-bound drive:
  - confirm new parent edge appears in `rigGraphSpec.inputs`
  - confirm output edge appears from new/updated rig expression to target property
- Capture and inspect runtime map in `graphInputBindingsByIdRef` for the source slider id after value change.
- Add one end-to-end regression test:
  - create custom input
  - add driven scene property
  - mutate input value
  - assert resulting animatable value changed and/or runtime input was staged for that graph input path.
