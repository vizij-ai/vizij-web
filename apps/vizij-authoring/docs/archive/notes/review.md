# Review Summary (vizij-web/.worktrees/vizij-workspace)

> **Status note (2026-02-11):** Findings 1 and 2 were addressed in subsequent runtime-react integration updates. Remaining items should be treated as active candidates and tracked via `apps/vizij-authoring/docs/notes/SYNTHESIS.md` and `apps/vizij-authoring/docs/plans/BACKLOG.md`.

## Findings (ordered by severity)

1. Blocking: Runtime asset updates don’t actually apply new rig/pose graphs.
   - File: packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx
   - setGraphBundle only updates pendingPlanRef/status; it never updates assetBundle state or triggers re-registration, so graph updates are dropped.

2. Important: Graph re-registration gate is brittle and likely not firing when graphs-only updates happen.
   - File: packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx
   - The registerControllers effect depends on ready/loading; graph-only updates via pendingPlanRef may not trigger a re-run.

3. Important: Export validation can use stale pose graph spec and ignores blend mode when recomputing.
   - File: apps/vizij-authoring/src/hooks/useVizijExport.ts
   - exportGlb validates poseRig.poseGraphSpec, while exportPoseGraphFile recomputes spec with PoseGraphService.buildSpec + blendMode. These can diverge.

4. Important: PoseGraphService.generateSummary still throws (TODO) and remains in backlog.
   - File: apps/vizij-authoring/src/poseRig/services/poseGraphService.ts
   - Runtime throw risk if a future caller reaches it.

5. Medium: Warnings are treated as graphError and now block staging/eval.
   - Files: apps/vizij-authoring/src/hooks/useRigController.ts, apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts
   - graphError is set on warning and gating logic skips staging/eval when graphError is truthy, freezing interactions even if graphStatus is ready.

## Questions

1. Is setGraphBundle intended as the public way to update runtime graphs in-place? If yes, should it update local state or directly trigger re-registration?
2. Should graphError represent fatal errors only? If warnings are allowed, should staging/eval be allowed while surfacing a warning state separately?

## Suggestions (fastest path to land)

1. Wire setGraphBundle to update asset bundle state or call registerControllers directly, and ensure a state change triggers controller re-registration when graphs change.
2. Make the registration effect respond to pendingPlanRef changes (or explicit graph update state) even if loading/ready don’t toggle.
3. Align pose export validation by recomputing pose spec (with blendMode) inside exportGlb, mirroring exportPoseGraphFile.
4. Replace generateSummary throw with a safe no-op or remove/guard any callers; update backlog once resolved.
