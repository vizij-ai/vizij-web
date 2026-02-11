# Vizij Authoring Tracker

Last updated: 2026-02-11

Status legend: `done`, `in_progress`, `planned`, `blocked`

## Deliverables

1. D1 Main face migration to runtime-react: `in_progress`
   Evidence: `apps/vizij-authoring/src/components/app/Viewer.tsx` now uses `VizijRuntimeProvider` + `VizijRuntimeFace`, with runtime input + graph bridges.
   Open: close remaining runtime behavior gaps documented in `docs/notes/SYNTHESIS.md`.

2. D2 Tiered incremental graph updates: `in_progress`
   Evidence: `setGraphBundle(..., { tier: "graphs" })` in viewer bridge; runtime override/reregister logic in `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`.
   Open: verify behavior under broader authoring flows and larger bundles.

3. D3 IR-first compile/apply gating: `in_progress`
   Evidence: runtime graph gating and warning/error handling in `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts` and `apps/vizij-authoring/src/hooks/useRigController.ts`.
   Open: finalize warning semantics and runtime UI behavior alignment.

4. D4 Pose authoring + blending runtime correctness: `in_progress`
   Evidence: blend mode propagation and pose graph integration paths are present in `apps/vizij-authoring/src/poseRig/*` and runtime bridge/store wiring.
   Open: close import/export parity and summary service TODO.

5. D5 Export pipeline + docs alignment: `in_progress`
   Evidence: GraphSpec fatal/normalize gating and pose graph validation in `apps/vizij-authoring/src/hooks/useVizijExport.ts`; test coverage exists in `apps/vizij-authoring/src/hooks/__tests__/useVizijExport.test.tsx`.
   Open: align `exportGlb` pose validation path with recomputed pose graph/build options.

## Validation Health

1. `pnpm --filter @vizij/runtime-react test -- src/__tests__/runtimeUpdatePolicy.test.ts`: `pass`.
2. `pnpm --filter vizij-authoring typecheck`: `pass`.
3. `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx src/utils/__tests__/runtimeBundle.test.ts src/hooks/__tests__/useVizijExport.test.tsx`: `pass` (10 tests).
4. Coverage status: `targeted` (not full-suite confidence).

## Active Blockers

1. Higher-level rig diagnostics can report "No Driven properties" despite observed driving behavior.
2. Pose output variable lists lack actionable retarget/edit details for legacy-wired faces.
3. Pose -> rig -> face connection visibility is insufficient to diagnose wiring flow mismatches.
4. Import review mismatch workflow is too manual and does not auto-resolve safe rename/order-only differences.
5. `useRigController` runtime input bridge read path is non-reactive (`getState()` capture risk).
6. Graph playback controls are exposed but currently no-op.
7. Pose graph import action wiring is partially disconnected in export dialog path.
8. `PoseGraphService.generateSummary` remains an explicit throw path.
9. Export pose validation paths are split and can drift.

## Immediate Exit Criteria for Stabilization

1. Resolve all active blockers above or explicitly defer with owner/date.
2. Extend required validation set beyond current targeted tests.
3. Keep typecheck + targeted suites green while broadening confidence.
