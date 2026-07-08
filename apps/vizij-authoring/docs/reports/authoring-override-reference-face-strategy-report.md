# Authoring Override Pipeline Plan: Reference Face Strategy Report

Last updated: 2026-02-26
Status: `baseline-analysis-with-execution-update`

Follow-on planning docs:

1. `apps/vizij-authoring/docs/references/authoring-reference-face-workflow-sop.md`
2. `apps/vizij-authoring/docs/plans/authoring-reference-face-implementation-plan.md`

## Executive Summary

Recommendation: **do not delete and restart the current reference-face implementation**.

Best path: **iteratively evolve the existing implementation** toward the target requirements, with a performance-first refactor in the same effort.

Why:

1. The current system already has working dual-face runtime wiring and copy-entry points.
2. A restart would recreate a large amount of plumbing before delivering user value.
3. The biggest problem (unresponsiveness) is concentrated in specific synchronization and rendering hot paths that can be refactored incrementally.

## Implementation Progress Update (2026-02-26)

Executed milestone commits:

1. `973b873` - introduced reference catalog extraction and deterministic copy proposal/preflight models.
2. `d3dbf62` - replaced direct variable copy writes with a mapping modal confirm flow.
3. `5b2d1f5` - added reference pose copy mapping modal with transactional commit/rollback semantics.
4. `acfac7d` - added explicit dual-face context labeling across Variables, Poses, and Inputs surfaces.

Current state after these milestones:

1. Core variable + pose reference copy workflows now satisfy review-before-write requirements.
2. Unresolved critical mappings are blocked at confirm time.
3. Validation pass is green (`pnpm --filter vizij-authoring run validate`).
4. Performance hotspot refactors and perf-gate artifacts remain the primary open track.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/App.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

---

## Decision Matrix: Restart vs Iterative Evolution

| Criteria                        | Remove & Restart                      | Iterative Evolution                                 |
| ------------------------------- | ------------------------------------- | --------------------------------------------------- |
| Performance path to improvement | Delayed (must rebuild baseline first) | Immediate (target known hotspots)                   |
| Delivery speed                  | Slow                                  | Faster                                              |
| Regression risk                 | High                                  | Medium                                              |
| Architecture confidence         | Unknown until rebuilt                 | High, because existing pathways are known           |
| Alignment with requirements doc | Requires full re-implementation       | Can map directly from current code to required gaps |
| Overall recommendation          | No                                    | **Yes**                                             |

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

---

## Current Architecture (What Exists Today)

The current design already has the core building blocks:

1. Reference face runtime and state ingestion.
2. Main-face runtime input catalog capture.
3. Shared synchronization layer (`useSharedVariableSync`) linking values across faces.
4. Variables panel actions that can copy reference entries into main.

This means the foundation is present, but workflows are still incomplete and expensive.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/state/SharedVariableSyncContext.tsx`

---

## Why Performance Tanks Right Now

Primary hotspots identified:

1. `useSharedVariableSync` performs broad recomputation over many links on frequent value updates.
2. Reference-face input updates clone large maps often, causing repeated sync churn.
3. Shared sync context updates fan out broad rerenders in panel-heavy UI.
4. Variables tree building is expensive when repeated under rapid dual-face updates.
5. Path pair sets are wider than necessary and include non-user-critical channels.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/docs/archive/reports/audit_authoring_report.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/docs/reports/reference-face-main-face-input-sync-report-2026-02-24.md`

---

## Gap Analysis Against Target Requirements

Requirements demand copy-review modals with mapping and explicit confirmation before write.

Current gap summary:

1. Variable copy currently writes quickly from panel action, without a required mapping review modal.
2. Reference data model does not yet hold enough relationship detail for parent/child mapping and scale/offset review.
3. Pose copy workflow and pose mapping modal are not implemented as required.
4. Best-effort mapping confidence and unresolved-item handling need explicit structures.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts`

---

## Strategic Direction

Build forward from existing code, with two parallel tracks:

1. **Track A: Performance Stabilization**
2. **Track B: Copy Workflow Completion (Variable + Pose Modals)**

Do not wait for full UX completion before performance fixes. The performance work should start first, then continue alongside modal work.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`

---

## Proposed Implementation Plan

## Phase 1: Performance First (Stabilize Interaction)

Goals:

1. Reduce sync recomputation scope in `useSharedVariableSync` to changed/dirtied paths.
2. Batch reference value updates to reduce sync churn.
3. Split/memoize shared sync context to reduce broad rerenders.
4. Cache/lazy-build heavy variable trees.
5. Filter sync link set to user-relevant paths.

Expected result:

- major responsiveness improvement while preserving behavior.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

## Phase 2: Data Model Expansion for Mapping Modals

Goals:

1. Add `VariableCopyProposal` model with:
   - source/destination pairing,
   - confidence,
   - parent/child mapping rows,
   - per-field keep/replace choices (`min`, `max`, `default`, `scale`, `offset`).
2. Add `PoseCopyProposal` model with:
   - pose name mapping,
   - per-target mapping rows,
   - per-target value review/edit before commit.
3. Enrich reference face state with the metadata needed for parent/child and pose-target mapping.

Expected result:

- enough structure to drive the required modals correctly.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts`

## Phase 3: Modal UX and Commit Flow

Goals:

1. Replace direct variable copy writes with a Variable Copy Mapping Modal.
2. Add pose copy action and Pose Copy Mapping Modal.
3. Provide searchable dropdown remapping for each parent/child/target row.
4. Add staged preview before commit and rollback on cancel.
5. Commit writes only on confirmation.

Expected result:

- requirements-compliant, user-controlled copy workflow.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`

## Phase 4: Verification and Hardening

Goals:

1. Add targeted tests for:
   - mapping proposals,
   - commit/cancel behavior,
   - high-frequency sync performance guardrails.
2. Run validate pipeline after each milestone.
3. Capture before/after perf notes for dual-face mode.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/docs/reports/reference-face-main-face-input-sync-report-2026-02-24.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/docs/perf/inputs-pane-baseline-2026-02-19.md`

---

## Top Risks and Mitigations

Risk: missing reference metadata for parent/child and pose-target mapping.  
Mitigation: parse and store richer reference-side graph/pose metadata as part of Phase 2.

Risk: preview staging adds complexity and rollback bugs.  
Mitigation: isolate staged state in proposal objects and apply transactional commit/cancel behavior.

Risk: performance regression from modal state updates.  
Mitigation: keep modal state local and avoid broad context invalidations.

Risk: over-refactor slows delivery.  
Mitigation: strict phased milestones, starting with hotspot fixes that unlock responsiveness quickly.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`

---

## Final Recommendation

Proceed with **iterative evolution**, not a restart.

Immediate next move:

1. Start Phase 1 performance refactor on sync/update hotspots.
2. In parallel, define proposal schemas for variable and pose copy modals.
3. Replace direct copy actions with modal-based staged confirmation.

This path is the lowest-risk way to reach your stated goal state while fixing unresponsiveness.

### Sources

- `/home/chris/Code/Semio/vizij_ws/vizij-web/authoring-reference-face-requirements.md`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`
- `/home/chris/Code/Semio/vizij_ws/vizij-web/.worktrees/authoring-override-pipeline-plan/apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
