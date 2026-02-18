# Vizij Authoring Tracker (Current Stage)

Last updated: 2026-02-18

Status legend: `done`, `in_progress`, `planned`, `blocked`

## Snapshot

1. Core staging fix is landed (`7ac2ada`).
2. Baseline health gate is complete; `B0.1`, `B0.2`, and `B0.3` are done and Stage 0 is unblocked.
3. `B1.1` is complete in this worktree with inspector sizing contracts and targeted test coverage.
4. `B1.2` is complete in this worktree with a single ordered `VariablesPanel` orchestration and active-surface-only tree filtering.
5. `B1.3` is complete in this worktree with explicit pose target/applied/contribution semantics and runtime-authoritative applied-value sourcing.
6. Backlog IDs in this tracker map to `plans/BACKLOG.md`.

## Validation Gate Status

### Typecheck

Status: `done`

Latest evidence:

1. `2026-02-18 06:05:57Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
2. `2026-02-18 06:28:25Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
3. `2026-02-18 06:36:42Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).
4. `2026-02-18 06:46:10Z` — `pnpm --filter vizij-authoring run typecheck` -> pass (`tsc --noEmit`, exit 0).

### Lint

Status: `done`

Latest evidence:

1. `2026-02-18 06:13:05Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint phase exited 0 with warnings only; no lint errors).
2. `2026-02-18 06:29:04Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 16 warnings).
3. `2026-02-18 06:37:14Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 16 warnings).
4. `2026-02-18 06:46:57Z` — `pnpm --filter vizij-authoring run lint` -> pass (0 errors, 16 warnings).

### Test

Status: `done`

Latest evidence:

1. `2026-02-18 06:09:30Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 49 files / 218 tests).
2. `2026-02-18 06:13:05Z` — `pnpm --filter vizij-authoring run validate` -> pass (test phase exited 0; 49 files / 218 tests).
3. `2026-02-18 06:28:43Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 50 files / 221 tests).
4. `2026-02-18 06:36:56Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 51 files / 225 tests).
5. `2026-02-18 06:46:45Z` — `pnpm --filter vizij-authoring run test` -> pass (`vitest --run --passWithNoTests`, exit 0; 53 files / 232 tests).
6. Residual known failures: none.

## Backlog Status Board

| ID   | Status  | Notes                                                                             |
| ---- | ------- | --------------------------------------------------------------------------------- |
| B0.1 | done    | Typecheck pass recorded at `2026-02-18 06:05:57Z`                                 |
| B0.2 | done    | Test pass recorded at `2026-02-18 06:09:30Z`; residual failures: none             |
| B0.3 | done    | Validate pass recorded at `2026-02-18 06:13:05Z`; caveat: lint warnings only      |
| B1.1 | done    | Completed 2026-02-18 06:29:04Z; inspector row sizing contracts landed             |
| B1.2 | done    | Completed 2026-02-18 06:37:14Z; single ordered VariablesPanel + filter gating     |
| B1.3 | done    | Completed 2026-02-18 06:46:57Z; pose target/applied/contribution semantics landed |
| B1.4 | planned | Depends on B1.3 semantics baseline                                                |
| B2.1 | planned | Depends on B1 readiness                                                           |
| B2.2 | planned | Depends on B1/B2.1                                                                |
| B2.3 | planned | Depends on B2.2                                                                   |
| B2.4 | planned | Depends on B1 + B2                                                                |
| B3.1 | planned | Depends on B0                                                                     |
| B3.2 | planned | Depends on B3.1                                                                   |
| B3.3 | planned | Depends on B3.1                                                                   |
| B4.1 | planned | Depends on B2                                                                     |
| B4.2 | planned | Depends on B4.1                                                                   |
| B4.3 | planned | Depends on B4.1/B4.2                                                              |
| B5.1 | planned | Depends on B1.2                                                                   |
| B5.2 | planned | Depends on B0                                                                     |
| B5.3 | planned | Depends on B5.2                                                                   |

## Evidence Log

1. `[2026-02-18 06:05:57Z] pnpm --filter vizij-authoring run typecheck -> pass (tsc --noEmit, exit 0)`
2. `[2026-02-18 06:09:30Z] pnpm --filter vizij-authoring run test -> pass (vitest --run --passWithNoTests, exit 0; 49 files / 218 tests; residual failures: none)`
3. `[2026-02-18 06:13:05Z] pnpm --filter vizij-authoring run validate -> pass (pnpm run lint && pnpm run typecheck && pnpm run test, exit 0; caveat: lint reported 16 no-unused-vars warnings, no errors)`
4. `[2026-02-18 06:28:25Z] pnpm --filter vizij-authoring run typecheck -> pass (tsc --noEmit, exit 0)`
5. `[2026-02-18 06:28:43Z] pnpm --filter vizij-authoring run test -> pass (vitest --run --passWithNoTests, exit 0; 50 files / 221 tests)`
6. `[2026-02-18 06:29:04Z] pnpm --filter vizij-authoring run lint -> pass (0 errors, 16 warnings)`
7. `[2026-02-18 06:36:42Z] pnpm --filter vizij-authoring run typecheck -> pass (tsc --noEmit, exit 0)`
8. `[2026-02-18 06:36:56Z] pnpm --filter vizij-authoring run test -> pass (vitest --run --passWithNoTests, exit 0; 51 files / 225 tests)`
9. `[2026-02-18 06:37:14Z] pnpm --filter vizij-authoring run lint -> pass (0 errors, 16 warnings)`
10. `[2026-02-18 06:46:10Z] pnpm --filter vizij-authoring run typecheck -> pass (tsc --noEmit, exit 0)`
11. `[2026-02-18 06:46:45Z] pnpm --filter vizij-authoring run test -> pass (vitest --run --passWithNoTests, exit 0; 53 files / 232 tests)`
12. `[2026-02-18 06:46:57Z] pnpm --filter vizij-authoring run lint -> pass (0 errors, 16 warnings)`

## Resolved and Archived Notes

1. `variable_investigation_2026-02-17.md` is archived; duplicate downstream autorig listing issue was resolved and retained as historical context.
2. Prior P0/P1 planning docs are archived under `docs/archive/plans/`.
