# Authoring Reference Face Requirements

## Purpose

Define the target behavior for reference-face-assisted authoring in `vizij-authoring`, with emphasis on:

- clear UX,
- copy/import workflows (variables + poses),
- and performance (no major interactivity regression).

This document is the source of truth for analysis and implementation planning.

## Product Goal

Support a second face pane (reference face) that helps users author the main face by:

1. viewing comparable variables/poses across both faces,
2. copying variables/poses from reference face to main face,
3. tweaking main-face values while seeing both faces update for comparison.

Primary use case is matching the main face to a known-good reference face.

## Scope

### In Scope

- Dual-face view mode (main + reference pane).
- Clear distinction in authoring panels for what belongs to main face vs reference face.
- Copy workflows for:
  - variables,
  - poses.
- Mapping/review modals that allow user confirmation and edits before writing to main face.
- Best-effort automatic mapping with user override.
- Shared preview behavior while tweaking copied items.
- Performance-sensitive architecture and UX.

### Out of Scope (for now)

- Editing reference face data as a first-class authoring target.
- Full dual-face inspector simultaneously (both at once in one inspector).
  - Inspector can be single-target: either main or reference.

## UX Principles

1. The user must always know:
   - what source item is from reference face,
   - what destination item is on main face,
   - how each mapping was decided.
2. Copy operations are not blind writes.
   - They always present a review/confirmation modal before commit.
3. Best-effort mapping should save time but never remove control.
4. Performance must remain responsive in dual-face mode.

## Core Workflows

## Workflow A: Copy Variable from Reference to Main

### User Intent

Bring a reference variable into main face and decide how relationships and config should be applied.

### Required Behavior

1. User selects variable on reference face and triggers copy to main.
2. System opens a Variable Copy Mapping Modal.
3. Modal shows:
   - source variable name and identity,
   - proposed main-face variable destination,
   - proposed parent relationships mapping,
   - proposed child relationships mapping,
   - source config values vs destination config values.
4. For each mapped relationship, user can replace target via searchable dropdown.
5. User can choose per relevant field whether to keep source or retain/override destination values:
   - `min`, `max`, `default`,
   - per parent/child link: `scale`, `offset`.
6. Commit writes only after confirmation.
7. Result participates in dual-face comparative preview while editing.

## Workflow B: Copy Pose from Reference to Main

### User Intent

Bring a reference pose into main face while explicitly resolving target mappings.

### Required Behavior

1. User selects pose on reference face and triggers copy to main.
2. System opens a Pose Copy Mapping Modal.
3. Modal shows:
   - source pose name,
   - proposed destination pose name (editable if needed),
   - each source target and proposed main-face mapped target,
   - target value(s) from reference and proposed destination values.
4. For each target mapping, user can replace destination via searchable dropdown.
5. User can choose to keep source target values or modify before commit.
6. Commit writes only after confirmation.
7. After copy, adjusting inputs should allow side-by-side visual comparison.

## Panel and Data Visibility Requirements

In reference-face mode:

- Inputs panel should clearly indicate main/reference context and overlap.
- Variables panel should clearly indicate main/reference context and overlap.
- Poses panel should clearly indicate main/reference context and overlap.
- Overlap-focused representation is preferred where helpful.
- Inspector can be single-context (main or reference), not both simultaneously.

## Mapping and Resolution Requirements

Best-effort mapping should use deterministic heuristics (example categories):

- ID/path exact match,
- normalized name match,
- type/shape compatibility,
- structural context hints.

For every proposed mapping, UX must expose:

- confidence (optional but recommended),
- unresolved/ambiguous items,
- explicit manual override controls.

No unresolved critical item should silently write.

## Comparison and Live Tuning Requirements

After copy/import:

- user can manipulate input for variable or pose,
- both faces update for visual comparison,
- main-face tuning remains smooth and responsive.

## Performance Requirements

Current state is described as near-unresponsive. New design must prioritize performance.

### Performance Goals

- Maintain interactive responsiveness in dual-face mode.
- Avoid heavy cross-face recomputation on every minor update.
- Reduce unnecessary re-renders in panel-heavy UI.
- Prevent copy/mapping modals from triggering broad runtime churn.

### Performance Strategy Constraints

- Prefer selective subscriptions and memoized selectors.
- Isolate main vs reference state updates where possible.
- Batch writes during mapping/apply operations.
- Defer expensive derived computations to explicit boundaries (modal open/confirm, staged apply, etc.).

## Non-Functional Requirements

- Mapping modals must be understandable without deep technical context.
- Search/select controls must scale to large target lists.
- Copy actions should be auditable (at least by clear summary before confirm).

## Acceptance Criteria (High-Level)

1. User can open dual-face mode and clearly distinguish main/reference entities.
2. User can copy variable from reference to main with relationship + config review before commit.
3. User can copy pose from reference to main with target mapping review before commit.
4. User can override any auto mapping via searchable dropdowns.
5. User can compare both faces while tweaking copied variable/pose inputs.
6. Inspector workflow remains single-context and understandable.
7. Performance remains responsive in typical dual-face authoring flows.

## Open Design Notes

- Modal UX should emphasize side-by-side source vs destination values.
- Mapping summaries should make unresolved items obvious.
- Start with “read/copy from reference” and defer “edit reference” capabilities.
