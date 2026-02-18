# Vizij Authoring Roadmap

Last updated: 2026-02-18

This file defines execution order. Detailed implementation tasks live only in `BACKLOG.md`.

## Stage Ordering Contract

1. Stage 0 is blocking.
2. Later stages can start only when prior stage exit gates are met (unless explicitly waived in `TRACKER.md`).
3. Priorities inside a stage are defined by backlog IDs.

## Stage 0 — Baseline Recovery (Blocker)

Objective:
Restore green engineering baseline and stable local validation.

Backlog scope:
`B0.1`, `B0.2`, `B0.3`

Exit gate:

1. Typecheck green.
2. Lint green.
3. Test status reconciled and documented.

Stage 0 progress (2026-02-18 06:13:05Z):

1. `B0.1` complete; typecheck gate is currently green.
2. `B0.2` complete; test gate is green (`pnpm --filter vizij-authoring run test` pass, no quarantines, residual failures: none).
3. `B0.3` complete; `pnpm --filter vizij-authoring run validate` passed (`lint` -> `typecheck` -> `test`, exit 0).
4. Stage 0 exit gate is satisfied; caveat: lint emits warnings (no errors), so gate health is currently based on error-free lint execution.

## Stage 1 — Inspector and Sidebar Usability

Objective:
Make high-frequency authoring interactions legible and unambiguous.

Backlog scope:
`B1.1`, `B1.2`, `B1.3`, `B1.4`

Exit gate:

1. Inspector controls are readable and consistent at supported panel widths.
2. Users can distinguish target/current/contribution values.
3. Locking behavior is per autorig channel.

Stage 1 progress (2026-02-18 07:08:40Z):

1. `B1.1` complete; inspector numeric rows now enforce `88px` minimum numeric width, `32px` minimum row hit target height, and flexible wrapping to avoid clipping at common panel widths.
2. `B1.2` complete; left sidebar now keeps Hierarchy separate and consolidates variable-related panes into one `VariablesPanel` with deterministic surface ordering (`variables` -> `poses` -> `pose-groups` via materials toggle -> `inputs`), plus active-surface-only tree filtering.
3. Validation evidence for `B1.2`: `2026-02-18 06:36:42Z` (`typecheck` pass), `2026-02-18 06:36:56Z` (`test` pass), `2026-02-18 06:37:14Z` (`lint` pass, warnings only).
4. `B1.3` complete; pose inspector now shows explicit `Target Value`, `Current/Applied`, and `Contribution Strength` semantics, with contribution computed via a dedicated helper and applied values sourced from the runtime/autorig-authoritative path.
5. Validation evidence for `B1.3`: `2026-02-18 06:46:10Z` (`typecheck` pass), `2026-02-18 06:46:45Z` (`test` pass), `2026-02-18 06:46:57Z` (`lint` pass, warnings only).
6. `B1.4` complete; face inspector now resolves and displays per-channel runtime source context (`Current Source`) and applies lock behavior per channel without implicit sibling locking.
7. Validation evidence for `B1.4`: `2026-02-18 07:08:40Z` (`typecheck` pass), `2026-02-18 07:08:40Z` (`test` pass), `2026-02-18 07:08:40Z` (`lint` pass, warnings only).

## Stage 2 — Authoring Lifecycle Completeness

Objective:
Provide full lifecycle editing for variables, poses, and pose groups from inspector-centered workflows.

Backlog scope:
`B2.1`, `B2.2`, `B2.3`, `B2.4`

Exit gate:

1. No lifecycle gaps across variables/poses/pose groups.
2. Chain traversal and editing are complete without context loss.

Stage 2 progress (2026-02-18 08:40:31Z):

1. `B2.1` complete; variable lifecycle is now explicit across pane + inspector flows with create/delete operations and dedicated inspector metadata editing (`default`, `min`, `max`) plus validation messaging.
2. System-managed variable delete guardrails are explicit in inspector UI and block destructive operations; custom variable deletion requires confirmation messaging in pane flow.
3. `B2.2` complete; pose lifecycle now enforces deterministic identity/references (no random IDs) across create/duplicate/add/import paths while preserving per-item CRUD and target edit/preview behavior.
4. `B2.3` complete; pose-group lifecycle now keeps configured groups visible even when empty and reconciles/clears stale group-selection context, with explicit membership assignment coverage.
5. `B2.4` complete; rig inspector now supports explicit chain traversal through downstream autorig nodes and upstream parent rig nodes, while chain-path revisits preserve latest node context (view/target metadata) instead of resetting unexpectedly.
6. Validation evidence for `B2.1`: `2026-02-18 07:32:04Z` (`typecheck` pass), `2026-02-18 07:32:04Z` (`test` pass), `2026-02-18 07:32:04Z` (`lint` pass, warnings only), `2026-02-18 07:32:04Z` (`validate` pass).
7. Validation evidence for `B2.2`: `2026-02-18 07:52:10Z` (`typecheck` pass), `2026-02-18 07:52:10Z` (`test` pass), `2026-02-18 07:52:10Z` (`lint` pass, warnings only), `2026-02-18 07:52:10Z` (`validate` pass).
8. Validation evidence for `B2.3`: `2026-02-18 08:05:13Z` (`typecheck` pass), `2026-02-18 08:05:13Z` (`test` pass), `2026-02-18 08:05:13Z` (`lint` pass, warnings only), `2026-02-18 08:05:13Z` (`validate` pass).
9. Validation evidence for `B2.4`: `2026-02-18 08:40:31Z` (`typecheck` pass), `2026-02-18 08:40:31Z` (`test` pass), `2026-02-18 08:40:31Z` (`lint` pass, warnings only), `2026-02-18 08:40:31Z` (`validate` pass).

## Stage 3 — Import/Export + Runtime Contract

Objective:
Guarantee deterministic interoperability between authoring exports/imports and runtime consumers.

Backlog scope:
`B3.1`, `B3.2`, `B3.3`

Exit gate:

1. Export contract checks pass for target runtime.
2. Runtime controls include pose weights and rig inputs.
3. Import converges legacy data safely and deterministically.

Stage 3 progress (2026-02-18 09:26:30Z):

1. `B3.1` complete; export flow now enforces runtime compatibility contract checks by auditing bundled graphs against compiled IR and runtime output target coverage before GLB export.
2. Invalid exports now surface actionable diagnostics in export flow (mismatch type + failing graph/output path) and are blocked prior to `exportScene`.
3. Validation evidence for `B3.1`: `2026-02-18 09:01:00Z` (`typecheck` pass), `2026-02-18 09:01:00Z` (`test` pass), `2026-02-18 09:01:00Z` (`lint` pass, warnings only), `2026-02-18 09:01:00Z` (`validate` pass).
4. `B3.2` complete; runtime control surface now registers rig and pose graphs concurrently in `RuntimeGraphBridge`, removing previous coupling that dropped `poseGraphSpec` whenever `graphSpec` was present.
5. `B3.2` regression coverage now asserts deterministic runtime bundle transitions and call sequencing for concurrent rig/pose updates in `Viewer.test.tsx`.
6. Validation evidence for `B3.2`: `2026-02-18 09:12:48Z` (`typecheck` pass), `2026-02-18 09:12:48Z` (`test` pass), `2026-02-18 09:12:48Z` (`lint` pass, warnings only), `2026-02-18 09:12:48Z` (`validate` pass).
7. `B3.3` complete; import path now normalizes safe binding id mismatches and deterministically retargets invalid abstract-rig -> animatable bindings to autorig targets in the shared importer layer, with explicit unresolved fallback diagnostics.
8. `B3.3` regression coverage now asserts safe remap, deterministic retarget, explicit fallback flagging, and idempotent re-import behavior in `src/rig/importer.test.ts`.
9. Validation evidence for `B3.3`: `2026-02-18 09:26:30Z` (`typecheck` pass), `2026-02-18 09:26:30Z` (`test` pass), `2026-02-18 09:26:30Z` (`lint` pass, warnings only), `2026-02-18 09:26:30Z` (`validate` pass).

## Stage 4 — Pose/Group Model Evolution

Objective:
Support reusable pose definitions and many-to-many group membership with deterministic compile behavior.

Backlog scope:
`B4.1`, `B4.2`, `B4.3`

Exit gate:

1. Shared pose definitions are first-class.
2. Multi-group membership works through authoring, compile, import, and export.

Stage 4 progress (2026-02-18 10:06:42Z):

1. `B4.1` complete; pose membership now normalizes through canonical `groupIds` while preserving legacy `group`/`groupId` compatibility fields across store/config/compile flows.
2. `B4.1` deterministic identity is now decoupled from group assignment for generated pose IDs (name-based stable IDs with deterministic collision suffixes).
3. `B4.2` complete; authoring now supports many-to-many pose membership editing in both pose and pose-group contexts, with duplicate-assignment guardrails and deterministic membership ordering.
4. Validation evidence for `B4.2`: `2026-02-18 09:53:33Z` (`typecheck` pass), `2026-02-18 09:53:43Z` (`test` pass), `2026-02-18 09:54:00Z` (`lint` pass, warnings only), `2026-02-18 09:54:07Z` (`validate` pass).
5. `B4.3` complete; compile/import/export now share deterministic many-to-many membership canonicalization via resolved `groupIds` ordering + per-membership path mapping (`groupPathsById`), preserving coherent `group`/`groupId` compatibility fields.
6. `B4.3` regression coverage now asserts shared-pose compile determinism, serialize/normalize round-trip membership stability, and deterministic runtime graph outputs for equivalent shared membership sets.
7. Validation evidence for `B4.3`: `2026-02-18 10:06:42Z` (`typecheck` pass), `2026-02-18 10:06:42Z` (`test` pass), `2026-02-18 10:06:42Z` (`lint` pass, warnings only), `2026-02-18 10:06:42Z` (`validate` pass).

## Stage 5 — Performance and Modularity Cleanup

Objective:
Reduce unnecessary compute/rerender pressure and harden correctness around boundary/sync behavior.

Backlog scope:
`B5.1`, `B5.2`, `B5.3`

Exit gate:

1. Hot-path interactions remain responsive under large rigs.
2. Core perf/correctness findings from audit are resolved or explicitly deferred.

Stage 5 progress (2026-02-18 10:45:15Z):

1. `B5.1` complete; heavy panel/inspector surfaces now use targeted binding-store selectors instead of broad whole-store pulls, reducing unrelated rerender pressure.
2. `B5.1` removed duplicate hidden-surface tree/filter work in `VariablesPanel` by routing filtering through a single active-surface root resolver and skipping inactive tab-panel rendering work.
3. `B5.1` deterministic perf coverage now asserts:
   - active-surface-only filter callback execution (`resolveVisibleRootForActiveSurface` calls filter exactly once for active surface),
   - broad selector regression guardrails across heavy files (`panelPerformanceContracts.test.ts`).
4. Validation evidence for `B5.1`: `2026-02-18 10:16:19Z` (`typecheck` pass), `2026-02-18 10:16:34Z` (`test` pass), `2026-02-18 10:16:56Z` (`lint` pass, warnings only), `2026-02-18 10:17:11Z` (`validate` pass).
5. `B5.2` complete; canonical resolution and traversal hot paths now share indexed lookup/cache helpers (`standardInputResolutionIndex` + traversal index) instead of repeated map/array scans across resolver helpers, traversal selection, and parent-driver creation.
6. `B5.2` deterministic perf coverage now asserts:
   - canonical resolution cache misses stay bounded (`canonicalResolutionMisses = 1`) across repeated hot-path id/path resolutions (`standardInputResolutionIndex.test.ts`),
   - traversal selection/find/move can execute from prebuilt traversal indexes without `.find` rescans (`rigConnections.test.ts` traversal index contract).
7. Validation evidence for `B5.2`: `2026-02-18 10:32:05Z` (`typecheck` pass), `2026-02-18 10:32:19Z` (`test` pass), `2026-02-18 10:32:41Z` (`lint` pass, warnings only), `2026-02-18 10:32:53Z` (`validate` pass).
8. `B5.3` complete; rig import boundary checks now evaluate transitive rig ancestry into autorig targets so valid multi-hop chains are no longer misclassified as direct animatable violations.
9. `B5.3` shared-variable sync now executes a single per-cycle shared-pair pass (with deterministic pass metrics) while preserving mirror/conflict behavior.
10. Validation evidence for `B5.3`: `2026-02-18 10:49:18Z` (`typecheck` pass), `2026-02-18 10:49:18Z` (`test` pass), `2026-02-18 10:49:18Z` (`lint` pass, warnings only), `2026-02-18 10:49:18Z` (`validate` pass).
