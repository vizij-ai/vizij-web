# Vizij Authoring Tracker

Last updated: 2026-03-02

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
9. Pose Group + Stage Inspector sprint has started with commit-sized `S0`-`S7` execution tracking in `plans/POSE_GROUP_STAGE_INSPECTOR_SPRINT_PLAN.md` (scope: scoped neutral authoring + stage inspector + composition-output analysis).
10. Reference-face reliability tranche `R6.1`-`R6.4` is complete (path-first staging, legacy pose-control bridge compatibility, export guardrails, and reset normalization); `R6.5` remains open for perf thresholds + session audit logging.
11. Animation/orchestrator unification lane (`G7.*`) is implemented end-to-end on the authoring/runtime path (runtime-authoritative transport, deterministic IR/compiler, interpolation, and export/import round-trip).
12. Workspace clarity lane (`U8.*`) is planned, including motion graph sidebar migration and graph-first workspace reclaim.
13. Sample asset standardization lane (`V9.*`) is planned for Quori/Hugo/Toasty + Vizij standard-rig coverage.
14. Speech/viseme extension lane (`P10.*`, Amazon Polly) is captured as the top post-core backlog lane.
15. Stage-order waiver is active: Stage 6/7/8 planning/execution opened before full Stage 5 completion due current product priority on animation/workspace lanes; import reliability lane (`F5.*`) remains active in parallel.

## Backlog Status Board

| ID    | Status  | Priority | Notes                                                                                                                                                                   |
| ----- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A0.1  | done    | P0       | Canonical pose-weight paths, Inputs sync, and stale/duplicate cleanup landed with regression tests.                                                                     |
| A0.2  | done    | P0       | Import now provisions propsrig targets before retargeting and emits created/rebound/fallback diagnostics.                                                               |
| A0.3  | done    | P0       | MVP pose lifecycle smoke tests landed, including ghost-target guard coverage.                                                                                           |
| A0.4  | done    | P0       | Pose graph outputs now target `rig/<face>/pose/control/<inputId>`; runtime/input-pane guardrails and regression tests are landed.                                       |
| A0.5  | done    | P0       | Rig graph now computes `effective_i = clamp(compose(direct_i, pose_i), min_i, max_i)` for composed channels with additive default and average support.                  |
| A0.6  | done    | P0       | Per-channel compose mode authoring (`add` default, `average`) is implemented across UI, config, IR projection, and compiler wiring.                                     |
| A0.7  | done    | P0       | Inputs pane filters internal pose-control paths and regression contracts cover inspector/input sync + compose-mode routing into rig compile.                            |
| B1.1  | done    | P1       | Store mutations now project through pose IR and export/runtime pose config resolves from IR projection.                                                                 |
| B1.2  | done    | P1       | Neutral strategy is modeled in config/IR/store with deterministic compiler behavior and fallback diagnostics.                                                           |
| B1.3  | done    | P1       | IR prunes synthetic ghost channel IDs and compiler guards authored-input/signal boundary contracts.                                                                     |
| B1.4  | done    | P1       | Import feedback now uses unified structured diagnostics across config/IR/graph paths with actionable failures.                                                          |
| C2.1  | done    | P1       | IR/config/compiler now support deterministic ordered blend stages with fallback compatibility and diagnostics.                                                          |
| C2.2  | done    | P1       | Pose Groups surface now authors stage chains (create/reorder/edit sources/mode) with topology guards.                                                                   |
| C2.3  | done    | P1       | Golden topology fixture suite landed with deterministic snapshot/hash checks + neutral fallback diagnostics.                                                            |
| D3.1  | done    | P2       | Inspector chain defaults now abstract propsrig internals with explicit show/hide toggle for advanced access.                                                            |
| D3.2  | done    | P2       | Inputs pane IA now separates editable pose-weight controls from derived group/stage outputs with provenance and read-only derived rows (validated `2026-02-19 06:12Z`). |
| D3.3  | done    | P2       | Removed warning debt in `VariablesPanel`; lint now runs clean for `vizij-authoring`.                                                                                    |
| D3.4  | done    | P2       | Dense Inputs-pane baseline landed via `perf:inputs-baseline`; baseline recorded on `2026-02-19 06:11Z` in `docs/perf/inputs-pane-baseline-2026-02-19.md`.               |
| E4.1  | done    | P3       | Per-channel cross-group override map landed across config/IR contracts with deterministic normalization + diagnostics, including store-projection retention.            |
| E4.2  | done    | P3       | Priority override mode landed with deterministic ordering/tie-break semantics, compiler topology realization, and explanatory diagnostics.                              |
| E4.3  | done    | P3       | Design pack delivered in `docs/notes/pose-rig-overlap-heuristics-2026-02-19.md` with scenario outputs, policy tradeoffs, and follow-on implementation scope.            |
| S0    | done    | P1       | Scoped-neutral sprint contract lock landed across docs (`UI_DESIGN.md`, `ARCHITECTURE.md`, explainer, docs index) with active plan/tracker linkage.                     |
| S1    | done    | P1       | Scoped-neutral config/IR contracts landed for groups/stages (`inherit`, `pose-reference`, `direct-values`) with deterministic normalize/round-trip and diagnostics.     |
| S2    | done    | P1       | Stage/group scoped-neutral store/hook APIs landed with projection-safe state retention and targeted regression coverage.                                                |
| S3    | done    | P1       | Compiler now resolves scoped neutral precedence by context (`stage > group > global > default`) with scoped-neutral coverage diagnostics.                               |
| S4    | done    | P2       | Stage selection + inspector routing foundation landed with stale-selection reconciliation and stage inspect entrypoint tests.                                           |
| S5    | done    | P2       | Group inspector now authors scoped neutral sources and shows live composition-output analysis.                                                                          |
| S6    | done    | P2       | Stage inspector now supports source/mode/neutral authoring with live stage composition-output analysis.                                                                 |
| S7    | done    | P1       | Scoped-neutral regression matrix, validate/prep evidence, and sprint tracker closeout are complete.                                                                     |
| R6.1  | done    | P0       | Reference/shared panel actions now stage by canonical/runtime paths first; pose-weight actions route through canonical pose channels.                                   |
| R6.2  | done    | P0       | Runtime pose-control bridge supports exact and `direct_` alias resolution for legacy rig channels (including Quori brow channels).                                      |
| R6.3  | done    | P0       | Export/compiler wiring now includes pose compose targets and blocks fallback bundled exports lacking `RobotData`.                                                       |
| R6.4  | done    | P0       | Reset logic now clears override-enabled state and reapplies deterministic defaults across reference drivers + poses.                                                    |
| R6.5  | planned | P1       | Publish dual-face perf thresholds and add structured copy-session audit summaries for workflow signoff.                                                                 |
| G7.1  | done    | P0       | Contract lock landed with canonical authored clip identity/metadata and explicit runtime-authoritative transport behavior in authoring/runtime seams.                   |
| G7.2  | done    | P0       | Timeline controls now route through runtime transport (`play/pause/seek/stop/loop/speed/step`) and local RAF authority is removed from the panel.                       |
| G7.3  | done    | P0       | Deterministic `AnimationClipIR` compile path + runtime interpolation (`linear`/`step`/`cubic`) is implemented and validated with deterministic tests.                   |
| G7.4  | done    | P0       | Authored clip round-trip through `animations[]` is landed with canonical-id replacement and hard-error conflict handling for non-authored canonical collisions.         |
| G7.5  | done    | P1       | Runtime transport bridge is mounted in runtime viewer scope so timeline transport state/playback remains panel-visibility independent.                                  |
| G7.6  | done    | P1       | Deterministic timeline IDs/order + deterministic compile snapshots are in place; lock semantics for tracked channels are enforced during active transport.              |
| U8.1  | planned | P0       | Move motion graph panes into sidebar surfaces with consistent authoring-panel semantics.                                                                                |
| U8.2  | planned | P0       | Reclaim graph workspace area where reference-face pane currently sits in graph-focused mode.                                                                            |
| U8.3  | planned | P1       | Execute cross-pane visual consistency pass for dense authoring flows.                                                                                                   |
| U8.4  | planned | P1       | Upgrade pose group/blend visualization and grouping readability.                                                                                                        |
| V9.1  | planned | P0       | Finalize canonical sample GLBs for Quori/Hugo/Toasty.                                                                                                                   |
| V9.2  | planned | P0       | Define and validate Vizij standard-rig coverage for sample assets.                                                                                                      |
| V9.3  | planned | P1       | Add sample fixture matrix + CI gates for sample import/playback/export contracts.                                                                                       |
| P10.1 | planned | P1       | Add speech provider abstraction and Amazon Polly adapter.                                                                                                               |
| P10.2 | planned | P1       | Map viseme events to rig channels through orchestrator input staging.                                                                                                   |
| P10.3 | planned | P2       | Add speech/viseme timing diagnostics and quality gates.                                                                                                                 |

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
  - `2026-03-01` — `pnpm run validate:all` -> pass (`typecheck:all` exit 0 across repo workspaces).

### Lint

- Status: `done`
- Latest evidence:
  - `2026-03-01` — `pnpm run validate:all` -> pass (`lint:all` exit 0).

### Test

- Status: `done`
- Latest evidence:
  - `2026-03-01` — `pnpm run validate:all` -> pass (`test:all` exit 0).

## Active Risks and Mitigations

1. Risk: Priority semantics are now implemented, but weighted-average activity-shaping heuristics remain policy guidance only.
   - Mitigation: keep `E4.3` scenario pack as reference for future heuristic rollout and guard with topology/diagnostic regression tests.
2. Risk: Import behavior contracts remain partially implicit in code paths, increasing regression risk across compatibility variants.
   - Mitigation: execute `F5.1`-`F5.8` in order, with linked quality gates (`QL0.1`, `QL0.2`, `QL0.3`, `QL2.4`, `QL2.5`) and fixture-matrix CI coverage.
3. Risk: Compose policy remains MVP-level (`add`/`average`) and may not cover future weighting/prioritization needs.
   - Mitigation: keep future-policy expansion tracked in roadmap horizon and gate rollout with deterministic topology/tests.
4. Risk: Reference-face workflow now passes functional correctness checks, but dual-face perf gates and session-level audit summaries are not yet formalized.
   - Mitigation: close `R6.5` with reproducible threshold docs and copy-session summary emission before declaring final workflow signoff.
5. Risk: Animation playback remains split until `G7.2` cutover lands, increasing drift risk between preview and exported behavior.
   - Mitigation: prioritize `G7.1`/`G7.2` first, gate with orchestrator-authority contract tests and round-trip checks.
6. Risk: Workspace layout migration could regress reference-face and graph editing ergonomics.
   - Mitigation: execute `U8.*` with explicit mode contracts and targeted UX regression tests.

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
- `R6.1` path-first reference/shared staging and canonical pose-weight routing in Variables/Poses surfaces.
- `R6.2` runtime-react pose-control bridge compatibility for legacy/direct-prefixed channels.
- `R6.3` export/compiler hardening for pose compose wiring and fallback bundled-export guardrails.
- `R6.4` reset/default normalization across reference drivers and poses.
- `Q2.1` My Drivers UX overhaul.
- Pose IR diagnostics plumbing (`IR2`) and export embedding (`IR3`).
