# Vizij Authoring Tracker

Last updated: 2026-02-11 (late)

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

1. P1-I1 Chain drill-down routing across inspector modes: `planned`
   Scope: driven/connected rows must route to concrete inspector selections and support sequential traversal pose -> rig -> animatable and reverse.
   Acceptance criteria: no reported relationship is non-navigable unless explicitly marked read-only.

2. P1-I2 Binding-editor parity from pose/rig contexts: `planned`
   Scope: expose BindingEditor-equivalent controls when entering from rig or pose workflows, and keep expression + slot edits consistent with animatable feature editor behavior.
   Acceptance criteria: users can author binding details without switching to a different workbench as a required step.

3. P1-I3 Chain context affordances (navigation memory): `planned`
   Scope: preserve chain context while drilling through nodes and provide deterministic return path to prior chain nodes.
   Acceptance criteria: authors can traverse and return without losing orientation.

4. P1-I4 Regression harness for chain authoring UX: `planned`
   Scope: add targeted tests for click-through routing + binding parity surfaces.
   Acceptance criteria: future inspector refactors fail fast when chain navigation/editing breaks.

5. P1-I5 Inspector slider fidelity tranche (binding validity + quick-edit correctness): `in_progress`
   Scope:
   - prevent unsupported `self` slot states for animatable/component bindings.
   - resolve quick-edit controls (transform/material/morph) against effective active slots, not only `slots[0]`.
   - surface compile-time binding issues directly in active `BindingEditor` panels.
     Acceptance criteria:
   - no quick-edit slider appears interactive while targeting an unresolved/non-driving source without an explicit issue message.
   - known "translation works, scale inert" repro class is either fixed or yields clear diagnostics tied to target binding issues.

## Validation Health

1. `pnpm --filter @vizij/runtime-react test -- src/__tests__/runtimeUpdatePolicy.test.ts`: `pass`.
2. `pnpm --filter vizij-authoring typecheck`: `pass`.
3. `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx src/components/inspector/rigConnections.test.ts src/components/inspector/VariableSelector.test.tsx src/hooks/__tests__/usePoseGraphImport.test.ts src/hooks/__tests__/useVizijExport.test.tsx src/hooks/__tests__/graphRuntime.test.ts src/utils/graphDiff.test.ts`: `pass` (31 tests).
4. Coverage status: `targeted` (not full-suite confidence).

## Active Blockers

1. None identified in the 2026-02-11 P0 tranche after targeted validation.

## Active Risks (P1)

1. Component-level `Slider (self)` can be authored from UI while compile path treats it as unavailable in that context, producing inert sliders without obvious feedback.
2. Multiple inspector quick-edit sections currently assume `slots[0]` is the active source, which can drift from expression-driving slots.
3. Binding issues are computed in controller state but not shown in active inspector `BindingEditor` call sites.

## Immediate Exit Criteria for Stabilization

1. Keep typecheck + targeted validation set green while P1 items are sequenced.
2. Complete P1-I1 through P1-I4 for inspector chain authoring.
3. Expand required validation set beyond targeted suites for broader confidence.
