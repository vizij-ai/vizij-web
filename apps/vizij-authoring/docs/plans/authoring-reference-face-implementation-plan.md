# Reference Face Workflow Implementation Plan

Last updated: 2026-02-26
Status: `in-progress-implementation`

## Implementation Status Snapshot (2026-02-26)

Completed milestone chunks:

1. `973b873` - reference catalog + deterministic variable/pose proposal models and preflight validation.
2. `d3dbf62` - variable copy modal-first transactional flow (no blind writes).
3. `5b2d1f5` - reference pose copy modal-first transactional flow (name + target values only).
4. `acfac7d` - explicit panel context cues for main/reference/overlap across Variables, Poses, and Inputs surfaces.

Validation executed after milestone integration:

1. `pnpm --filter vizij-authoring run validate` passed.
2. Targeted suites for copy/mapping flows passed:
   - `src/components/panels/VariablesPanel.test.tsx`
   - `src/referenceFace/mapping.test.ts`

Outstanding follow-up:

1. Perf-gate instrumentation and threshold documentation remain open (Workstreams 0/1/6 perf-specific items).

## Objective

Deliver the reference-face workflow defined in:

1. `apps/vizij-authoring/docs/references/authoring-reference-face-requirements.md`

Specifically:

1. mapping-review modal workflow for variable copy,
2. mapping-review modal workflow for pose copy,
3. explicit source/destination context clarity across panels,
4. side-by-side live tuning after copy,
5. responsive dual-face performance.

## Strategic Direction

Delivery strategy: iterative evolution of the current implementation, not restart.

Reasoning:

1. Dual-face runtime wiring and shared sync primitives already exist.
2. Current bottlenecks are concentrated in identifiable hot paths.
3. Copy workflows can be upgraded by introducing proposal + transactional commit layers without discarding existing infrastructure.

This aligns with:

1. `apps/vizij-authoring/docs/reports/authoring-override-reference-face-strategy-report.md`

## Current State (Audited)

### Runtime and Sync Foundation Exists

Current wiring is in place through:

1. `src/App.tsx`
2. `src/components/app/ReferenceFacePanel.tsx`
3. `src/components/app/ReferenceFaceRuntime.tsx`
4. `src/hooks/useReferenceFaceState.ts`
5. `src/hooks/useSharedVariableSync.ts`
6. `src/state/SharedVariableSyncContext.tsx`

### Major Gaps vs Requirements

1. Variable copy path writes immediately from panel action; no review modal.
2. Pose copy from reference to main is not implemented.
3. Mapping confidence/unresolved blocking and manual override controls are incomplete for copy operations.
4. Transaction semantics (`begin`/`commit`/`cancel`) do not exist for copy workflows.
5. Dual-face panel context is partial (variables better surfaced than poses/input overlap views).

### Known Performance Risks

1. High-frequency broad sync passes in `useSharedVariableSync`.
2. Root-level rerender pressure from broad value subscriptions in `App.tsx`.
3. Shared context fanout causing avoidable rerenders.
4. Dual-face perf baseline is under-instrumented (existing perf harness often runs without loaded reference face).

## Workstreams

## Workstream 0: Baseline and Safety Rails

Goal: establish measurable baseline and no-regression safety net before major refactors.

Tasks:

1. Add explicit dual-face perf benchmark scenario (reference face loaded).
2. Capture baseline metrics for search, slider drag, sync pass, and copy-confirm latency.
3. Add initial test harness stubs for mapping modal transactional behavior.

Primary files:

1. `src/components/panels/VariablesPanel.perf.test.tsx`
2. `src/hooks/__tests__/useSharedVariableSync.test.tsx`
3. `docs/perf/` (new baseline note)

Exit criteria:

1. Baseline artifact exists and is reproducible.
2. CI test harness can fail on critical transactional regressions.

## Workstream 1: Sync/State Architecture Refactor (Performance First)

Goal: reduce dual-face interactivity cost and create clean seams for staged copy flows.

Tasks:

1. Split shared sync into:
   - pure model derivation layer (pairing/conflicts),
   - imperative engine layer (mirroring/commit application).
2. Introduce selector-based or split-context state to reduce consumer fanout.
3. Narrow sync passes to changed paths and add batching.
4. Isolate reference-face draft writes from immediate runtime commits.

Primary files:

1. `src/hooks/useSharedVariableSync.ts`
2. `src/state/SharedVariableSyncContext.tsx`
3. `src/hooks/useReferenceFaceState.ts`
4. `src/App.tsx`

Exit criteria:

1. Dual-face editing latency improves versus baseline.
2. Sync metrics show reduced per-edit evaluation and write churn.
3. No functional regression in existing shared sync tests.

## Workstream 2: Proposal Models and Mapping Engine

Goal: formalize deterministic copy proposals for variable and pose workflows.

Tasks:

1. Add `VariableCopyProposal` model:
   - source/destination identity,
   - mapping rows,
   - confidence + rationale,
   - unresolved flags,
   - merge decisions (`min`, `max`, `default`, `scale`, `offset`).
2. Add `PoseCopyProposal` model:
   - source/destination pose identity,
   - target mapping rows,
   - confidence + unresolved flags,
   - editable target values.
3. Build deterministic best-effort mapper with explicit conflict categories.
4. Add commit preflight validator that blocks unresolved critical mappings.

Primary files (new + existing):

1. `src/referenceFace/` (new proposal/mapping modules)
2. `src/hooks/useReferenceFaceState.ts` (metadata enrichment)
3. `src/poseRig/` (pose target metadata adapters)
4. `src/hooks/usePoseGraphImport.ts` (reuse heuristic patterns)

Exit criteria:

1. Proposal generation is deterministic and test-covered.
2. Critical unresolved mappings are blocked pre-commit.

## Workstream 3: Variable Copy Mapping Modal

Goal: replace direct copy writes with explicit review and transactional commit.

Tasks:

1. Add Variable Copy Mapping Modal UI and state machine.
2. Present side-by-side source/destination values and mapping rationale.
3. Allow per-row remap via searchable selectors.
4. Add `Cancel` (zero writes) and `Confirm` (atomic commit) semantics.
5. Replace row and bulk `Copy Ref` flows to open modal first.

Primary files:

1. `src/components/panels/VariablesPanel.tsx`
2. `src/components/app/AppWizards.tsx`
3. `src/components/ui/Modal.tsx`
4. `src/components/ui/Combobox.tsx` / `src/components/ui/Select.tsx` (reuse)

Exit criteria:

1. No variable copy path performs blind writes.
2. Variable modal tests cover open/edit/cancel/confirm and blocking rules.

## Workstream 4: Pose Copy Mapping Modal

Goal: deliver requirements-compliant reference-to-main pose copy.

Tasks:

1. Add reference pose surfacing in panel context.
2. Add Pose Copy Mapping Modal with target-level remap and value editing.
3. Add transactional pose commit with rollback on partial failure.
4. Reuse/remap logic patterns from pose import workflows where possible.

Primary files:

1. `src/components/panels/VariablesPanel.tsx` (or extracted pose panel module)
2. `src/poseRig/store.tsx`
3. `src/poseRig/utils.ts`
4. `src/components/poseRig/PoseGraphRemapWizard.tsx` (pattern reuse)

Exit criteria:

1. User can copy reference pose to main via modal review flow.
2. Unresolved critical target mappings block commit.
3. Cancel path guarantees zero writes.

## Workstream 5: Panel Clarity and Inspector Context Contract

Goal: make source/destination context unambiguous across Inputs/Variables/Poses.

Tasks:

1. Add consistent `Main Face` / `Reference Face` context chips and overlap views.
2. Add explicit inspector-context toggle contract (single-target only).
3. Ensure selection routing remains predictable when switching contexts.

Primary files:

1. `src/components/panels/VariablesPanel.tsx`
2. `src/components/inspector/InspectorPanel.tsx`
3. `src/components/inspector/InspectorContent.tsx`
4. `src/components/panels/HierarchyPanel.tsx` (alignment)

Exit criteria:

1. Context ambiguity is removed in panel workflows.
2. Inspector remains single-context and understandable.

## Workstream 6: Verification, Perf Gates, and Rollout

Goal: close with measurable confidence and documentation.

Tasks:

1. Expand automated coverage for:
   - proposal generation,
   - modal transactional semantics,
   - unresolved mapping gating,
   - dual-face sync stability.
2. Add dual-face perf gate thresholds and document before/after results.
3. Update SOP and references to match shipped behavior.
4. Run targeted validation and final prep.

Primary files:

1. `src/components/panels/VariablesPanel.test.tsx`
2. `src/hooks/__tests__/useSharedVariableSync.test.tsx`
3. `src/poseRig/*.test.ts*`
4. `docs/perf/*.md`
5. `docs/references/authoring-reference-face-workflow-sop.md`

Exit criteria:

1. All requirement acceptance criteria pass.
2. Dual-face performance remains responsive under representative load.
3. Documentation and tests match implementation behavior.

## Gap-to-Workstream Mapping

| Requirement Gap                                  | Workstreams |
| ------------------------------------------------ | ----------- |
| Variable copy modal + review-before-write        | 2, 3        |
| Pose copy modal + target mapping                 | 2, 4        |
| Confidence, unresolved handling, manual override | 2, 3, 4     |
| No blind writes / transactional semantics        | 1, 3, 4     |
| Panel context clarity (inputs/variables/poses)   | 5           |
| Responsive dual-face behavior                    | 0, 1, 6     |

## Validation Plan

Per milestone, run at minimum:

1. `pnpm --filter vizij-authoring run test`
2. `pnpm --filter vizij-authoring run typecheck`
3. `pnpm --filter vizij-authoring run lint`

Before handoff/push:

1. `pnpm run prep`
2. `pnpm run prep:push` when full clean build validation is needed

Performance evidence requirements:

1. Baseline + post-change report in `docs/perf/`.
2. Dual-face-loaded benchmark results attached to each performance-sensitive milestone.

## Risks and Mitigations

1. Risk: modal scope expansion increases delivery time.
   - Mitigation: ship variable modal first, then pose modal.
2. Risk: perf regressions from additional mapping UI state.
   - Mitigation: keep modal state local; avoid global context writes before confirm.
3. Risk: unresolved mapping UX confusion.
   - Mitigation: confidence/rationale labels and blocking-state summaries.
4. Risk: complex rollback behavior in pose copy.
   - Mitigation: commit transaction wrapper with explicit rollback tests.

## Milestone Sequence

1. M0: Baseline + safety rails (Workstream 0)
2. M1: Sync/state refactor complete (Workstream 1)
3. M2: Proposal/mapping engine complete (Workstream 2)
4. M3: Variable copy modal shipped (Workstream 3)
5. M4: Pose copy modal shipped (Workstream 4)
6. M5: Panel/inspector context polish (Workstream 5)
7. M6: Verification + perf sign-off + docs finalization (Workstream 6)

## Deliverables

1. `authoring-reference-face-workflow-sop.md` (operational usage reference)
2. This implementation plan (delivery blueprint)
3. Updated tests/perf reports as each milestone lands
