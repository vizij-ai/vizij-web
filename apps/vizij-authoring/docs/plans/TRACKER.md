# Vizij Authoring Tracker

Last updated: 2026-02-19

Status legend: `done`, `in_progress`, `planned`, `blocked`, `deferred`

## Snapshot

1. Pose IR MVP path is landed (`config -> IR -> graph` compile with structured diagnostics surfaced in UI and export metadata).
2. Pose target authoring no longer creates ghost variables (`Q0.2` landed).
3. Pose "What I Drive" controls and pose duplication UX are landed.
4. Stage 0 (`A0.1`-`A0.3`) is complete; next priority is Stage 1 (`B1.1`).
5. Lint remains warning-only due to unused symbols in `src/components/panels/VariablesPanel.tsx`.

## Backlog Status Board

| ID   | Status   | Priority | Notes                                                                                                    |
| ---- | -------- | -------- | -------------------------------------------------------------------------------------------------------- |
| A0.1 | done     | P0       | Canonical pose-weight paths, Inputs sync, and stale/duplicate cleanup landed with regression tests.      |
| A0.2 | done     | P0       | Import now provisions autorig targets before retargeting and emits created/rebound/fallback diagnostics. |
| A0.3 | done     | P0       | MVP pose lifecycle smoke tests landed, including ghost-target guard coverage.                            |
| B1.1 | planned  | P1       | IR-first store migration is next after Stage 0.                                                          |
| B1.2 | planned  | P1       | Neutral mode authoring/round-trip depends on IR-first store.                                             |
| B1.3 | planned  | P1       | Ghost-signal boundary contract enforcement pending.                                                      |
| B1.4 | planned  | P1       | Import feedback UX unification pending.                                                                  |
| C2.1 | planned  | P1       | Multi-stage blend IR primitives pending foundation completion.                                           |
| C2.2 | planned  | P1       | Multi-stage authoring UI follows C2.1.                                                                   |
| C2.3 | planned  | P1       | Golden fixture suite follows C2.1/C2.2.                                                                  |
| D3.1 | planned  | P2       | Autorig abstraction cleanup remains a UX objective.                                                      |
| D3.2 | planned  | P2       | Inputs pane IA for stage/group controls pending stage model.                                             |
| D3.3 | planned  | P2       | Lint warning cleanup is scoped but not yet scheduled.                                                    |
| D3.4 | planned  | P2       | Empirical performance baseline capture pending.                                                          |
| E4.1 | deferred | P3       | Per-channel override map intentionally deferred.                                                         |
| E4.2 | deferred | P3       | Priority resolution semantics intentionally deferred.                                                    |
| E4.3 | deferred | P3       | Overlap-bias heuristic design intentionally deferred.                                                    |

## Validation Gate Status

### Typecheck

- Status: `done`
- Latest evidence:
  - `2026-02-19 04:00Z` — `pnpm --filter vizij-authoring run validate` -> pass (`typecheck` phase exit 0).

### Lint

- Status: `done` (warning-only caveat)
- Latest evidence:
  - `2026-02-19 04:00Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` phase exit 0; 7 warnings in `VariablesPanel.tsx`, 0 errors).

### Test

- Status: `done`
- Latest evidence:
  - `2026-02-19 04:00Z` — `pnpm --filter vizij-authoring run validate` -> pass (`vitest` run; 66 files / 345 tests passed).

## Active Risks and Mitigations

1. Risk: Multi-group overlap behavior can skew with additive/average policies when memberships are uneven.
   - Mitigation: keep diagnostic warnings now; address policy design in deferred block `E4.*`.

## Recently Completed Highlights

- `Q0.2` canonical pose-target mapping fix.
- `A0.1` canonical pose-weight input synchronization + stale/duplicate cleanup + provider regression tests.
- `A0.2` import retarget sequencing hardening with autorig pre-provisioning and created/rebound/fallback diagnostics.
- `A0.3` MVP pose authoring smoke coverage for lifecycle + export guard paths.
- `Q2.1` My Drivers UX overhaul.
- Pose IR diagnostics plumbing (`IR2`) and export embedding (`IR3`).
