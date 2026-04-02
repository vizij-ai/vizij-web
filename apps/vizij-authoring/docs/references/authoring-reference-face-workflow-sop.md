# Reference Face Workflow SOP

Last updated: 2026-03-01
Status: `implemented-v2`

## Implementation Notes (2026-03-01)

Shipped in `vizij-authoring`:

1. Variable copy now always opens a mapping modal and writes only on `Confirm`.
2. Pose copy from reference now always opens a mapping modal and writes only on `Confirm`.
3. Pose copy scope is constrained to destination pose name + mapped target values.
4. `Cancel` paths for both variable and pose copy guarantee zero writes.
5. Critical unresolved mapping rows block commit for both variable and pose flows.
6. Panel context labeling is explicit in dual-face mode:
   - Variables: `Main Face`, `Shared`, `Reference Face`
   - Poses: `Main Face`, `Reference Face`
   - Inputs: `Main Face Inputs Only` with reference comparison guidance
7. Reference staging now prefers canonical/runtime-resolved paths (reference-only and shared actions), including canonical pose-weight paths for pose actions.
8. Reference reset now clears override-enabled state before applying defaults so old staged values do not reappear after reset.
9. Bundled-export guardrails and pose-compose export wiring are aligned with reference playback expectations.
10. Runtime pose-control bridge includes direct-prefixed alias compatibility for legacy channels (including brow paths in Quori assets).

Still pending from this SOP:

1. Formal perf-gate thresholds and published before/after perf artifacts.
2. Session-level copy audit log emission.

## Purpose

Define the standard operating procedure for reference-face-assisted authoring once the required mapping-modal workflow is implemented.

This SOP operationalizes:

1. `apps/vizij-authoring/docs/references/authoring-reference-face-requirements.md`
2. `apps/vizij-authoring/docs/plans/TRACKER.md`
3. `apps/vizij-authoring/docs/archive/plans/authoring-reference-face-implementation-plan_2026-03-01.md`

## Scope

In scope:

1. Dual-face authoring sessions (main + reference).
2. Variable copy with mapping review and explicit confirm.
3. Pose copy with target mapping review and explicit confirm.
4. Side-by-side live tuning after copy.
5. Performance and audit expectations for production usage.

Out of scope:

1. Editing reference face as a first-class authoring target.
2. Simultaneous dual-context inspector editing.

## Preconditions

Before running this workflow:

1. Main face is loaded and editable.
2. Reference face bundle is loaded in reference pane.
3. Dual-face mode is active.
4. Mapping catalogs for both faces are available.
5. Session has no unresolved fatal runtime load errors.

## SOP A: Start Dual-Face Session

1. Load main face bundle in authoring workspace.
2. Load reference face bundle in reference pane.
3. Confirm panels clearly surface `Main Face` and `Reference Face` context labels.
4. Confirm overlap/shared section is visible for variables and explicit context labels appear for poses and inputs.
5. Confirm inspector context mode is set explicitly to main or reference and remains single-context.

Exit criteria:

1. Both faces are visible and responsive.
2. User can identify source vs destination context without ambiguity.

## SOP B: Copy Variable From Reference to Main

1. User triggers `Copy to Main` from a reference variable row.
2. System opens Variable Copy Mapping Modal (no immediate writes).
3. Modal must show:
   - source variable identity,
   - proposed destination variable,
   - mapping confidence and rationale,
   - unresolved/ambiguous rows,
   - parent/child relationship row mapping,
   - source vs destination config values (`min`, `max`, `default`),
   - per-link transform values (`scale`, `offset`) where applicable.
4. User edits any mapping row via searchable selector.
5. User sets per-field merge behavior (keep source / keep destination / custom edit).
6. User chooses one action:
   - `Cancel`: abort and guarantee zero writes.
   - `Confirm`: apply transactional commit to main face.
7. System renders commit summary and marks unresolved rows as blocked if still critical.

Exit criteria:

1. No blind writes occurred.
2. Writes happened only on confirm.
3. Commit is atomic (all-or-nothing).

## SOP C: Copy Pose From Reference to Main

1. User triggers `Copy Pose to Main` from reference pose row.
2. System opens Pose Copy Mapping Modal (no immediate writes).
3. Modal must show:
   - source pose identity,
   - editable destination pose name,
   - source target rows,
   - proposed destination target mapping,
   - confidence and unresolved states,
   - source and editable destination values per target.
4. User resolves row mappings and values before commit.
5. User chooses one action:
   - `Cancel`: abort and guarantee zero writes.
   - `Confirm`: transactional commit with rollback-on-failure.

Exit criteria:

1. All critical mappings are resolved before write.
2. Pose creation/update happens only on confirm.
3. Commit summary is visible and auditable.

## SOP D: Side-by-Side Tuning and Comparison

After variable/pose commit:

1. User adjusts the copied variable or pose control.
2. Main and reference faces update side-by-side for visual comparison.
3. Sync policy remains explicit (`off`, `main-to-reference`, `reference-to-main`, `bidirectional`) and observable.
4. Conflict state is surfaced with actionable resolution controls.

Exit criteria:

1. Comparative tuning is smooth.
2. User can continue authoring without full-panel stalls.

## SOP E: Session Validation and Audit

At the end of a copy session:

1. Confirm copied artifacts are present in main face and selectable.
2. Confirm unresolved rows are either resolved or explicitly waived.
3. Capture copy summary in session log (operation type, source, destination, unresolved count, user action).
4. Run quick sanity checks:
   - panel rerender responsiveness,
   - sync pass metrics within threshold,
   - no unintended reference mutations.

## Guardrails

Must-have workflow guardrails:

1. `Cancel` never writes.
2. `Confirm` is transactional.
3. Critical unresolved mapping blocks commit.
4. Mapping confidence and rationale are visible.
5. Search selectors remain performant on large target lists.
6. Modal-local state must not trigger broad app rerenders.

## Definition of Done for SOP Readiness

This SOP is ready for production when:

1. Variable copy modal flow ships with automated tests.
2. Pose copy modal flow ships with automated tests.
3. Dual-face performance gates pass with reference face loaded.
4. Audit summaries are emitted and reviewable.
5. Requirements acceptance criteria are met end-to-end.
