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

### [x] B4.1 Decouple Pose Definitions from Group Identity

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

Implementation (2026-02-18):

1. Canonicalized pose membership in code paths to use `groupIds` while keeping legacy `group`/`groupId` as derived compatibility fields:
   - added shared membership utilities in `src/poseRig/groupMembership.ts`,
   - updated normalize/create paths in `src/poseRig/services/poseConfigService.ts`,
   - updated store mutation paths in `src/poseRig/store.tsx`,
   - updated compile group resolution in `src/poseRig/graphBuilder.ts`.
2. Decoupled generated pose definition identity from group assignment:
   - deterministic fallback IDs now derive from pose naming only (not group path) in `src/poseRig/utils.ts`,
   - deterministic collision suffix behavior remains unchanged.
3. Preserved legacy import semantics with explicit migration coverage:
   - legacy `group`/`groupId` import now migrates to canonical `groupIds` without losing effective membership or pose values.
4. Added/updated regression coverage:
   - `src/poseRig/store.test.ts`,
   - `src/poseRig/services/poseConfigService.test.ts`,
   - `src/poseRig/graphBuilder.test.ts`,
   - `src/poseRig/usePoseRigAuthoring.test.tsx`,
   - `src/poseRig/utils.test.ts`,
   - `src/poseRig/services/poseSnapshotService.test.ts`.
5. Validation evidence:
   - `2026-02-18 09:40:59Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 09:40:59Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 58 files / 279 tests).
   - `2026-02-18 09:40:59Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).
   - `2026-02-18 09:40:59Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B4.2 Many-to-Many Pose Membership Authoring

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

Implementation (2026-02-18):

1. Extended pose-group membership actions in `src/poseRig/store.tsx` and `src/poseRig/usePoseRigAuthoring.ts` for explicit many-to-many assignment/unassignment:
   - added `addPoseToGroup` and `removePoseFromGroup` actions (plus hook exports),
   - preserved existing memberships when adding/removing one group,
   - enforced deduplication and deterministic `groupIds` ordering while keeping `group`/`groupId` derived from primary membership.
2. Updated group-context membership UX in `src/components/panels/VariablesPanel.tsx`:
   - pose-group rows now resolve membership from canonical `groupIds`,
   - assign/unassign toggles now call many-to-many add/remove actions without collapsing other memberships,
   - selected-pose banner now renders the full membership list.
3. Updated pose-context membership UX in `src/components/inspector/InspectorContent.tsx`:
   - added pose membership section with explicit list/chips for all assigned groups,
   - added add/remove controls (prompt + quick configured-group assignment buttons),
   - added duplicate guardrail messaging for already-assigned groups.
4. Added regression coverage for many-to-many membership behavior and visualization:
   - `src/poseRig/store.test.ts`,
   - `src/poseRig/usePoseRigAuthoring.test.tsx`,
   - `src/components/panels/VariablesPanel.test.tsx`.
5. Validation evidence:
   - `2026-02-18 09:53:33Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 09:53:43Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 58 files / 282 tests).
   - `2026-02-18 09:54:00Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).
   - `2026-02-18 09:54:07Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B4.3 Compiler and IO Support for Shared Poses

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

Implementation (2026-02-18):

1. Canonicalized shared-pose membership resolution for compile + IO in `src/poseRig/groupMembership.ts`:
   - added deterministic membership ordering via `orderPoseMembershipIds` (configured pose-group order first, lexical fallback),
   - resolved compatibility-path promotion so explicit group paths can supersede ID-derived fallback paths,
   - added `groupPathsById` to resolved membership output so all memberships (not only primary) preserve deterministic path mapping.
2. Updated compile path for shared membership in `src/poseRig/graphBuilder.ts`:
   - compile group resolution now uses per-membership `groupPathsById` mapping for each `groupId`,
   - shared poses now compile deterministically even when equivalent `groupIds` arrive in different order.
3. Updated config import/export normalization path in `src/poseRig/services/poseConfigService.ts` and store canonicalization in `src/poseRig/store.tsx`:
   - normalize/create paths now share deterministic membership ordering and path mapping semantics,
   - compatibility fields (`group`, `groupId`) remain derived coherently from canonical `groupIds`.
4. Added targeted regression coverage:
   - `src/poseRig/graphBuilder.test.ts` (shared-pose compile determinism + many-to-many group weight wiring),
   - `src/poseRig/services/poseConfigService.test.ts` (deterministic many-to-many normalize order + serialize/normalize round-trip stability),
   - `src/poseRig/services/poseGraphService.test.ts` (deterministic runtime graph/summary outputs for equivalent shared memberships).
5. Validation evidence:
   - `2026-02-18 10:06:42Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 10:06:42Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 58 files / 286 tests).
   - `2026-02-18 10:06:42Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).
   - `2026-02-18 10:06:42Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

## B5 — Performance and Architecture Cleanup

### [x] B5.1 Heavy Panel Rerender and Duplicate Compute Reduction

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

Completion notes (2026-02-18 10:17:11Z):

1. Replaced broad binding-store selectors in heavy panel/inspector surfaces with targeted selectors:
   - `src/components/panels/VariablesPanel.tsx`
   - `src/components/inspector/InspectorContent.tsx`
   - `src/components/inspector/InspectorPanel.tsx`
   - `src/components/inspector/RiggingTransformSection.tsx`
   - `src/components/inspector/RiggingMorphTargetsSection.tsx`
   - `src/components/inspector/RiggingMaterialSection.tsx`
2. Removed duplicate hidden-surface work in `VariablesPanel` by:
   - resolving visible tree roots through one active-surface-only path (`resolveVisibleRootForActiveSurface`),
   - avoiding non-active tab-panel render work (`renderPanel` now returns `null` for inactive surfaces).
3. Added regression/perf-oriented tests:
   - `src/components/panels/VariablesPanel.test.tsx` (`resolveVisibleRootForActiveSurface` verifies exactly one active-surface filter invocation)
   - `src/components/inspector/panelPerformanceContracts.test.ts` (guards against broad `useBindingAuthoring((state) => state)` usage and asserts active-surface panel gating hooks)
4. Profiling evidence (deterministic instrumentation):
   - `resolveVisibleRootForActiveSurface` contract test confirms hidden surfaces do not execute filter callbacks while active surface filtering executes once per run.
   - panel performance contract test confirms heavy surfaces no longer use broad binding-store selectors that trigger unrelated rerenders.
5. Validation evidence:
   - `2026-02-18 10:16:19Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 10:16:34Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 59 files / 289 tests).
   - `2026-02-18 10:16:56Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).
   - `2026-02-18 10:17:11Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B5.2 Canonical Resolution and Traversal Hot-Path Optimization

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

Completion notes (2026-02-18 10:32:53Z):

1. Added canonical lookup index/cache helpers in `src/utils/standardInputResolutionIndex.ts`:
   - cached canonical id resolution (`resolveStandardRigInputId`) for repeated alias lookups,
   - indexed normalized id/path alias lookup for resolver paths,
   - indexed equivalent target-id lookup by comparable canonical path for parent-driver fan-out.
2. Updated B5.2 hot-path callers to consume indexed lookups:
   - `src/components/inspector/bindingSlotResolution.ts` now resolves canonical fallback ids through indexed alias helpers (including cached fallback for map-empty legacy paths).
   - `src/hooks/useBindingManager.ts` parent-driver creation now resolves canonical ids and equivalent target ids through shared indexes instead of per-call full input-map scans.
   - `src/components/inspector/rigConnections.ts` now uses cached canonical rig-id matching and exposes `buildPoseRigTraversalIndex` so traversal selection/find/move paths can reuse indexed node/path lookups.
   - `src/components/inspector/BindingConnections.tsx` now memoizes and reuses traversal index data across traversal interactions.
3. Added deterministic perf + equivalence tests:
   - `src/utils/standardInputResolutionIndex.test.ts` proves canonical lookup cache miss reduction (`canonicalResolutionMisses` stays `1` across repeated hot-path resolutions) while preserving alias/equivalent-id behavior.
   - `src/components/inspector/rigConnections.test.ts` adds traversal-index contract coverage that validates selection/find/move work with indexed lookups without array `.find` rescans.
   - existing behavior tests in `src/components/inspector/bindingSlotResolution.test.ts` and `src/hooks/__tests__/useBindingManager.test.ts` remain green under indexed paths.
4. Validation evidence:
   - `2026-02-18 10:32:05Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 10:32:19Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 60 files / 295 tests).
   - `2026-02-18 10:32:41Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).
   - `2026-02-18 10:32:53Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

### [x] B5.3 Boundary and Shared-Sync Correctness Hardening

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

Completion notes (2026-02-18 10:45:15Z):

1. Hardened boundary normalization with transitive ancestry awareness in `src/rig/importer.ts`:
   - importer now builds downstream rig-input ancestry from binding summaries,
   - direct animatable boundary checks accept valid transitive `input -> ... -> autorig(component)` chains,
   - invalid direct animatable writers still retarget/fallback exactly as before.
2. Consolidated shared-variable sync passes in `src/hooks/useSharedVariableSync.ts`:
   - merged separate value-sync loops into one per-cycle shared-pair pass,
   - preserved mirror/suppression/conflict semantics while reducing repeated pair scans,
   - added optional sync-pass metrics (`passCount`, `pairEvaluations`) for deterministic workload assertions.
3. Added targeted regression and pass-count tests:
   - `src/rig/importer.test.ts` proves valid transitive rig ancestry no longer triggers false boundary retarget/fallback diagnostics.
   - `src/hooks/__tests__/useSharedVariableSync.test.tsx` proves mirroring behavior remains correct and asserts single-pass metrics (`passCount = 1`, `pairEvaluations = pairCount`) for sync cycles.
   - existing invalid boundary tests in `src/rig/importer.test.ts` remain green, preserving failure behavior for truly invalid cases.
4. Fixed a strict-type nullability edge in `src/utils/standardInputResolutionIndex.ts` cache initialization so indexed canonical resolution remains type-safe under `tsc --noEmit`.
5. Validation evidence:
   - `2026-02-18 10:49:18Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 10:49:18Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 60 files / 297 tests).
   - `2026-02-18 10:49:18Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).
   - `2026-02-18 10:49:18Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` -> `typecheck` -> `test`, exit 0; lint warnings only).

## Optional Follow-Ups (Post-B5.3)

These items are intentionally out-of-band from the ordered B0-B5 execution plan and can be scheduled opportunistically.

### [ ] O1 Zero-warning lint hardening for active hot surfaces

Intent:
Remove residual dead-code/unused-symbol warnings in `VariablesPanel` and tighten quality gate strictness when practical.

Scope:

1. Eliminate current `@typescript-eslint/no-unused-vars` warnings in `src/components/panels/VariablesPanel.tsx`.
2. Evaluate promoting lint warnings to gating failures (`--max-warnings=0`) once warning baseline is clear.

Acceptance checks:

1. `pnpm --filter vizij-authoring run lint` reports 0 warnings in touched scope.
2. `TRACKER.md` records the warning-count change and any gate policy adjustment.

### [ ] O2 Stage-5 empirical performance evidence capture

Intent:
Complement deterministic perf-contract tests with measured profiling evidence on representative large rigs.

Scope:

1. Define one repeatable profiling scenario for slider/search interactions on a dense rig.
2. Record before/after (or current baseline) rerender/compute timing evidence.

Acceptance checks:

1. Evidence is captured in docs with command/steps and numeric results.
2. Stage-5 responsiveness claim has explicit empirical support.

### [ ] O3 Multi-candidate autorig retarget quality guardrails

Intent:
Strengthen deterministic import retargeting when multiple autorig candidates exist for one component.

Scope:

1. Define deterministic candidate-priority semantics beyond lexical fallback.
2. Add regression tests for multi-candidate component retarget scenarios.

Acceptance checks:

1. Import retarget behavior is deterministic and semantically prioritized under candidate ambiguity.
2. Tests cover at least one ambiguous multi-candidate case.

### [ ] O4 Shared-sync topology lifecycle cleanup

Intent:
Prevent stale per-path sync bookkeeping when shared variable topology changes.

Scope:

1. Prune stale suppression/previous-write refs when shared pairs are removed or replaced.
2. Add tests for remove/re-add topology transitions.

Acceptance checks:

1. Shared-sync behavior remains deterministic after pair removal/re-add flows.
2. Conflict/mirroring state does not leak across removed paths.

## Prioritized Manual QA Intake (Post-B5.3)

These items come from manual validation findings and are prioritized by runtime correctness first, then workflow integrity, then UX polish.

### Priority P0 (Correctness / Data Integrity)

### [ ] Q0.1 Autorig Retarget Sequencing and Rebind Correctness

Intent:
Ensure retargeting/migration applies in the correct order: establish autorig targets first, then rebind animatable writes onto those autorig nodes deterministically.

Scope:

1. Audit and fix import/retarget sequencing so autorig target provisioning occurs before retarget/rebind resolution.
2. Guarantee post-import binding graph routes animatable writes through autorig nodes (no invalid intermediate or direct abstract-rig animatable writes).
3. Improve diagnostics for each rebind step (`created autorig`, `rebound edge`, `fallback/blocked`) for auditable migration behavior.

Acceptance checks:

1. Imported legacy assets with invalid direct animatable writes are transformed into valid autorig-mediated chains with deterministic results.
2. Re-import remains idempotent after retargeting.
3. Regression tests cover multi-step retarget/rebind sequencing.

### [ ] Q0.2 Pose Target Authoring Must Reuse Existing Rig Inputs (No Ghost Variable Creation)

Intent:
Fix pose authoring so adding a property to a pose references existing autorig/rig input identities instead of creating unintended new variables per property.

Scope:

1. Reproduce and fix the pose-property add flow that appears to mint new variables.
2. Enforce pose target linkage to canonical existing input ids.
3. Add explicit guardrails/warnings when a selected property cannot map to a valid existing input.

Acceptance checks:

1. Adding a property to a pose does not increase unrelated variable/input counts.
2. Pose entries reference existing canonical input ids.
3. Tests assert no implicit variable creation during pose target assignment.

### Priority P1 (Core Workflow Reliability)

### [ ] Q1.1 “Select Variable to Drive” / “Select Property to Drive” Modal Re-architecture

Intent:
Rebuild variable/property selection modals with reliable hierarchy and search behavior suitable for dense scenes.

Scope:

1. Redesign source hierarchy for browseability (clear parent-child grouping, stable sort, predictable labels).
2. Replace/repair search indexing and matching so expected results surface for id/path/label aliases.
3. Improve filter-result affordances (match highlighting, empty-state diagnostics, selected-path breadcrumbs).

Acceptance checks:

1. Search reliably returns expected targets by common query forms (label, path segment, id fragment).
2. Hierarchy is deterministic and navigable for large scene/property sets.
3. Modal selection latency remains responsive under representative large datasets.

### [x] Q1.2 Runtime Slider Range Reactivity for Metadata Edits

Intent:
Ensure slider controls immediately reflect edited `min/default/max` metadata ranges.

Scope:

1. Propagate updated range metadata to active slider components without stale memo/state lag.
2. Clamp/normalize current values correctly when updated bounds invalidate prior values.
3. Keep numeric field, slider UI, and persisted metadata in sync.

Acceptance checks:

1. Editing `min/max` updates slider bounds instantly for the active item.
2. Invalid ranges are handled with clear validation and no broken slider state.
3. Tests cover range updates and value clamping behavior.

Completion notes (2026-02-18 19:12:51Z):

1. Added `src/components/inspector/rigMetadataReactivity.ts` and tests in `src/components/inspector/rigMetadataReactivity.test.ts` to lock deterministic range normalization + current-value clamping behavior when metadata changes.
2. Updated rig metadata apply flow in `src/components/inspector/InspectorContent.tsx` to:
   - resolve/clamp runtime value against edited min/max immediately via `resolveRigMetadataReactivity`,
   - apply clamped metadata through `handleUpdateStandardInput`,
   - stage clamped current values with `handleInputValueChange` when bounds invalidate prior values,
   - keep draft numeric fields aligned with applied metadata values.
3. Validation evidence:
   - `2026-02-18 19:12:51Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 19:12:51Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 61 files / 303 tests).
   - `2026-02-18 19:12:51Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).

### [x] Q1.3 Control Elements Pane Information Architecture + Count Rendering Fix

Intent:
Align pane naming/structure with authoring model and fix broken zero-count label rendering.

Scope:

1. Rename top-level combined pane from “Variables” to “Control Elements.”
2. Keep “Variables” as the sub-surface/tab label within that pane.
3. Fix count formatting bug so zero-count labels render as “Poses (0)” style (no concatenated `poses0` artifacts).

Acceptance checks:

1. Top-level pane displays “Control Elements” consistently.
2. Sub-surface naming remains explicit (`Variables`, `Poses`, `Pose Groups`, `Inputs`).
3. Count rendering is correct and visually consistent for zero and non-zero cases.

Completion notes (2026-02-18 19:12:51Z):

1. Renamed the combined pane header in `src/components/panels/VariablesPanel.tsx` from per-surface titles to a stable top-level title: `Control Elements`.
2. Preserved explicit sub-surface naming while fixing count rendering:
   - added `formatSurfaceLabelWithCount`,
   - updated tab labels to `Variables (N)`, `Poses (N)`, `Pose Groups (N)`, `Inputs (N)` (including zero-count cases).
3. Added regression coverage in `src/components/panels/VariablesPanel.test.tsx` for:
   - `Control Elements` header rendering,
   - explicit zero-count labels (`Poses (0)` style),
   - count-label formatting helper stability.
4. Validation evidence:
   - `2026-02-18 19:12:51Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
   - `2026-02-18 19:12:51Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 61 files / 303 tests).
   - `2026-02-18 19:12:51Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 7 warnings).

### Priority P2 (UX Consistency / Visual System)

### [ ] Q2.1 My Drivers Binding + Expression Editor UX Overhaul

Intent:
Redesign the My Drivers binding/expression editing surface to match the visual and interaction quality of the rest of the app.

Scope:

1. Refresh layout, typography, spacing, and component hierarchy to align with current inspector/panel aesthetic.
2. Improve binding row readability and expression editing affordances (state clarity, error display, action grouping).
3. Ensure chain navigation and binding actions remain discoverable during redesign.

Acceptance checks:

1. My Drivers UI is visually consistent with current app standards.
2. Binding + expression workflows remain functionally complete.
3. UX regressions are covered by updated interaction tests.
