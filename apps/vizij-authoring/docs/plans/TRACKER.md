# Vizij Authoring Tracker

Last updated: 2026-02-19

Status legend: `done`, `in_progress`, `planned`, `blocked`, `deferred`

## Snapshot

1. Pose IR MVP path is landed (`config -> IR -> graph` compile with structured diagnostics surfaced in UI and export metadata).
2. Pose target authoring no longer creates ghost variables (`Q0.2` landed).
3. Pose "What I Drive" controls and pose duplication UX are landed.
4. Stage 0 (`A0.1`-`A0.3`), Stage 1 (`B1.1`-`B1.4`), and Stage 2 (`C2.1`-`C2.3`) are complete.
5. Stage 3 (`D3.1`-`D3.4`) is complete, including the empirical Inputs-pane performance baseline capture.
6. Stage 4 policy semantics are now complete: `E4.1` override-map contracts, `E4.2` priority compiler semantics, and `E4.3` design-pack guidance.
7. Stage `4A` pose-control composition alignment is complete (`A0.4`-`A0.7`), including rig-side effective composition, per-channel compose-mode authoring, and Inputs-pane internal-path filtering/sync contracts.
8. Import Migration Plan integration remains tracked as Block `F5.*` in `plans/BACKLOG.md` with dependency-ordered execution and quality-gate linkage (`QL0.*`, `QL2.*`).

## Backlog Status Board

| ID   | Status | Priority | Notes                                                                                                                                                                   |
| ---- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0.1 | done   | P0       | Canonical pose-weight paths, Inputs sync, and stale/duplicate cleanup landed with regression tests.                                                                     |
| A0.2 | done   | P0       | Import now provisions propsrig targets before retargeting and emits created/rebound/fallback diagnostics.                                                               |
| A0.3 | done   | P0       | MVP pose lifecycle smoke tests landed, including ghost-target guard coverage.                                                                                           |
| A0.4 | done   | P0       | Pose graph outputs now target `rig/<face>/pose/control/<inputId>`; runtime/input-pane guardrails and regression tests are landed.                                       |
| A0.5 | done   | P0       | Rig graph now computes `effective_i = clamp(compose(direct_i, pose_i), min_i, max_i)` for composed channels with additive default and average support.                  |
| A0.6 | done   | P0       | Per-channel compose mode authoring (`add` default, `average`) is implemented across UI, config, IR projection, and compiler wiring.                                     |
| A0.7 | done   | P0       | Inputs pane filters internal pose-control paths and regression contracts cover inspector/input sync + compose-mode routing into rig compile.                            |
| B1.1 | done   | P1       | Store mutations now project through pose IR and export/runtime pose config resolves from IR projection.                                                                 |
| B1.2 | done   | P1       | Neutral strategy is modeled in config/IR/store with deterministic compiler behavior and fallback diagnostics.                                                           |
| B1.3 | done   | P1       | IR prunes synthetic ghost channel IDs and compiler guards authored-input/signal boundary contracts.                                                                     |
| B1.4 | done   | P1       | Import feedback now uses unified structured diagnostics across config/IR/graph paths with actionable failures.                                                          |
| C2.1 | done   | P1       | IR/config/compiler now support deterministic ordered blend stages with fallback compatibility and diagnostics.                                                          |
| C2.2 | done   | P1       | Pose Groups surface now authors stage chains (create/reorder/edit sources/mode) with topology guards.                                                                   |
| C2.3 | done   | P1       | Golden topology fixture suite landed with deterministic snapshot/hash checks + neutral fallback diagnostics.                                                            |
| D3.1 | done   | P2       | Inspector chain defaults now abstract propsrig internals with explicit show/hide toggle for advanced access.                                                            |
| D3.2 | done   | P2       | Inputs pane IA now separates editable pose-weight controls from derived group/stage outputs with provenance and read-only derived rows (validated `2026-02-19 06:12Z`). |
| D3.3 | done   | P2       | Removed warning debt in `VariablesPanel`; lint now runs clean for `vizij-authoring`.                                                                                    |
| D3.4 | done   | P2       | Dense Inputs-pane baseline landed via `perf:inputs-baseline`; baseline recorded on `2026-02-19 06:11Z` in `docs/perf/inputs-pane-baseline-2026-02-19.md`.               |
| E4.1 | done   | P3       | Per-channel cross-group override map landed across config/IR contracts with deterministic normalization + diagnostics, including store-projection retention.            |
| E4.2 | done   | P3       | Priority override mode landed with deterministic ordering/tie-break semantics, compiler topology realization, and explanatory diagnostics.                              |
| E4.3 | done   | P3       | Design pack delivered in `docs/notes/pose-rig-overlap-heuristics-2026-02-19.md` with scenario outputs, policy tradeoffs, and follow-on implementation scope.            |

## Import Migration Integration Board

| ID   | Status  | Priority | Notes                                                                                                                                  |
| ---- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| F5.1 | planned | P0       | Define explicit import outcome-class contract (`success`, `success_with_repair`, `blocked_recoverable`, `blocked_fatal`).              |
| F5.2 | planned | P0       | Replace length-based discrepancy acceptance identity with content-hash identity and decision replay; aligned with `QL0.1` and `QL2.4`. |
| F5.3 | planned | P0       | Remove console-only import failure paths across asset/sample/bundle flows; aligned with `QL0.2`, `QL0.3`, and `QL2.5`.                 |
| F5.4 | planned | P1       | Add compatibility adapter in `@vizij/render` for metadata normalization, alias handling, and deterministic diagnostics.                |
| F5.5 | planned | P1       | Harden root detection fallback chain with recoverable blocking behavior and no pre-validation state corruption.                        |
| F5.6 | planned | P1       | Introduce deterministic persistence migration registry and user-visible storage/migration failures.                                    |
| F5.7 | planned | P1       | Complete pose remap flow with "create missing standard input" path and deterministic conflict handling.                                |
| F5.8 | planned | P1       | Land fixture matrix + CI gate + compatibility contract docs as source of truth for import behavior.                                    |

## Validation Gate Status

### Typecheck

- Status: `done`
- Latest evidence:
  - `2026-02-19 06:42Z` — `pnpm --filter vizij-authoring run validate` -> pass (`typecheck` phase exit 0).

### Lint

- Status: `done`
- Latest evidence:
  - `2026-02-19 06:42Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` phase exit 0; 0 warnings, 0 errors).

### Test

- Status: `done`
- Latest evidence:
  - `2026-02-19 06:42Z` — `pnpm --filter vizij-authoring run validate` -> pass (`vitest` run; 67 passed files + 1 skipped perf file, 389 passed tests + 1 skipped perf test).

## Active Risks and Mitigations

1. Risk: Priority semantics are now implemented, but weighted-average activity-shaping heuristics remain policy guidance only.
   - Mitigation: keep `E4.3` scenario pack as reference for future heuristic rollout and guard with topology/diagnostic regression tests.
2. Risk: Import behavior contracts remain partially implicit in code paths, increasing regression risk across compatibility variants.
   - Mitigation: execute `F5.1`-`F5.8` in order, with linked quality gates (`QL0.1`, `QL0.2`, `QL0.3`, `QL2.4`, `QL2.5`) and fixture-matrix CI coverage.
3. Risk: Compose policy remains MVP-level (`add`/`average`) and may not cover future weighting/prioritization needs.
   - Mitigation: keep future-policy expansion tracked in roadmap horizon and gate rollout with deterministic topology/tests.

## Recently Completed Highlights

- `Q0.2` canonical pose-target mapping fix.
- `A0.1` canonical pose-weight input synchronization + stale/duplicate cleanup + provider regression tests.
- `A0.2` import retarget sequencing hardening with propsrig pre-provisioning and created/rebound/fallback diagnostics.
- `A0.3` MVP pose authoring smoke coverage for lifecycle + export guard paths.
- `A0.4` pose-control path contract alignment (`rig/<face>/pose/control/<inputId>`) with runtime/input-pane internal-path guardrails.
- `A0.5` rig effective channel composition (`compose + clamp`) for deterministic direct+pose merging.
- `A0.6` per-channel compose mode authoring (`add`/`average`) across pose UI + config/IR projection.
- `A0.7` Inputs-pane internal-path filtering and end-to-end sync contracts for inspector/input coherence.
- `B1.1` IR-first store projection update with IR-projected pose-config export/runtime sync and regression tests.
- `B1.2` neutral-mode round-trip, compiler semantics, and implicit-fallback diagnostics.
- `B1.3` ghost-channel boundary enforcement with compiler/runtime contract guards and regression tests.
- `B1.4` unified import diagnostics across config/IR/graph with actionable failure messages.
- `C2.1` multi-stage blend IR primitives with ordered stage-chain compile, malformed-stage diagnostics, and compatibility fallback for legacy no-stage payloads.
- `C2.2` multi-stage authoring UI controls (stage CRUD/reorder/source editing) with topology blocking before apply/export.
- `C2.3` golden topology fixture suite for overlap/fallback/stage-chain scenarios with deterministic hash drift protection.
- `D3.1` propsrig abstraction cleanup in default inspector chains with opt-in `Show/Hide PropsRig Internals` advanced toggle.
- `D3.2` Inputs pane IA update for explicit pose-weight vs derived group/stage outputs, including provenance labeling and read-only derived controls.
- `D3.3` lint warning baseline cleanup (warning count reduced to zero).
- `D3.4` empirical dense Inputs-pane performance baseline capture with latency + React Profiler commit/duration evidence (`docs/perf/inputs-pane-baseline-2026-02-19.md`).
- `E4.1` per-channel override contracts across config/IR with deterministic normalization, invalid-entry diagnostics, and store-projection retention coverage.
- `E4.2` priority per-channel compile semantics with deterministic ordering/tie-break behavior and explanatory diagnostics for resolution changes.
- `E4.3` overlap bias/activity heuristic design pack with representative overlap scenarios and expected policy outputs (`docs/notes/pose-rig-overlap-heuristics-2026-02-19.md`).
- `Q2.1` My Drivers UX overhaul.
- Pose IR diagnostics plumbing (`IR2`) and export embedding (`IR3`).
