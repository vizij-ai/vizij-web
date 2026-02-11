# Vizij Authoring Tracker

Last updated: 2026-02-11 (P1 complete)

Status legend: `done`, `in_progress`, `planned`, `blocked`

## Deliverables

1. D1 Main face migration to runtime-react: `done`
   Evidence: `apps/vizij-authoring/src/components/app/Viewer.tsx` now uses `VizijRuntimeProvider` + `VizijRuntimeFace`, with runtime input + graph bridges.
   Open: none.

2. D2 Tiered incremental graph updates: `done`
   Evidence: `setGraphBundle(..., { tier: "graphs" })` in viewer bridge; runtime override/reregister logic in `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`.
   Open: none.

3. D3 IR-first compile/apply gating: `done`
   Evidence: runtime graph gating and warning/error handling in `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts` and `apps/vizij-authoring/src/hooks/useRigController.ts`.
   Open: none.

4. D4 Pose authoring + blending runtime correctness: `done`
   Evidence: blend mode propagation and pose graph integration paths are present in `apps/vizij-authoring/src/poseRig/*` and runtime bridge/store wiring.
   Open: none.

5. D5 Export pipeline + docs alignment: `done`
   Evidence: GraphSpec fatal/normalize gating and pose graph validation in `apps/vizij-authoring/src/hooks/useVizijExport.ts`; test coverage exists in `apps/vizij-authoring/src/hooks/__tests__/useVizijExport.test.tsx`.
   Open: none.

## Regression Follow-ups (2026-02-11 deep review)

1. F1 Runtime graph clear semantics: `done`
   Evidence: graph-tier updates now clear omitted rig/pose payloads in `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`, with remove-transition coverage in `packages/@vizij/runtime-react/src/__tests__/updatePolicy.test.ts` and bridge transition coverage in `apps/vizij-authoring/src/components/app/Viewer.test.tsx`.
   Required: none.

2. F2 Runtime input restage on late readiness: `done`
   Evidence: runtime-input bridge availability subscription now replays staged inputs in `apps/vizij-authoring/src/hooks/useRigController.ts`, with regression coverage in `apps/vizij-authoring/src/hooks/__tests__/graphRuntime.test.ts`.
   Required: none.

3. F3 Import/trace migration ergonomics: `done`
   Scope:
   - done: deterministic face mismatch auto-resolve (strict residual-diff gate).
   - done: remap confidence/conflict handling and actionable trace suggestions.
   - done: preview/ignore/undo-safe suggestion application in `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`.
   - done: optional non-delta remap review and deterministic conflict auto-resolution in `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`.

4. F4 Leaf-level chain authoring and visibility: `done`
   Evidence:
   - leaf-level selection with explicit bulk binding confirmation is active in `apps/vizij-authoring/src/components/inspector/VariableSelector.tsx` and `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.
   - Variables pane is path-complete with source filters/badges in `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`.
   - chain summaries now derive from transitive trace state in `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx`.
   - active scene inspector now surfaces feature matrix and direct binding editors via `apps/vizij-authoring/src/components/inspector/FeatureList.tsx`.
     Required actions: none.

## P1 Focus Queue (Inspector Chain Authoring)

1. P1-I1 Chain drill-down routing across inspector modes: `done`
   Evidence:
   - chain navigation callbacks now route pose/rig/trace selections deterministically in `apps/vizij-authoring/src/components/inspector/BindingConnections.tsx` and `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.
   - rig -> scene navigation now focuses the concrete target binding and opens binding view in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx` and `apps/vizij-authoring/src/components/inspector/FeatureList.tsx`.

2. P1-I2 Binding-editor parity from pose/rig contexts: `done`
   Evidence:
   - pose mode now supports in-context binding editing modal for selected driven variables in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.
   - rig mode now supports in-context editing for driven scene target bindings in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.
   - scene/animatable context remains supported through `FeatureList` + `BindingEditor`.

3. P1-I3 Chain context affordances (navigation memory): `done`
   Evidence:
   - breadcrumb chain path with jump-back behavior is now rendered in inspector modes and tracked in `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.

4. P1-I4 Regression harness for chain authoring UX: `done`
   Evidence:
   - inspector routing callbacks are covered by `apps/vizij-authoring/src/components/inspector/BindingConnections.test.tsx`.
   - focused-slot resolution and quick-edit correctness are covered by `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.test.ts`.
   - coverage and pose rig kind roundtrip tests now exist in `apps/vizij-authoring/src/components/app/StandardInputCoveragePanel.test.tsx` and `apps/vizij-authoring/src/poseRig/services/poseConfigService.test.ts`.

5. P1-I5 Inspector slider fidelity tranche (binding validity + quick-edit correctness): `done`
   Evidence:
   - unsupported component self-slot states are guarded/surfaced in `apps/vizij-authoring/src/components/binding/BindingEditor.tsx`.
   - quick-edit sections use effective slot resolution in `apps/vizij-authoring/src/components/inspector/bindingSlotResolution.ts` and consuming inspector sections.
   - compile-time binding issues now surface in scene + rig/pose editing paths via `issues` wiring in `apps/vizij-authoring/src/components/inspector/FeatureList.tsx` and `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`.

## Validation Health

1. `pnpm --filter @vizij/runtime-react test -- src/__tests__/runtimeUpdatePolicy.test.ts`: `pass`.
2. `pnpm --filter vizij-authoring typecheck`: `pass`.
3. `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx src/components/inspector/rigConnections.test.ts src/components/inspector/VariableSelector.test.tsx src/hooks/__tests__/usePoseGraphImport.test.ts src/hooks/__tests__/useVizijExport.test.tsx src/hooks/__tests__/graphRuntime.test.ts src/utils/graphDiff.test.ts`: `pass` (31 tests).
4. Coverage status: `full app suite` via `vizij-authoring` validate run.
5. `pnpm --filter vizij-authoring run validate`: `pass` (lint + typecheck + full Vitest run, 44 files / 172 tests).

## Active Blockers

1. None identified after P1 closeout validation run.

## Immediate Exit Criteria for Stabilization

1. Keep `pnpm --filter vizij-authoring run validate` green while moving into P2 scope.
2. Preserve inspector chain parity/trace routing behavior via the new P1 regression tests.
