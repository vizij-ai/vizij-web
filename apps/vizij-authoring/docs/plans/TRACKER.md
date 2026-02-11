# Vizij Authoring Tracker

Last updated: 2026-02-11

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
   Open: guard uncaught `exportPoseGraphFile` build failures.

## Regression Follow-ups (2026-02-11 deep review)

1. F1 Runtime graph clear semantics: `blocked`
   Evidence: graph bridge can omit rig/pose payloads, but runtime merge path may keep prior graphs.
   Required: explicit graph removal behavior in `setGraphBundle` flow + tests for graph remove transitions.

2. F2 Runtime input restage on late readiness: `blocked`
   Evidence: input staging can happen before `stageRuntimeInput` exists, without replay on runtime-ready transition.
   Required: readiness-triggered restage hook and targeted regression test.

3. F3 Import/trace migration ergonomics: `in_progress`
   Scope:
   - done: deterministic face mismatch auto-resolve (strict residual-diff gate).
   - done: remap confidence/conflict handling and actionable trace suggestions.
   - open: preview/ignore/undo-safe suggestion application and broader remap coverage for migration edge cases.

4. F4 Leaf-level chain authoring and visibility: `blocked`
   Evidence:
   - "Add Driven Variable" binds whole features (for example translation x/y/z) instead of leaf targets.
   - Variables pane does not list all path-backed standard inputs.
   - top summaries still show direct-slot relationships while trace panel is transitive-chain aware.
   - legacy `main` inspector affordances (feature matrix + direct `BindingEditor` path) are not surfaced in current active inspector flow.
     Required actions: component-level selector and binding edits; path-complete Variables pane with source filtering; chain-consistent summaries across inspector views; restore direct feature/leaf binding-expression editing and static-vs-animatable controls in active inspector modes.

## Validation Health

1. `pnpm --filter @vizij/runtime-react test -- src/__tests__/runtimeUpdatePolicy.test.ts`: `pass`.
2. `pnpm --filter vizij-authoring typecheck`: `pass`.
3. `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx src/utils/__tests__/runtimeBundle.test.ts src/hooks/__tests__/useVizijExport.test.tsx src/components/inspector/rigConnections.test.ts src/hooks/__tests__/usePoseGraphImport.test.ts src/utils/graphDiff.test.ts src/poseRig/services/poseGraphService.test.ts`: `pass` (26 tests).
4. Coverage status: `targeted` (not full-suite confidence).

## Active Blockers

1. Graph clear/remove path can leave stale runtime controllers active.
2. Runtime defaults may not stage automatically when runtime becomes ready after graph setup.
3. Import/trace migration tooling still requires manual recovery in common legacy remap scenarios.
4. Leaf-level driven-variable authoring is missing (feature-level bulk bind regression).
5. Variables pane is not path-complete for all standard inputs.
6. Inspector chain summaries are not consistently transitive across views.

## Immediate Exit Criteria for Stabilization

1. Resolve F1/F2 blocking runtime correctness regressions and add regression tests.
2. Resolve F4 chain-authoring tranche (leaf-level binding + path-complete variables + transitive summaries).
3. Close remaining F3 migration UX gaps (preview/ignore/undo-safe apply + broader remap coverage).
4. Keep typecheck + targeted validation set green while follow-ups land.
