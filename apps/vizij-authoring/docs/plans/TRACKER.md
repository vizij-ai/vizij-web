# Vizij Authoring Tracker (Current Stage)

Last updated: 2026-02-18

Status legend: `done`, `in_progress`, `planned`, `blocked`

## Snapshot

1. Core staging fix is landed (`7ac2ada`).
2. Baseline health remains the active gate.
3. Backlog IDs in this tracker map to `plans/BACKLOG.md`.

## Validation Gate Status

### Typecheck

Status: `blocked`

Current failing areas (latest known):

1. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
2. `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`
3. `apps/vizij-authoring/src/layouts/WorkspaceLayout.tsx`
4. `apps/vizij-authoring/src/poseRig/store.tsx`

### Lint

Status: `pending_recheck_after_typecheck`

### Test

Status: `needs_reconciliation`

## Backlog Status Board

| ID   | Status      | Notes                                 |
| ---- | ----------- | ------------------------------------- |
| B0.1 | in_progress | Type errors still present             |
| B0.2 | planned     | Test baseline triage pending          |
| B0.3 | planned     | Validate path pending after B0.1/B0.2 |
| B1.1 | planned     | Waiting on baseline gate              |
| B1.2 | planned     | Waiting on baseline gate              |
| B1.3 | planned     | Waiting on baseline gate              |
| B1.4 | planned     | Waiting on baseline gate              |
| B2.1 | planned     | Depends on B1 readiness               |
| B2.2 | planned     | Depends on B1/B2.1                    |
| B2.3 | planned     | Depends on B2.2                       |
| B2.4 | planned     | Depends on B1 + B2                    |
| B3.1 | planned     | Depends on B0                         |
| B3.2 | planned     | Depends on B3.1                       |
| B3.3 | planned     | Depends on B3.1                       |
| B4.1 | planned     | Depends on B2                         |
| B4.2 | planned     | Depends on B4.1                       |
| B4.3 | planned     | Depends on B4.1/B4.2                  |
| B5.1 | planned     | Depends on B1.2                       |
| B5.2 | planned     | Depends on B0                         |
| B5.3 | planned     | Depends on B5.2                       |

## Evidence Log

Add command evidence as work progresses:

1. `[date/time] <command> -> <result summary>`
2. `[date/time] <command> -> <result summary>`

## Resolved and Archived Notes

1. `variable_investigation_2026-02-17.md` is archived; duplicate downstream autorig listing issue was resolved and retained as historical context.
2. Prior P0/P1 planning docs are archived under `docs/archive/plans/`.
