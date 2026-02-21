# Cross-Face Unified Panel Copy Requirements (2026-02-21)

## Purpose

Define the product and implementation contract for showing **main face** and **reference face** data in one side-panel experience, with safe copy actions for:

- Inputs
- Variables
- Poses
- Pose groups

This is scoped to `apps/vizij-authoring` and grounded in the current architecture.

## Decision Update (2026-02-21)

- Implement copy in one direction first: `Reference -> Main`.
- Reverse direction (`Main -> Reference`) is deferred.
- Any copy conflict must be surfaced through an explicit modal with user choices.

## Implementation Status (2026-02-21)

Forward copy (`Reference -> Main`) is now wired in `VariablesPanel` for:

- Variables / inputs:
  - Reference rows include copy actions.
  - When a destination variable already exists with metadata drift, the copy flow opens a conflict modal (`Keep Main`, `Overwrite Main`, `Cancel`).
- Pose groups:
  - Reference pose groups can be copied into main.
  - Blend-mode collisions open a conflict modal (`Keep Main`, `Overwrite Mode`, `Cancel`).
- Poses:
  - Reference poses can be copied to main using normalized pose data and group mapping.
  - Existing main identity collisions open a conflict modal with explicit resolution options.

Reference payload extraction has been extended so the panel can render unified reference data:

- `referencePoses`
- `referencePoseGroups`

Current scope is intentionally one-way. Reverse direction remains a separate decision gate.

## Current Baseline (What Exists Today)

- `VariablesPanel` already has unified surfacing for variables with source buckets and badges (`Main Face`, `Reference Face`, `Shared`) and supports reference-to-main variable copy.
- `SharedVariableSync` already links main/reference values by normalized path and handles policy + conflicts for mirrored values.
- Reference runtime introspection currently exposes reference standard inputs and input values, but does **not** expose a reference pose library / pose groups to UI state.
- Poses and pose groups shown in `VariablesPanel` currently come from main pose rig authoring state only.

Code anchors:

- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts`
- `apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`
- `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.tsx`
- `apps/vizij-authoring/src/state/ReferenceFaceContext.tsx`

## Product Requirements

## 1) Unified Side-Panel Model

Each surface (`inputs`, `variables`, `poses`, `pose-groups`) must support a unified list/tree where each row expresses:

- Entity identity (name/path)
- Face presence (`main`, `reference`, `both`)
- Face-specific metadata/value summaries
- Available copy actions

Rows should be identity-first and face-second. If an item exists on both faces, show one combined row with dual-face indicators, not duplicate rows.

## 2) Face-Origin Indicators

Every row needs explicit, glanceable origin state:

- `M` badge for main-only
- `R` badge for reference-only
- `M+R` badge for both

If both exist and values diverge materially, include a `drift` indicator (same pattern already used for shared variable conflicts, but adapted per surface).

## 3) Copy Actions

Rows should expose directional copy actions:

- `Copy -> Main`
- `Copy -> Reference` (only when destination supports it)

Toolbar-level bulk actions should exist per surface:

- `Copy all missing -> Main`
- `Copy all missing -> Reference` (when valid)

Bulk actions must show counts before execution.

## 4) Correctness and Safety Rules

- No duplicate identity creation by default.
- Copy should be idempotent when source and target are already equivalent.
- If destination already has same identity but different payload, require explicit overwrite mode.
- Copy operations must preserve canonical normalization (path/group rules already used in pose-rig + standard-input services).
- Copy must not destabilize runtime graph readiness or pose control registration.

## 5) Performance Rules

- Unified list derivation must be selector/memo driven.
- No full graph rebuild on purely visual/UI toggles.
- Copy actions should batch updates where possible to avoid N re-renders/graph publishes.

## Surface-by-Surface Requirements

## Inputs

Identity:

- Normalized standard input path.

Copy semantics:

- If destination has same path, optional overwrite of editable metadata/value defaults.
- If destination missing path and destination can create custom input, create it.

Notes:

- For reference destination, this is constrained by reference runtime schema (see “Open Investigations”).

## Variables

Identity:

- Same as input identity (normalized path), including custom inputs.

Copy semantics:

- Reuse current reference-to-main behavior as canonical implementation.
- Extend in reverse direction only where reference destination supports mutation.

## Poses

Identity:

- Canonical key: `groupPath + poseName` (normalized), with source `id` retained as metadata.

Copy semantics:

- Missing pose in destination: create pose with copied values + mapped group membership.
- Existing pose key in destination: default to skip, with explicit overwrite action.
- Preserve compose metadata when available.

## Pose Groups

Identity:

- Group `path` (normalized).

Copy semantics:

- Missing group: create group definition in destination.
- Existing group: optional metadata merge (name/blend mode) with explicit overwrite mode.
- Copying poses can auto-create required groups on destination (using existing `ensurePoseGroupFromPath` pattern).

## UI Contract

## A) Panel Structure

- Keep existing surface tabs.
- For each surface, render one unified tree/list.
- Add a source filter strip:
  - `All`
  - `Main only`
  - `Reference only`
  - `Both`

## B) Row Anatomy

Each row should contain:

- Name/path
- Source badge (`M`, `R`, `M+R`)
- Optional drift/conflict chip
- Inline copy actions enabled/disabled by feasibility
- Context menu for advanced actions (`overwrite`, `skip`, `copy with rename`)

## C) Copy Interaction Patterns

Single copy:

- Immediate for unambiguous/missing destination entities.
- Confirmation popover for overwrite collisions.

Bulk copy:

- Preview counts:
  - `create`
  - `overwrite candidates`
  - `skipped`
- Confirmation before execution.

Feedback:

- Non-blocking toast summary with counts.
- Selection focus moves to first changed destination entity.

## D) Empty / Disabled States

- If reference face is not loaded, reference indicators/actions are hidden or disabled with tooltip.
- If a direction is unsupported (for example immutable destination), show disabled action with reason.

## Data/State Architecture Changes

## 1) Extend `ReferenceFaceState` with Pose Snapshot

Add a derived reference pose snapshot in `useReferenceFaceState` sourced from `onBundleReady`:

- `referencePoseConfig` (raw + normalized)
- `referencePoses`
- `referencePoseGroups`
- Optional hash/revision for memo invalidation

This avoids reparsing GLB elsewhere and keeps panel selectors deterministic.

## 2) Add Unified Surface Selectors

Create memoized selector utilities (panel-local or shared) to build:

- `UnifiedInputRow[]`
- `UnifiedVariableRow[]`
- `UnifiedPoseRow[]`
- `UnifiedPoseGroupRow[]`

Each row contains:

- `entityKey`
- `presence`
- `mainPayload?`
- `referencePayload?`
- `driftState`
- `allowedActions`

## 3) Add Copy Service Layer

Implement pure action helpers, separated from rendering:

- `copyInputBetweenFaces`
- `copyVariableBetweenFaces`
- `copyPoseBetweenFaces`
- `copyPoseGroupBetweenFaces`

These helpers should return structured result counts and should internally use existing canonical mutators (for example pose-rig store helpers and standard-input creation/update helpers).

## 4) Keep Runtime Bridge Stable

Copy operations must use existing authoring mutation paths so downstream graph bridge classification remains correct. No direct state mutation shortcuts.

## Phased Implementation Plan

## Phase 1 (Confident, Low Risk)

- Add unified indicators and action framework across existing rows.
- Extend variable copy UX to be consistent with future surfaces.
- Add read-only unified pose/pose-group presence view (main + reference) once reference pose snapshot is available.

Exit criteria:

- No behavior regressions in current variable copy.
- Unified rows render correct presence badges.

## Phase 2 (Confident, Medium Risk)

- Implement `Copy -> Main` for poses and pose groups from reference snapshot.
- Add bulk `Copy missing -> Main` for poses and groups.
- Add overwrite confirmation flow.

Exit criteria:

- Copied poses immediately function without manual nudge hacks.
- Existing pose import smoke tests still pass.

## Phase 3 (Needs Investigation)

- Evaluate safe `Copy -> Reference` capabilities.
- Decide immutable vs. mutable reference model:
  - Immutable imported reference (recommended default)
  - Mutable authoring overlay for reference (if product needs reverse copy)

Exit criteria:

- Product decision documented.
- Disabled/enabled reverse-copy actions reflect chosen model.

## Test and Validation Requirements

## Unit

- Selector tests for presence resolution and action availability.
- Copy helper tests for create/overwrite/skip outcomes.
- Collision tests for pose and pose-group identity keys.

## Component

- `VariablesPanel` tests for badges, action visibility, and copy flows per surface.
- Confirmation UI tests for overwrite cases.

## Smoke

- Main + reference load with mixed overlap and divergence.
- Copy missing poses/groups to main and verify pose playback/target edits work immediately.
- Verify no added hot-path cost during normal slider authoring (no extra graph churn).

## Open Investigations (Required Before Final Reverse Copy UX)

1. Should reference face remain immutable source-of-truth from imported GLB?
2. If reverse copy is needed, should it mutate runtime only (ephemeral) or write an authoring overlay model?
3. What is the canonical identity for pose collisions when names match but membership differs?
4. Should overwrite for poses be full replace or per-channel merge?

## Recommended Immediate Next Step

Start with Phase 1 + Phase 2 in forward direction (`Reference -> Main`) while designing reverse copy as a separate product decision gate. This delivers user-visible value quickly with low correctness risk and aligns with current architecture.
