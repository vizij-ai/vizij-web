# Vizij Authoring Code Quality Review

Date: 2026-02-19  
Scope: `apps/vizij-authoring`  
Review mode: multi-agent principle review (correctness, DRY, separation of concerns, type safety, React performance, test completeness, resilience/error handling)

## Method

1. Ran focused sub-agent reviews, one principle per agent.
2. Consolidated findings by severity and deduplicated overlaps.
3. Converted findings into an execution-ready backlog with dependency/parallelization lanes.

## Executive Summary

Total findings: 19  
High: 8  
Medium: 11  
Low: 0

Primary risk clusters:

1. Silent failure paths in loading/import workflows.
2. Runtime/UI rerender pressure from broad subscriptions and unstable object identity in `App`.
3. Boundary leakage between UI components and compiler/runtime concerns.
4. Type safety erosion from `any` and weak contracts in key runtime pathways.
5. Test gaps for behavior-level validation of recently landed cross-group policy semantics.

## Findings

## High Severity

1. Correctness: discrepancy-review acceptance key can collide and skip required review for changed graphs.
   File: `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`

2. React performance/correctness: `runtimeBundle` identity changes every render, causing avoidable viewer/runtime churn.
   File: `apps/vizij-authoring/src/App.tsx`

3. React performance: unused `useGraphRuntime` subscriptions force top-level workspace rerenders.
   File: `apps/vizij-authoring/src/App.tsx`

4. Resilience: GLB loading errors are captured but not surfaced to users.
   File: `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts`

5. Resilience: built-in sample load failures are silently swallowed (console-only).
   File: `apps/vizij-authoring/src/App.tsx`

6. DRY: hierarchy panel logic is duplicated across two implementations, high divergence risk.
   Files: `apps/vizij-authoring/src/components/panels/HierarchyPanel.tsx`, `apps/vizij-authoring/src/components/scene-composer/SceneHierarchyPanel.tsx`

7. Separation of concerns: `useRigController` mixes UI filtering/selection state with runtime graph orchestration responsibilities.
   File: `apps/vizij-authoring/src/hooks/useRigController.ts`

8. Testing completeness: E4 behavior scenarios are documented but not validated end-to-end as numeric output behavior.
   File: `apps/vizij-authoring/docs/notes/pose-rig-overlap-heuristics-2026-02-19.md`

## Medium Severity

1. Correctness/API contract: `poseGroupSegment` is exposed but currently unused in compile path.
   Files: `apps/vizij-authoring/src/poseRig/services/poseGraphService.ts`, `apps/vizij-authoring/src/poseRig/graphBuilder.ts`

2. DRY: duplicated standard-input merge logic in feature-spaces panels with inconsistent dedup behavior.
   Files: `apps/vizij-authoring/src/components/panels/StdFeatureSpacesChannelsPanel.tsx`, `apps/vizij-authoring/src/components/panels/StdFeatureSpacesControls.tsx`

3. Separation of concerns: `DebugPanel` performs compile/rebundle domain work inline.
   File: `apps/vizij-authoring/src/components/panels/DebugPanel.tsx`

4. Separation of concerns: diagnostics diff/paste parsing logic lives inside presentation component.
   File: `apps/vizij-authoring/src/components/app/GraphDiagnosticsPanel.tsx`

5. Type safety: scene feature entry contract uses `any` for value payload.
   File: `apps/vizij-authoring/src/scene/featureEntries.ts`

6. Type safety: material constraints editing uses `as any` for constraint updates.
   File: `apps/vizij-authoring/src/components/inspector/RiggingMaterialSection.tsx`

7. Type safety: runtime graph output handling casts `unknown` to `any` without type guards.
   File: `apps/vizij-authoring/src/hooks/graphRuntime.ts`

8. React performance: shared variable sync context value is recreated each render; broad context invalidation risk.
   Files: `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`, `apps/vizij-authoring/src/state/SharedVariableSyncContext.tsx`, `apps/vizij-authoring/src/App.tsx`

9. Resilience: bundle synchronizer import failures are mostly console-only and can leave users unaware of rejected bundle state.
   File: `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts`

10. Testing quality: E4 tests over-index on node IDs/topology naming rather than behavior outputs.
    Files: `apps/vizij-authoring/src/poseRig/graphBuilder.test.ts`, `apps/vizij-authoring/src/poseRig/services/poseGraphService.test.ts`

11. Testing completeness: missing interactive store-level coverage for override editing and diagnostics behavior in authoring workflows.
    File: `apps/vizij-authoring/src/poseRig/store.test.ts`

## Positive Signals

1. The IR/config/compiler pipeline has strong deterministic and normalization coverage.
2. Diagnostic infrastructure is mature and already leveraged in most pose import/compile flows.
3. E4 policy semantics landed with meaningful foundational tests and documentation.

## Recommended Execution Strategy

1. Fix user-facing correctness/resilience first.
2. Address top rerender/perf pressure points in `App` and context identity.
3. Isolate domain logic from UI panels and large controller hooks.
4. Tighten TypeScript contracts to reduce runtime-check burden.
5. Harden behavior-level tests to protect future policy refactors.

See: `apps/vizij-authoring/docs/plans/BACKLOG_QUALITY_2026-02-19.md`
