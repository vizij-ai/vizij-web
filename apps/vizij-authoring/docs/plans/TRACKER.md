# Vizij Authoring Tracker

Last updated: 2026-02-19

Status legend: `done`, `in_progress`, `planned`, `blocked`, `deferred`

## Snapshot

1. Pose IR MVP path is landed (`config -> IR -> graph` compile with structured diagnostics surfaced in UI and export metadata).
2. Pose target authoring no longer creates ghost variables (`Q0.2` landed).
3. Pose "What I Drive" controls and pose duplication UX are landed.
4. Stage 0 (`A0.1`-`A0.3`), Stage 1 (`B1.1`-`B1.4`), and Stage 2 (`C2.1`-`C2.3`) are complete.
5. Stage 3 is in progress: `D3.1`, `D3.2`, and `D3.3` are complete; `D3.4` remains.

## Backlog Status Board

| ID   | Status   | Priority | Notes                                                                                                                                                                   |
| ---- | -------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0.1 | done     | P0       | Canonical pose-weight paths, Inputs sync, and stale/duplicate cleanup landed with regression tests.                                                                     |
| A0.2 | done     | P0       | Import now provisions autorig targets before retargeting and emits created/rebound/fallback diagnostics.                                                                |
| A0.3 | done     | P0       | MVP pose lifecycle smoke tests landed, including ghost-target guard coverage.                                                                                           |
| B1.1 | done     | P1       | Store mutations now project through pose IR and export/runtime pose config resolves from IR projection.                                                                 |
| B1.2 | done     | P1       | Neutral strategy is modeled in config/IR/store with deterministic compiler behavior and fallback diagnostics.                                                           |
| B1.3 | done     | P1       | IR prunes synthetic ghost channel IDs and compiler guards authored-input/signal boundary contracts.                                                                     |
| B1.4 | done     | P1       | Import feedback now uses unified structured diagnostics across config/IR/graph paths with actionable failures.                                                          |
| C2.1 | done     | P1       | IR/config/compiler now support deterministic ordered blend stages with fallback compatibility and diagnostics.                                                          |
| C2.2 | done     | P1       | Pose Groups surface now authors stage chains (create/reorder/edit sources/mode) with topology guards.                                                                   |
| C2.3 | done     | P1       | Golden topology fixture suite landed with deterministic snapshot/hash checks + neutral fallback diagnostics.                                                            |
| D3.1 | done     | P2       | Inspector chain defaults now abstract autorig internals with explicit show/hide toggle for advanced access.                                                             |
| D3.2 | done     | P2       | Inputs pane IA now separates editable pose-weight controls from derived group/stage outputs with provenance and read-only derived rows (validated `2026-02-19 21:55Z`). |
| D3.3 | done     | P2       | Removed warning debt in `VariablesPanel`; lint now runs clean for `vizij-authoring`.                                                                                    |
| D3.4 | planned  | P2       | Empirical performance baseline capture pending.                                                                                                                         |
| E4.1 | deferred | P3       | Per-channel override map intentionally deferred.                                                                                                                        |
| E4.2 | deferred | P3       | Priority resolution semantics intentionally deferred.                                                                                                                   |
| E4.3 | deferred | P3       | Overlap-bias heuristic design intentionally deferred.                                                                                                                   |

## Validation Gate Status

### Typecheck

- Status: `done`
- Latest evidence:
  - `2026-02-19 21:55Z` — `pnpm --filter vizij-authoring run validate` -> pass (`typecheck` phase exit 0).

### Lint

- Status: `done`
- Latest evidence:
  - `2026-02-19 21:55Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` phase exit 0; 0 warnings, 0 errors).

### Test

- Status: `done`
- Latest evidence:
  - `2026-02-19 21:55Z` — `pnpm --filter vizij-authoring run validate` -> pass (`vitest` run; 67 files / 378 tests passed).

## Active Risks and Mitigations

1. Risk: Multi-group overlap behavior can skew with additive/average policies when memberships are uneven.
   - Mitigation: keep diagnostic warnings now; address policy design in deferred block `E4.*`.

## Recently Completed Highlights

- `Q0.2` canonical pose-target mapping fix.
- `A0.1` canonical pose-weight input synchronization + stale/duplicate cleanup + provider regression tests.
- `A0.2` import retarget sequencing hardening with autorig pre-provisioning and created/rebound/fallback diagnostics.
- `A0.3` MVP pose authoring smoke coverage for lifecycle + export guard paths.
- `B1.1` IR-first store projection update with IR-projected pose-config export/runtime sync and regression tests.
- `B1.2` neutral-mode round-trip, compiler semantics, and implicit-fallback diagnostics.
- `B1.3` ghost-channel boundary enforcement with compiler/runtime contract guards and regression tests.
- `B1.4` unified import diagnostics across config/IR/graph with actionable failure messages.
- `C2.1` multi-stage blend IR primitives with ordered stage-chain compile, malformed-stage diagnostics, and compatibility fallback for legacy no-stage payloads.
- `C2.2` multi-stage authoring UI controls (stage CRUD/reorder/source editing) with topology blocking before apply/export.
- `C2.3` golden topology fixture suite for overlap/fallback/stage-chain scenarios with deterministic hash drift protection.
- `D3.1` autorig abstraction cleanup in default inspector chains with opt-in `Show/Hide Autorig Internals` advanced toggle.
- `D3.2` Inputs pane IA update for explicit pose-weight vs derived group/stage outputs, including provenance labeling and read-only derived controls.
- `D3.3` lint warning baseline cleanup (warning count reduced to zero).
- `Q2.1` My Drivers UX overhaul.
- Pose IR diagnostics plumbing (`IR2`) and export embedding (`IR3`).
