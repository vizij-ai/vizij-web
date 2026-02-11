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
   Open: none.

## Validation Health

1. `pnpm --filter @vizij/runtime-react test -- src/__tests__/runtimeUpdatePolicy.test.ts`: `pass`.
2. `pnpm --filter vizij-authoring typecheck`: `pass`.
3. `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx src/utils/__tests__/runtimeBundle.test.ts src/hooks/__tests__/useVizijExport.test.tsx src/components/inspector/rigConnections.test.ts src/hooks/__tests__/usePoseGraphImport.test.ts src/utils/graphDiff.test.ts src/poseRig/services/poseGraphService.test.ts`: `pass` (26 tests).
4. Coverage status: `targeted` (not full-suite confidence).

## Active Blockers

1. None. P0 blockers cleared on 2026-02-11.

## Immediate Exit Criteria for Stabilization

1. Resolved: all active blockers above are closed.
2. Resolved: targeted validation set now includes runtime policy, viewer/runtime bundle, export flow, trace diagnostics, pose import remap helper, graph diff canonicalization, and pose graph service tests.
3. Resolved: typecheck + targeted suites are green.
