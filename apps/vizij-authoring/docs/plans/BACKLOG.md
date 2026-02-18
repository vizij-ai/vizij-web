# Vizij Authoring Backlog (Active)

Last updated: 2026-02-18

Status legend: `[ ]` planned, `[~]` in progress, `[x]` done

This file is implementation-level. Each item must be executable without ambiguity.

## B0 — Baseline and CI Health

### [x] B0.1 TypeScript Baseline Cleanup

Intent:
Bring `vizij-authoring` back to zero TypeScript errors.

Scope:

1. Fix all current TS errors in changed app files.
2. Avoid introducing `any`/unsafe casts as shortcut fixes.

Deliverables:

1. Clean `typecheck` output.
2. Small targeted code changes with no behavior regressions.

Acceptance checks:

1. `pnpm --filter vizij-authoring run typecheck` exits 0.
2. `TRACKER.md` includes timestamped evidence.

Dependencies:
None.

Completion notes (2026-02-18 06:05:57Z):

1. `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
2. No TypeScript source edits were required in this task window.

### [x] B0.2 Test Reconciliation

Intent:
Establish clear, stable test status relative to base.

Scope:

1. Identify failing tests on this branch.
2. Classify each failure as regression, pre-existing, or flaky.
3. Fix regressions; document any intentional quarantine.

Deliverables:

1. Updated tests or quarantine notes.
2. Explicit list of residual known failures (if any) with rationale.

Acceptance checks:

1. `pnpm --filter vizij-authoring run test` passes or has documented quarantines.
2. `TRACKER.md` records outcome and evidence.

Dependencies:
`B0.1`.

Completion notes (2026-02-18 06:09:30Z):

1. `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 49 files, 218 tests).
2. Failure classification: none observed (no regressions, no pre-existing failures, no flaky failures in this run).
3. Residual known failures: none.

### [x] B0.3 Validation Command Reliability

Intent:
Make day-to-day validation deterministic for contributors.

Scope:

1. Verify `pnpm --filter vizij-authoring run validate` in this branch state.
2. Address command-order or script issues if discovered.

Deliverables:

1. Stable `validate` path.
2. Tracker evidence entry with exact command and result.

Acceptance checks:

1. `validate` finishes successfully on clean working tree.
2. Any caveats documented in `TRACKER.md`.

Dependencies:
`B0.1`, `B0.2`.

Completion notes (2026-02-18 06:13:05Z):

1. `pnpm --filter vizij-authoring run validate` -> pass (`pnpm run lint && pnpm run typecheck && pnpm run test`, exit 0).
2. Validation ordering is deterministic in this branch state (`lint` -> `typecheck` -> `test`).
3. Caveat: lint currently reports 16 `@typescript-eslint/no-unused-vars` warnings, but no lint errors; `validate` remains a stable passing gate.

## B1 — Inspector and Surface Usability

### [x] B1.1 Inspector Numeric Control Legibility

Intent:
Prevent clipping and tiny controls in inspector numeric rows.

Scope:

1. Define and apply minimum sizing rules for slider + numeric input rows.
2. Preserve keyboard precision and scrub interactions.

Deliverables:

1. Updated numeric field layout rules.
2. Consistent control sizing across inspector contexts.

Acceptance checks:

1. Numeric input min width >= `88px` in inspector rows.
2. Row hit target min height >= `32px`.
3. No clipping at common panel widths used in app.

Dependencies:
`B0` complete.

Completion notes (2026-02-18 06:29:04Z):

1. Added reusable inspector sizing contracts in `src/styles.css` (`--inspector-row-hit-min-height: 32px`, `--inspector-numeric-min-width: 88px`) plus shared utility classes (`.inspector-row-hit-target`, `.inspector-numeric-control`).
2. Updated shared inspector row controls to use flexible wrapping and minimum hit target sizing in `src/components/ui/CollapsibleRow.tsx` and `src/components/ui/RowSlider.tsx`.
3. Updated inspector slider+numeric rows in `src/components/inspector/InspectorContent.tsx` and `src/components/inspector/InspectorPanel.tsx` to use shared numeric width and wrapping classes, removing narrow `w-12/w-20` wrappers that caused clipping risk.
4. Added `src/components/inspector/inspectorSizingContracts.test.ts` to lock the B1.1 sizing and wrapping contracts.

### [x] B1.2 Sidebar Density and Pane Orchestration

Intent:
Keep left sidebar usable when many panes are active.

Scope:

1. Improve pane arrangement and overflow behavior.
2. Preserve one global selected item across panes.
3. Prevent heavy tree/search work for hidden panes.

Deliverables:

1. Updated sidebar orchestration behavior.
2. Deterministic pane ordering behavior.

Acceptance checks:

1. With all pane types present, sidebar remains navigable without clipping/overlap.
2. Selection persists correctly when switching panes.
3. Hidden panes do not run unnecessary tree filtering work.

Dependencies:
`B0` complete.

Completion notes (2026-02-18 06:37:14Z):

1. Consolidated left sidebar variable surfaces into one `VariablesPanel` instance in `src/App.tsx`, while keeping `HierarchyPanel` in its own pane section.
2. Added explicit deterministic surface ordering in `src/components/panels/variablesSurfaceOrder.ts` driven by visibility flags in this order: `variables` -> `poses` -> `pose-groups` (from `materials` toggle) -> `inputs`.
3. Gated heavy tree filtering in `src/components/panels/VariablesPanel.tsx` so `filterTreeBySearch` only runs for the active surface tree.
4. Added targeted tests:
   - `src/components/panels/variablesSurfaceOrder.test.ts` (ordering contract)
   - `src/components/panels/VariablesPanel.test.tsx` (`filterTreeForActiveSurface` gating behavior)
5. Validation evidence:
   - `2026-02-18 06:36:42Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 06:36:56Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 51 files / 225 tests).
   - `2026-02-18 06:37:14Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 16 warnings).

### [x] B1.3 Pose Inspector Value Semantics

Intent:
Make pose contribution state explicit and understandable.

Scope:

1. Display target value, current/applied value, and contribution strength separately.
2. Align displayed values with runtime-authoritative values.

Deliverables:

1. Pose inspector rows with explicit value triplet semantics.
2. Labels/tooltips that remove ambiguity.

Acceptance checks:

1. User can see all three values for a pose-controlled target.
2. Current/applied value matches runtime/autorig value path.

Dependencies:
`B0` complete.

Completion notes (2026-02-18 06:46:57Z):

1. Added `src/components/inspector/poseContributionSemantics.ts` and unit tests in `src/components/inspector/poseContributionSemantics.test.ts` to compute explicit contribution semantics from target/applied/neutral values.
2. Updated pose mode rendering in `src/components/inspector/InspectorContent.tsx` to:
   - Preserve runtime-authoritative current/applied value sourcing through `resolvePoseAppliedValue` (`inputValues` staged runtime/autorig path with neutral fallback).
   - Rename ambiguous labels to explicit semantics (`Target Value`, `Current/Applied`, `Contribution Strength`).
   - Add a pose legend and semantic tooltips clarifying each value meaning.
   - Display contribution strength badges for scalar and color pose-controlled targets.
3. Added `src/components/inspector/poseInspectorSemanticsContracts.test.ts` to lock semantic label/runtime-path contracts.
4. Validation evidence:
   - `2026-02-18 06:46:10Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 06:46:45Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 53 files / 232 tests).
   - `2026-02-18 06:46:57Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 16 warnings).

### [x] B1.4 Face Inspector Truthfulness and Lock Semantics

Intent:
Ensure face inspector values and lock behavior map to autorig channels.

Scope:

1. Resolve displayed "current value" from autorig channel authority.
2. Move lock behavior to channel-level autorig semantics.

Deliverables:

1. Face inspector value-source alignment.
2. Per-channel lock behavior and UI affordance.

Acceptance checks:

1. Locking `x` channel does not implicitly lock `y`/`z` unless explicitly selected.
2. Inspector shows resolved autorig channel source for current value.

Dependencies:
`B0` complete.

Completion notes (2026-02-18 07:08:40Z):

1. Added `src/components/inspector/faceInspectorSemantics.ts` and tests in `src/components/inspector/faceInspectorSemantics.test.ts` for:
   - runtime/autorig-authoritative current-value resolution (`resolveFaceInspectorCurrentValue`)
   - per-channel lock toggling without implicit sibling locking (`toggleInspectorChannelLock`, `isInspectorChannelLocked`).
2. Updated face inspector sections to use channel-aware source + lock semantics:
   - `src/components/inspector/RiggingTransformSection.tsx`
   - `src/components/inspector/RiggingMorphTargetsSection.tsx`
   - `src/components/inspector/RiggingMaterialSection.tsx`
3. Added explicit `Current Source:` context for current-value rows/tooltips and removed feature-wide lock toggles in these sections so lock affordances are per channel.
4. Added `src/components/inspector/faceInspectorSemanticsContracts.test.ts` to lock B1.4 contracts (`Current Source:` visibility + per-channel lock helper usage + no feature-wide `setFeatureAnimated` usage in face inspector sections).
5. Validation evidence:
   - `2026-02-18 07:08:40Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 07:08:40Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 55 files / 237 tests).
   - `2026-02-18 07:08:40Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 07:10:13Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

## B2 — Authoring Lifecycle Completeness

### [x] B2.1 Variables Lifecycle Completion

Intent:
Support full variable CRUD + metadata editing with clear constraints.

Scope:

1. Create/edit/delete variable items.
2. Edit metadata: name, path, min, max, default.
3. Handle guardrails for non-removable/system-managed variables.

Deliverables:

1. Complete variable lifecycle controls in inspector/pane flows.
2. Validation messaging for invalid edits.

Acceptance checks:

1. Create/edit/delete works per variable item.
2. Metadata edits persist through refresh/re-open.
3. Guardrails prevent invalid destructive operations.

Dependencies:
`B1.1`, `B1.2`.

Completion notes (2026-02-18 07:32:04Z):

1. Completed variable lifecycle affordances across pane + inspector flows:
   - `VariablesPanel` create/delete flow retained and delete confirmation messaging strengthened for destructive operations.
   - Rig variable inspector now includes explicit metadata editing (`default`, `min`, `max`) with apply/reset draft controls.
2. Added validation messaging for invalid edits and destructive guardrails in inspector:
   - numeric required/valid checks
   - min/max ordering check
   - default-within-range check
   - system-managed variable delete blocking with explicit user-facing messaging.
3. Added/updated tests:
   - `src/components/panels/VariablesPanel.test.tsx` for delete confirmation + confirmed deletion behavior.
   - `src/components/inspector/rigVariableLifecycleContracts.test.ts` for B2.1 inspector lifecycle contracts.
4. Persistence contract preserved by routing metadata edits through existing `handleUpdateStandardInput` mutation/persistence path (`useRigPersistence` + rig persistence storage), so metadata survives refresh/re-open under current face persistence model.
5. Validation evidence:
   - `2026-02-18 07:32:04Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 07:32:04Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 56 files / 242 tests).
   - `2026-02-18 07:32:04Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 07:32:04Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B2.2 Pose Lifecycle Completion

Intent:
Support full per-pose lifecycle and target-content editing.

Scope:

1. Create/edit/delete poses.
2. Edit pose target values with neutral-safe semantics.
3. Preserve deterministic pose identity and references.

Deliverables:

1. Complete pose lifecycle UI.
2. Target-content editing flow with clear save/apply behavior.

Acceptance checks:

1. Pose CRUD is available per item.
2. Target edits are reflected in pose authoring state and preview behavior.

Dependencies:
`B1.3`.

Completion notes (2026-02-18 07:52:10Z):

1. Completed pose lifecycle determinism by removing random pose IDs and enforcing deterministic collision-safe IDs across create/duplicate/add/import paths:
   - `src/poseRig/utils.ts`
   - `src/poseRig/services/poseSnapshotService.ts`
   - `src/poseRig/store.tsx`
   - `src/poseRig/usePoseRigAuthoring.ts`
2. Added deterministic ID helper coverage and store/import behavior tests:
   - `src/poseRig/utils.test.ts`
   - `src/poseRig/services/poseSnapshotService.test.ts`
   - `src/poseRig/store.test.ts`
   - `src/poseRig/usePoseRigAuthoring.test.tsx`
3. Added pose CRUD panel wiring coverage in `src/components/panels/VariablesPanel.test.tsx` to lock per-item lifecycle affordances (`New Pose`, select/apply, delete).
4. Verified target edit + preview semantics remain intact by adding focused pose authoring test coverage (`updatePoseValue` -> `applyPose` preview path) in `src/poseRig/usePoseRigAuthoring.test.tsx`.
5. Validation evidence:
   - `2026-02-18 07:52:10Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 07:52:10Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 56 files / 252 tests).
   - `2026-02-18 07:52:10Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 07:52:10Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B2.3 Pose Group Lifecycle and Membership Editing

Intent:
Support complete pose-group lifecycle with membership management.

Scope:

1. Create/edit/delete groups.
2. Add/remove poses in groups.
3. Preserve deterministic membership state.

Deliverables:

1. Complete group lifecycle controls.
2. Clear membership editor from inspector/panes.

Acceptance checks:

1. Group CRUD works per group.
2. Membership add/remove updates are deterministic and persistent.

Dependencies:
`B2.2`.

Completion notes (2026-02-18 08:05:13Z):

1. Completed pose-group lifecycle affordances so configured groups remain reachable for full CRUD even when empty:
   - `src/components/panels/VariablesPanel.tsx` now retains configured groups with zero members in the Pose Groups surface.
2. Added selection-reconciliation behavior for pose-group inspector context:
   - stale pose-group selections are refreshed when metadata changes and cleared when backing groups disappear, preventing stuck membership editor state.
3. Added/extended membership and lifecycle coverage:
   - `src/components/panels/VariablesPanel.test.tsx` for empty-group visibility, assign/unassign flows, and stale-selection clearing.
   - `src/poseRig/usePoseRigAuthoring.test.tsx` for group create/rename/delete lifecycle and deterministic membership persistence through assign/unassign cycles.
4. Membership add/remove remains deterministic and persistent by continuing to route through `updatePoseGroup` / `updatePoseGroupBatch` + pose-config draft synchronization.
5. Validation evidence:
   - `2026-02-18 08:05:13Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 08:05:13Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 56 files / 257 tests).
   - `2026-02-18 08:05:13Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 08:05:13Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B2.4 Inspector Chain Traversal Completion

Intent:
Allow full chain navigation and edits without leaving inspector.

Scope:

1. Traverse Pose -> Rig -> Autorig -> Animatable and reverse.
2. Maintain context while drilling into chain nodes.

Deliverables:

1. Complete chain navigation affordances.
2. Stable context-preserving inspector transitions.

Acceptance checks:

1. User can traverse both directions across chain nodes.
2. Selection context is preserved and not reset unexpectedly.

Dependencies:
`B1.2`, `B1.3`, `B1.4`.

Completion notes (2026-02-18 08:40:31Z):

1. Completed rig/inspector chain traversal in both directions:
   - Rig inspector now exposes explicit downstream autorig traversal (`Autorig` section) and upstream parent rig traversal (`Driven By` section) without leaving inspector context.
   - Existing scene `BindingConnections` + rig/property affordances continue to support animatable-to-rig/pose reverse traversal.
2. Hardened context-preserving chain transitions:
   - added `src/components/inspector/inspectorChainPath.ts` helper (`appendOrRevisitInspectorChainPath`) so revisiting an existing chain node truncates deterministically while refreshing latest view/target context metadata.
3. Added/updated test coverage:
   - `src/components/inspector/rigConnections.test.ts` now covers optional downstream autorig inclusion semantics.
   - `src/components/inspector/inspectorChainPath.test.ts` covers context-preserving revisit behavior.
   - `src/components/inspector/inspectorChainTraversalContracts.test.ts` locks B2.4 UI/doc traversal contracts.
4. Validation evidence:
   - `2026-02-18 08:40:31Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 08:40:31Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 58 files / 268 tests).
   - `2026-02-18 08:40:31Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 08:40:31Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

## B3 — Import/Export and Runtime Contract

### [x] B3.1 Export Runtime Compatibility Contract

Intent:
Ensure exported artifacts run correctly in external runtime consumers.

Scope:

1. Define export checks for required runtime contract fields/semantics.
2. Block or warn on non-conformant exports.

Deliverables:

1. Export validation checks.
2. User-facing diagnostics for incompatible exports.

Acceptance checks:

1. Valid exports pass contract checks.
2. Invalid exports surface actionable diagnostics.

Dependencies:
`B0` complete.

Completion notes (2026-02-18 09:01:00Z):

1. Added runtime contract audit gating directly into GLB export flow:
   - `src/hooks/useVizijExport.ts` now runs `auditBundleGraphs(bundle, { validOutputTargets })` before `exportScene`.
   - Exports are blocked when graph audit status is not `match` (`diff`, `missing-ir`, `error`) or when output coverage includes `missing-target`.
2. Added actionable export diagnostics for compatibility failures:
   - blocking dialogs now identify the failing graph and concrete reason (IR mismatch count, missing IR metadata, compile/audit error, or unmapped output path).
3. Wired runtime target context into export hook:
   - `src/components/app/ExportDialog.tsx` now passes `validOutputTargets` from binding authoring state into `useVizijExport`.
4. Added focused regression coverage in `src/hooks/__tests__/useVizijExport.test.tsx`:
   - export is blocked on audit diff failures,
   - export is blocked on missing runtime target mapping,
   - successful export path asserts `auditBundleGraphs` receives `validOutputTargets`.
5. Validation evidence:
   - `2026-02-18 09:01:00Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 09:01:00Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 58 files / 271 tests).
   - `2026-02-18 09:01:00Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 09:01:00Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B3.2 Runtime Control Surface Completeness

Intent:
Expose pose-weight controls in runtime alongside rig inputs.

Scope:

1. Ensure runtime API/surface includes pose-group/pose-weight controls.
2. Keep compatibility with existing rig input controls.

Deliverables:

1. Runtime control schema updates.
2. Authoring/runtime integration updates where needed.

Acceptance checks:

1. Runtime consumers can set pose weights and rig inputs concurrently.
2. Controls behave deterministically.

Dependencies:
`B3.1`.

Completion notes (2026-02-18 09:12:48Z):

1. Updated runtime graph bundle wiring in `src/components/app/Viewer.tsx` (`RuntimeGraphBridge`) so `poseGraphSpec` is no longer dropped when `graphSpec` exists; runtime now registers rig and pose graphs concurrently when both are present.
2. Preserved existing ref-based state guard behavior while keeping deterministic pose-payload transitions (`pose` payload remains explicitly present when rig graph is active to ensure clear add/update/remove sequencing).
3. Updated `src/components/app/Viewer.test.tsx` to assert concurrent rig+pose registration and deterministic transition call counts for add/update/remove payload changes.
4. Validation evidence:
   - `2026-02-18 09:12:48Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 09:12:48Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 58 files / 271 tests).
   - `2026-02-18 09:12:48Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 09:12:48Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B3.3 Import Normalization and Autorig Retarget

Intent:
Automatically normalize common legacy import mismatches.

Scope:

1. Auto-fix safe face-name mismatches.
2. Retarget invalid abstract-rig -> animatable bindings to autorig targets.
3. Ensure retargeting is deterministic and idempotent.

Deliverables:

1. Import normalization pass.
2. Diagnostics for remapped/fallback cases.

Acceptance checks:

1. Re-import of same asset yields stable result (idempotent).
2. Invalid direct animatable targets are remapped or explicitly flagged.

Dependencies:
`B3.1`.

Completion notes (2026-02-18 09:26:30Z):

1. Added deterministic import normalization/retarget pass in `src/rig/importer.ts`:
   - normalizes safe binding target/input id mismatches via canonical input-id resolution,
   - retargets invalid direct animatable bindings to autorig input targets when deterministically resolvable,
   - explicitly flags unresolved direct animatable bindings when safe retarget is not possible.
2. Added import diagnostics for remapped/fallback cases:
   - `RehydratedRigData` now carries `normalizationDiagnostics` (`inputIdRemaps`, `targetIdRemaps`, `animatableRetargets`, `animatableFallbacks`),
   - `src/hooks/useRigGraphImport.ts` now surfaces normalization diagnostics via import warnings/alerts and discrepancy-review mismatch reasons.
3. Added focused regression coverage in `src/rig/importer.test.ts`:
   - safe binding id mismatch normalization,
   - abstract-rig -> animatable retargeting to autorig targets,
   - explicit unresolved fallback diagnostics,
   - deterministic idempotent re-import behavior.
4. Validation evidence:
   - `2026-02-18 09:26:30Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 09:26:30Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 58 files / 275 tests).
   - `2026-02-18 09:26:30Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 8 warnings).
   - `2026-02-18 09:26:30Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

## B4 — Pose/Group Data Model Evolution

### [ ] B4.1 Decouple Pose Definitions from Group Identity

Intent:
Treat pose definitions as reusable entities, independent of group ownership.

Scope:

1. Separate pose definition identity from group membership state.
2. Preserve backward compatibility for existing imported data.

Deliverables:

1. Updated pose/group data model.
2. Migration path for legacy structures.

Acceptance checks:

1. Pose exists independently from group assignment.
2. Existing data imports without semantic loss.

Dependencies:
`B2.2`, `B2.3`.

### [ ] B4.2 Many-to-Many Pose Membership Authoring

Intent:
Allow a pose to be included in multiple groups.

Scope:

1. Membership editing UX in both pose and group contexts.
2. Conflict/duplication guardrails.

Deliverables:

1. Many-to-many membership editor behavior.
2. Clear membership visualization.

Acceptance checks:

1. A pose can be added to multiple groups and removed independently.
2. UI clearly shows all memberships for a selected pose.

Dependencies:
`B4.1`.

### [ ] B4.3 Compiler and IO Support for Shared Poses

Intent:
Keep compile/import/export deterministic under many-to-many membership.

Scope:

1. Compile path updates for shared pose membership.
2. Import/export serialization updates.

Deliverables:

1. Compiler behavior aligned with shared definitions.
2. Stable import/export representation.

Acceptance checks:

1. Round-trip import/export preserves many-to-many membership.
2. Runtime behavior stays deterministic for shared poses.

Dependencies:
`B4.1`, `B4.2`.

## B5 — Performance and Architecture Cleanup

### [ ] B5.1 Heavy Panel Rerender and Duplicate Compute Reduction

Intent:
Reduce unnecessary render and tree/filter compute in hot UI paths.

Scope:

1. Replace broad store selectors in heavy surfaces.
2. Remove duplicated hidden-surface tree filtering work.

Deliverables:

1. Narrow selectors and memoization updates.
2. Active-surface-only filtering path.

Acceptance checks:

1. Hidden surfaces no longer trigger heavy filter recomputation.
2. Profiling confirms reduced rerender count during slider/search interaction.

Dependencies:
`B1.2`.

### [ ] B5.2 Canonical Resolution and Traversal Hot-Path Optimization

Intent:
Cut repeated path/id canonicalization work in frequent operations.

Scope:

1. Introduce canonical lookup indexes for hot resolution paths.
2. Cache traversal-time canonical values where safe.
3. Optimize parent-driver creation lookup paths.

Deliverables:

1. Indexed lookup helpers.
2. Updated hot-path callers.

Acceptance checks:

1. Resolution-heavy interactions show reduced compute time.
2. Functional behavior remains unchanged.

Dependencies:
`B0` complete.

### [ ] B5.3 Boundary and Shared-Sync Correctness Hardening

Intent:
Harden graph correctness where current logic can misclassify or overwork.

Scope:

1. Make rig boundary checks transitive (ancestry-aware).
2. Consolidate repeated shared-variable sync passes.

Deliverables:

1. Correct transitive boundary validation behavior.
2. Simplified shared-sync pass behavior.

Acceptance checks:

1. No false boundary errors for valid transitive rig chains.
2. Shared-sync behavior remains correct with fewer loop passes.

Dependencies:
`B5.2`.
