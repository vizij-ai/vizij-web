# PR Draft (For Saad): Runtime React + Pose Authoring Stabilization

Last updated: 2026-02-11  
Branch: `chris-work`  
Compare against: `vizij_workspace_as_authoring`

## Proposed PR Title

`feat(vizij-authoring): stabilize runtime-react execution, pose authoring flow, and chain editing reliability`

## Executive Summary

This branch is primarily about making `vizij-authoring` run correctly on `@vizij/runtime-react` and making poses behave correctly in that runtime path.

Most delivered value is:

1. runtime-react execution and graph update reliability,
2. pose authoring + blending behavior in runtime-react,
3. import/remap and inspector chain tooling that make migration/debugging workable.

What is still lightly touched:

1. reference-face copy workflows and shared-variable UX,
2. animation save/load product flow,
3. a number of UI polish and parity items.

---

## Feature Status Table

| Feature area                                  | Status      | What shipped                                                                                                                   | What remains                                                                                         |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Main face runtime execution (`runtime-react`) | `delivered` | Main face runs through runtime provider/face bridge with incremental graph updates and safer graph clear behavior.             | Continue performance and UX polish only.                                                             |
| Pose execution in runtime path                | `delivered` | Pose compile/apply path is stable in runtime-react; inspector controls and pose preview flows are functional.                  | Aggregate-source semantics still need clearer surfacing in editor UX.                                |
| Pose grouping + blend behavior                | `delivered` | First-class pose-group config + two-layer blend topology (within-group and cross-group) plus strategy controls in export flow. | Dedicated group lifecycle editor and import grouping strategies still needed.                        |
| Import/remap migration reliability            | `delivered` | Face-id mismatch handling, conflict-safe remap, and actionable migration suggestions improved significantly.                   | Better user-facing strategy controls and conflict explanations.                                      |
| Inspector chain authoring                     | `delivered` | Pose -> Rig -> Animatable clickthrough and binding editor parity are in place; slot resolution issues fixed.                   | Relationship labeling should better distinguish entry/group/aggregate semantics.                     |
| Variable authoring basics                     | `partial`   | Variable creation/editing is solid; tree/folder behavior from path hierarchy exists.                                           | Explicit folder management and advanced variable lifecycle workflows.                                |
| Reference-face copy workflows                 | `partial`   | Reference face can be loaded; matching/mapping tooling exists in standard feature spaces area.                                 | Shared-variables section, direct copy-to-main workflows, and clearer parity UX remain mostly undone. |
| Animation workflow                            | `partial`   | Timeline panel and track editing exist.                                                                                        | Save/load animation workflow and productized persistence are not finished.                           |
| Editing operations (undo/redo, locks)         | `open`      | Menu skeleton exists.                                                                                                          | Functional undo/redo and lock semantics are still missing.                                           |
| UI visual consistency                         | `open`      | Many panels now reflect current behavior.                                                                                      | Design cleanup remains: color consistency, iconography, sticky headers, and unified add/create UX.   |

---

## Narrative: What We Actually Focused On

## 1) Runtime React Reliability

The largest body of work was making the runtime execution model correct and predictable:

1. main face execution through runtime-react,
2. stable graph update/clear semantics,
3. reliable input staging and output application behavior.

Primary files:

- `apps/vizij-authoring/src/components/app/Viewer.tsx`
- `apps/vizij-authoring/src/hooks/useRigController.ts`
- `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts`
- `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`

## 2) Pose Authoring That Works in Runtime React

Second major focus was pose correctness in this runtime pipeline:

1. first-class pose-group model in config/store,
2. two-layer blend topology in pose graph compile,
3. practical inspector UX for playing and editing poses and pose groups.

Primary files:

- `apps/vizij-authoring/src/poseRig/store.tsx`
- `apps/vizij-authoring/src/poseRig/graphBuilder.ts`
- `apps/vizij-authoring/src/poseRig/services/poseConfigService.ts`
- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- `apps/vizij-authoring/src/components/inspector/InspectorPanel.tsx`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

## 3) Migration and Debugging Tooling

To support old assets and diagnosis:

1. import/remap behavior was hardened,
2. inspector chain traversal and binding edit entry points were improved,
3. known slider/binding resolution issues were fixed and tested.

Primary files:

- `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`
- `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`
- `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`
- `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`
- `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts`

---

## What Is Not Done (Important Continuity)

These are still major follow-ups and should not be treated as complete:

1. reference-face copy/parity workflows (shared variables, explicit copy-to-main),
2. dedicated dependency panel for variable -> shape relationships,
3. full animation save/load workflow,
4. robust undo/redo and lock semantics,
5. broader UI consistency and visual cleanup.

---

## UI Surfaces Touched (For Saad Cleanup)

Highest-impact touched files:

1. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
2. `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`
3. `apps/vizij-authoring/src/components/inspector/InspectorPanel.tsx`
4. `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
5. `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`
6. `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`
7. `apps/vizij-authoring/src/components/app/ExportPanel.tsx`

Cleanup intent:

1. improve hierarchy/readability and reduce density,
2. unify action affordances across inspector contexts,
3. tighten visual consistency without changing behavior contracts.

---

## API Contracts To Keep Stable During UI Cleanup

1. `useBindingAuthoring(...)`  
   Source: `apps/vizij-authoring/src/state/bindingAuthoringStore.tsx`
2. `usePoseRig(...)`  
   Source: `apps/vizij-authoring/src/state/PoseRigProvider.tsx`
3. `useGraphRuntime(...)`  
   Source: `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`
4. `useUnifiedSelection()`  
   Source: `apps/vizij-authoring/src/hooks/useUnifiedSelection.ts`
5. `resolveEffectiveBindingInputId(...)`  
   Source: `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts`
6. `resolveRuntimeGraphSpec(...)`  
   Source: `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts`

---

## Validation Status

Latest branch check:

1. `pnpm --filter vizij-authoring run validate` -> pass.
2. Vitest total -> `45` files, `200` tests, all passing.

---

## Detailed Handoff Continuity Table

Status key:

1. `done`: implemented and usable.
2. `partial`: supporting pieces exist, but workflow is not complete.
3. `open`: not implemented as a coherent feature.

| Item                                                                      | Status    | Continuity note                                                                           |
| ------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| Add shapes                                                                | `open`    | No explicit create-shape workflow in current scene surfaces.                              |
| Dependency panel (variables -> shapes)                                    | `partial` | Inspector has chain signal; no dedicated panel.                                           |
| Save / load animations                                                    | `partial` | Timeline exists; persistence workflow is missing.                                         |
| Create variable folder                                                    | `partial` | Path-derived folders exist; explicit folder actions do not.                               |
| Shared variables section (both faces)                                     | `partial` | Dual-face matching controls exist, but no dedicated Shared section.                       |
| Copy variables reference -> main                                          | `open`    | No direct copy workflow command.                                                          |
| Add variable definition                                                   | `done`    | Variable creation exists in Variables panel.                                              |
| Add preset definition                                                     | `open`    | No preset-creation flow.                                                                  |
| Import/export variable set definition                                     | `partial` | Rig/pose import/export exists, but no unified variable-set UX.                            |
| Idle behavior setting/editing                                             | `open`    | No user-facing idle behavior editor.                                                      |
| Procedural inputs (sin/cos/tan/noise)                                     | `open`    | Not implemented as first-class authoring inputs.                                          |
| Edit face-id                                                              | `partial` | Available via Debug panel; not yet polished product UX.                                   |
| Input Coverage                                                            | `partial` | Coverage panel exists and is tested, but not primary workflow.                            |
| Lock default features as non-editable                                     | `open`    | No lock model surfaced for defaults.                                                      |
| Inspector connected-variable list too broad                               | `open`    | Still tracked as active bug.                                                              |
| Pose sliders buggy/inconsistent                                           | `partial` | Major fixes landed; some semantics still need cleanup.                                    |
| Creating material without attached shape fails                            | `open`    | Still tracked as active bug.                                                              |
| Selecting variable to drive breaks hierarchy                              | `open`    | Still tracked as active bug.                                                              |
| Debug panel needs revision                                                | `open`    | Still debug-heavy and pending cleanup.                                                    |
| Undo/Redo does nothing                                                    | `open`    | Menu items exist but are not wired.                                                       |
| Reference face hierarchy not shown                                        | `open`    | Hierarchy shows reference file context, not full ref scene hierarchy.                     |
| Self rigs should be invisible/locked                                      | `open`    | Still tracked as active bug.                                                              |
| Visual cleanup (blue, old css, sticky titles, add UX, iconography/colors) | `open`    | Still pending dedicated design pass.                                                      |
| `buildPoseGraphSpec` wrapper in `PoseGraphService`                        | `done`    | Implemented as `PoseGraphService.buildSpec(...)` delegating to `buildPoseGraphSpec(...)`. |

---

## Reviewer Guidance

1. Keep behavior contracts stable; prefer compositional/styling cleanup.
2. If behavior changes are necessary, isolate them and add/adjust tests in the touched domain.
3. Prioritize continuity for runtime-react + pose flows before broadening scope to untouched parity features.
