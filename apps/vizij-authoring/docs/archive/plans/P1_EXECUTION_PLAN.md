# P1 Execution Plan: Finalization (Abstract Rig + Inputs + /autorig)

Last updated: 2026-02-17  
Owner: Vizij Authoring  
Scope: `apps/vizij-authoring`

## Goal

Finish P1 end-to-end so we have:

1. A consistent two-level rig model:
   - abstract rig inputs (author-authoritative),
   - autorig inputs (low-level implementation aliases),
   - poses as reusable semantic definitions,
   - pose groups as first-class entities not path-based.
2. Authoring surfaces that match runtime:
   - Inputs (replaces Drivers),
   - Poses,
   - Pose Groups,
   - and explicit create/edit/delete workflows for each.
3. Deterministic compile/validation and warning behavior for legacy non-`/autorig` mapping.

## Execution rules

- Deliver one focused commit at a time.
- Keep each commit small and reversible.
- Stop after each commit to run a smoke pass mentally, then continue only when behavior is coherent.
- Keep `pnpm --filter vizij-authoring run validate` clean for changed tranches before moving to the next commit.

## Commit 1 — Blueprint freeze and migration notes

- `apps/vizij-authoring/docs/Authoring_Blueprint.md`:
  - Keep `/autorig` as the single canonical low-level namespace.
  - Remove all path-prefix-driven pose-group semantics.
  - Confirm Inputs as sole relationship-editing surface replacing Drivers pane semantics.
  - Confirm leaf slider behavior for every Inputs leaf row.
- `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`:
  - Update “under-the-hood” model and status text from `/rig/element` to `/autorig`.
  - Mark legacy behavior as migration-gated (warn + preserve fallback).

Acceptance:

- One place (`Authoring_Blueprint.md`) defines the desired contract for Inputs, abstract rig, autorig, pose, and pose groups.
- One spec doc explicitly states `/autorig` as required namespace.

## Commit 2 — Replace Drivers surface with Inputs in state/layout

- `apps/vizij-authoring/src/state/workspaceStore.ts`
- `apps/vizij-authoring/src/App.tsx`
- `apps/vizij-authoring/src/layouts/WorkspaceLayout.tsx` (if surface ordering/order constants are sourced there)
- `apps/vizij-authoring/src/components/app/AppMenuBar.tsx` or equivalent UI toggle hooks.

Tasks:

1. Remove `drivers` from pane registration and active pane toggles.
2. Introduce `inputs` pane keys and routing names.
3. Ensure single selection + selection stack still works across Face Elements/Variables/Poses/Pose Groups/Inputs.

Acceptance:

- Left surface set is: Face Elements, Variables, Poses, Pose Groups, Inputs.
- No menu/action can activate a Drivers surface.

## Commit 3 — Convert VariablesPanel into Inputs-driven relationship editor

- `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.test.tsx`
- Related fixture helpers used by the panel tests.

Tasks:

1. Rename/repurpose the “Drivers” view to “Inputs”.
2. Inputs tree should aggregate:
   - abstract rig input nodes,
   - autorig nodes,
   - pose-group weight nodes.
3. Remove path-prefix gating for pose-group membership in surface rendering (pose/group are identity-based).
4. Keep per-folder structure and slider rendering on leaf rows.
5. Ensure each Inputs leaf opens/updates its actual control value.
6. Reuse existing row actions for quick binding inspection/edit from Inputs rows.

Acceptance:

- Leaf nodes in Inputs render an editable slider control.
- Pose rows no longer imply membership by path prefix.
- No legacy generated-path conventions (including `/pose/control`) should be used as runtime input families.

## Commit 4 — Contract cleanup: Abstract rig + `/autorig` namespace

- `apps/vizij-authoring/src/utils/rigElementInputs.ts`
- `apps/vizij-authoring/src/poseRig/*` and other normalization/mapping modules
- Any tests covering prefix behavior and alias detection.

Tasks:

1. Set canonical low-level prefix constant to `/autorig`.
2. Update low-level autorig creation, discovery, and serialization references.
3. Ensure face-derived autorigs can be reused if equivalent existing mappings are present.
4. Add/adjust migration warning path for any non-`/autorig` low-level mapping.

Acceptance:

- Imported/generated low-level nodes serialize and resolve under `/autorig`.
- `/autorig` is the enforced low-level generated prefix.

## Commit 5 — Pose definition/model decoupling from paths

- `apps/vizij-authoring/src/poseRig/types.ts`
- `apps/vizij-authoring/src/poseRig/store.tsx`
- `apps/vizij-authoring/src/poseRig/services/poseConfigService.ts`
- `apps/vizij-authoring/src/poseRig/graphBuilder.ts`
- tests in `src/poseRig/*.test.ts`

Tasks:

1. Remove implicit group derivation from `pose.group` path for membership.
2. Ensure pose membership is by explicit group identity only.
3. Keep legacy `pose.group` import fallback behind migration path and explicit migration warning if ambiguous.
4. Preserve compatibility with old assets while allowing poses to be in multiple groups.

Acceptance:

- A pose can exist in multiple groups.
- Renaming/importing faces no longer re-partitions pose membership by path.

## Commit 6 — Boundary check fixes (no abstract-rig direct animatable writes)

- `apps/vizij-authoring/src/components/rig` and `src/components/inspector` files responsible for chain validation.
- `apps/vizij-authoring/src/hooks/useRigController.ts` and graph validation hooks.
- Existing diagnostics tests.

Tasks:

1. Confirm boundary check only rejects high-level inputs writing animatable targets directly.
2. Ensure autorig nodes are accepted as the low-level boundary write targets.
3. Route diagnostics to explicit “Inputs”/autorig context with migration guidance.

Acceptance:

- Existing high-level rig->scene direct edges are either migrated or flagged as boundary violations only when truly invalid.
- Valid abstract->autorig and autorig->animatable chains remain unflagged.

## Commit 7 — Legacy mapping warning and diagnostics completion

- `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`
- `apps/vizij-authoring/src/components/app/GraphDiagnosticsPanel.tsx` and diagnostics plumbing.
- `apps/vizij-authoring/src/poseRig/services/poseSnapshotService.ts`
- Tests in corresponding spec files.

Tasks:

1. Detect non-`/autorig` generated mapping on load/import.
2. Emit migration warning with remap suggestion list.
3. Ensure warning can be inspected during export-readiness and authoring review.

Acceptance:

- Legacy mapping warning appears on import/load when contract is violated.
- Existing behavior still runs with warnings until migration is performed.

## Commit 8 — UX polish: close remaining gaps

- `apps/vizij-authoring/src/components/app/GraphDiagnosticsPanel.tsx`
- `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
- `apps/vizij-authoring/src/components/panels/VariablesPanel.test.tsx`

Tasks:

1. Ensure Inputs pane replaces all remaining drivers labels/context where applicable.
2. Audit for stale text (“Drivers”) and update copy to “Inputs”.
3. Confirm pose/pose-group actions are exposed in dedicated surfaces and not hidden behind Drivers workflow.
4. Finalize per-channel animatable/static metadata hooks (display/read-only today; not user-editable yet).

Acceptance:

- UI language consistently references Inputs (except for existing semantic chain labels where helpful).
- No user-facing feature depends on Drivers panel existence.

## Commit 9 — Closeout pass

- `apps/vizij-authoring/docs/README.md`
- `apps/vizij-authoring/docs/plans/ROADMAP_BACKLOG.md`
- `apps/vizij-authoring/docs/plans/TRACKER.md`
- `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`

Tasks:

1. Final status callout: P1 completion criteria met.
2. Document known follow-ons for P2 (per-channel static flag control remains out of scope).
3. Keep closeout checklist with precise file-level evidence.

Acceptance:

- P1 tracker status is internally consistent with implementation.
- Blueprint + chain spec + roadmap all align on `/autorig` and Inputs surface.

## Definition of P1 complete

P1 is done when:

1. Pose/pose-group/rig/input lifecycle works without path-derived shortcuts.
2. Inputs pane replaces Drivers for relationship and control authoring.
3. `/autorig` is the canonical low-level namespace with migration warnings for legacy mappings.
4. Authoring/validation surfaces still pass export and compile gate behavior.
5. Regression tests exist for new abstraction boundaries and warnings.

No next commit should begin until all previous commit acceptance items are explicitly verified.
