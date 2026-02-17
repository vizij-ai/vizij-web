# Vizij Authoring Tracker

Last updated: 2026-02-17 (P1 control-surface refactor + rig metadata normalization active)

Status legend: `done`, `in_progress`, `planned`, `blocked`

## Progress Snapshot

1. P0 stabilization is complete and still green.
2. Prior P1 chain-parity tranche is complete.
3. Pose architecture tranche has landed first-class group model + two-layer compile + blend controls.
4. Additional P1 focus is now a control-surface refactor (Face Elements, Variables, Poses, Pose Groups, Drivers) plus `/rig/element` handling for auto-generated rig inputs.
5. Remaining P1 focus is on aggregate binding surfacing, hard boundary enforcement, and diagnostics/import strategy completeness.

## Deliverables

1. D1 Main face migration to runtime-react: `done`
   Evidence: `apps/vizij-authoring/src/components/app/Viewer.tsx` uses `VizijRuntimeProvider` + `VizijRuntimeFace` with runtime input + graph bridges.
   Open: none.

2. D2 Tiered incremental graph updates: `done`
   Evidence: graph-tier updates via `setGraphBundle(..., { tier: "graphs" })` and runtime update/clear handling in `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`.
   Open: none.

3. D3 IR-first compile/apply gating: `done`
   Evidence: runtime graph gating and warning/error behavior in `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts` and `apps/vizij-authoring/src/hooks/useRigController.ts`.
   Open: none.

4. D4 Pose authoring + blending runtime correctness: `done`
   Evidence:
   - first-class pose-group config + normalization in `apps/vizij-authoring/src/poseRig/services/poseConfigService.ts`.
   - pose-group aware store state in `apps/vizij-authoring/src/poseRig/store.tsx`.
   - two-layer group + cross-group compile topology in `apps/vizij-authoring/src/poseRig/graphBuilder.ts`.
   - blend control surface in `apps/vizij-authoring/src/components/app/ExportPanel.tsx`.
     Open: aggregate-source surfacing in inspector semantics is still a P1 follow-up item.

5. D5 Export pipeline + docs alignment: `done`
   Evidence: GraphSpec/pose compile gating and warnings in `apps/vizij-authoring/src/hooks/useVizijExport.ts`; coverage in `apps/vizij-authoring/src/hooks/__tests__/useVizijExport.test.tsx`.
   Open: none.

6. D6 Authoring control-surface decomposition and rig metadata normalization: `in_progress`
   Scope: split Face Elements / Variables / Poses / Pose Groups / Drivers and normalize auto-generated rig inputs under `/rig/element`.
   Evidence: pending implementation.
   Open:
   - control-surface decomposition and pose-group UX tasks in `apps/vizij-authoring/docs/plans/BACKLOG.md`.
   - `/rig/element` namespace behavior in `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`.

## Regression Follow-ups (Deep Review + Quori Smoke)

1. F1 Runtime graph clear semantics: `done`
   Evidence: graph-tier omission now clears stale rig/pose payloads in `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`, covered by `packages/@vizij/runtime-react/src/__tests__/updatePolicy.test.ts` and `apps/vizij-authoring/src/components/app/Viewer.test.tsx`.

2. F2 Runtime input restage on late readiness: `done`
   Evidence: runtime input bridge availability replay in `apps/vizij-authoring/src/hooks/useRigController.ts`, covered by `apps/vizij-authoring/src/hooks/__tests__/graphRuntime.test.ts`.

3. F3 Import/remap migration ergonomics: `done`
   Evidence: deterministic face mismatch handling in `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`; conflict-safe remap planning in `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`; review/apply UX in `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`.

4. F4 Inspector chain parity and leaf-level authoring: `done`
   Evidence:
   - leaf-level property binding selection + explicit bulk in `apps/vizij-authoring/src/components/inspector/VariableSelector.tsx`.
   - path-complete variable surfaces in `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`.
   - chain-aware navigation and binding edits in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx` and `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`.

## P1 Completed Tranches

1. P1-I Inspector chain traversal + binding parity: `done`
   Evidence: Pose <-> Rig <-> Animatable clickthrough and chain breadcrumbs in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.

2. P1-Q Quori smoke correction tranche: `done`
   Evidence:
   - terminology normalization and dual add-driven IA in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.
   - quick-edit effective slot resolution in `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts`.
   - root-vs-missing parent state clarity and legacy id remap in `apps/vizij-authoring/src/poseRig/services/poseConfigService.ts`.

3. P1-A Pose architecture implementation tranche: `done`
   Evidence:
   - first-class pose-group model in `apps/vizij-authoring/src/poseRig/types.ts` and `apps/vizij-authoring/src/poseRig/store.tsx`.
   - two-layer pose blend compile in `apps/vizij-authoring/src/poseRig/graphBuilder.ts`.
   - blend strategy controls surfaced in `apps/vizij-authoring/src/components/app/ExportPanel.tsx`.
   - pose group migration/reassignment hardening in `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts`.

4. P1-U Pose inspector and pose-group UX tranche: `done`
   Evidence:
   - pose target label and expanded numeric field width in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.
   - pose preview from neutral baseline with solo semantics in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.
   - sidebar pose-group inspector flow in `apps/vizij-authoring/src/components/inspector/InspectorPanel.tsx` and `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`.
   - low-level rig control authority fixes in `apps/vizij-authoring/src/hooks/useRigController.ts`.

## P1 Remaining Queue

1. R0 Dedicated authoring surfaces for Variables, Poses, Pose Groups, and Drivers: `in_progress`
   Scope:
   - dedicated pane organization on the left column: Face Elements, Variables, Poses, Pose Groups, Drivers.
   - one globally selected item is shared between panes.
   - Variables pane supports true external inputs only, path-grouped key-value controls, and opens sliders directly for selected leaf values.
   - Poses pane shows all defined poses, with inspector affordance to see group membership and add/remove group membership.
   - Pose Groups pane supports list/inspect/edit for group membership plus cross-group blend-mode selection.
   - Pose Group inspector supports local blend-mode selection.
   - Drivers pane makes explicit what each selected item drives and what drives it.

2. R1 Aggregate-source semantics in inspector/binding UI: `in_progress`
   Scope:
   - explicitly surface pose entry vs group output vs final aggregate output in chain labels and editors.
   - route binding edits against aggregate pose-layer outputs where appropriate.
   - align with new Poses/Pose Groups panes for consistent click-through behavior.

3. R2 Rig metadata namespace + exclusion (`/rig/element`): `planned`
   Scope:
   - auto-generated animatable-driven rig inputs are normalized under the `rig/element` path prefix.
   - hide `/rig/element` entries from Variables panel + Drivers.
   - preserve behavior by treating these entries as aliases to their corresponding face properties in rig contexts.
   - update migration/import behavior if required to preserve existing references.

4. R3 Rig boundary enforcement and diagnostics: `planned`
   Scope:
   - enforce low-level-only animatable write boundary for rig variables.
   - block/report invalid higher-order direct animatable writes with migration guidance.

5. R4 First-class pose-group lifecycle editor: `planned`
   Scope:
   - create/rename/delete group entities directly (not only through pose path edits).
   - keep deterministic membership + conflict handling in UI.

6. R5 Import grouping strategy controls: `planned`
   Scope:
   - expose preserve/map/prefix/flatten style grouping strategies in remap/import workflow.
   - show deterministic pre-apply outcome preview for group topology.

7. R6 Pose architecture diagnostics expansion: `planned`
   Scope:
   - add diagnostics for empty groups, missing aggregate contributors, boundary violations, and unresolved target coverage.
   - route each diagnostic to the owning editor context.

Tracking spec: `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`.

## Validation Health

1. `pnpm --filter vizij-authoring run validate`: `pass` (lint + typecheck + full Vitest run, 45 files / 200 tests).
2. Pose/inspector regression tests are green, including:
   - `apps/vizij-authoring/src/components/inspector/BindingConnections.test.tsx`
   - `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.test.ts`
   - `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.test.tsx`
   - `apps/vizij-authoring/src/poseRig/graphBuilder.test.ts`

## Active Blockers

1. No hard runtime blockers.
2. Remaining work is semantic/editor completeness in P1 queue (R0-R6).

## Exit Criteria for P1 Wrap

1. Aggregate pose-source semantics are visible and actionable in inspector/binding flows.
2. Rig boundary constraints are enforced with migration-grade diagnostics.
3. Import strategy + group lifecycle surfaces are deterministic and tested.
4. `pnpm --filter vizij-authoring run validate` stays green after each tranche.
