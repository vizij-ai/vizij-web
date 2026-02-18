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

Stage 1 progress (2026-02-18 06:37:14Z):

1. `B1.1` complete; inspector numeric rows now enforce `88px` minimum numeric width, `32px` minimum row hit target height, and flexible wrapping to avoid clipping at common panel widths.
2. `B1.2` complete; left sidebar now keeps Hierarchy separate and consolidates variable-related panes into one `VariablesPanel` with deterministic surface ordering (`variables` -> `poses` -> `pose-groups` via materials toggle -> `inputs`), plus active-surface-only tree filtering.
3. Validation evidence for `B1.2`: `2026-02-18 06:36:42Z` (`typecheck` pass), `2026-02-18 06:36:56Z` (`test` pass), `2026-02-18 06:37:14Z` (`lint` pass, warnings only).
4. `B1.3` and `B1.4` remain planned.

## Stage 2 — Authoring Lifecycle Completeness

Objective:
Provide full lifecycle editing for variables, poses, and pose groups from inspector-centered workflows.

Backlog scope:
`B2.1`, `B2.2`, `B2.3`, `B2.4`

Exit gate:

1. No lifecycle gaps across variables/poses/pose groups.
2. Chain traversal and editing are complete without context loss.

## Stage 3 — Import/Export + Runtime Contract

Objective:
Guarantee deterministic interoperability between authoring exports/imports and runtime consumers.

Backlog scope:
`B3.1`, `B3.2`, `B3.3`

Exit gate:

1. Export contract checks pass for target runtime.
2. Runtime controls include pose weights and rig inputs.
3. Import converges legacy data safely and deterministically.

## Stage 4 — Pose/Group Model Evolution

Objective:
Support reusable pose definitions and many-to-many group membership with deterministic compile behavior.

Backlog scope:
`B4.1`, `B4.2`, `B4.3`

Exit gate:

1. Shared pose definitions are first-class.
2. Multi-group membership works through authoring, compile, import, and export.

## Stage 5 — Performance and Modularity Cleanup

Objective:
Reduce unnecessary compute/rerender pressure and harden correctness around boundary/sync behavior.

Backlog scope:
`B5.1`, `B5.2`, `B5.3`

Exit gate:

1. Hot-path interactions remain responsive under large rigs.
2. Core perf/correctness findings from audit are resolved or explicitly deferred.
