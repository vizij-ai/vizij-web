# Vizij Authoring Roadmap

Last updated: 2026-03-01

This file defines execution order and stage gates. Implementation detail lives in `plans/BACKLOG.md`.

## Stage Ordering Contract

1. Earlier stage gates must be met before opening the next stage unless explicitly waived in `plans/TRACKER.md`.
2. Items inside a stage execute in backlog dependency order.
3. `P0` release blockers cannot be deferred without an explicit waiver.
4. Wave-based execution lanes may run in parallel when their dependency waivers and risk controls are explicitly recorded in `plans/TRACKER.md`.

## Stage 0 — MVP Correctness Stabilization

Objective:

- Make pose authoring reliably usable end-to-end with canonical pose-weight controls and deterministic import behavior.

Backlog scope:

- `A0.1`, `A0.2`, `A0.3`

Exit gate:

1. Canonical per-pose weight controls are visible in Inputs and stay stable through pose edits.
2. Import retarget sequencing is deterministic and idempotent.
3. MVP smoke path (`create -> connect targets -> preview -> export`) has automated and manual coverage.

Current status:

- `done`

## Stage 1 — IR-First Foundation

Objective:

- Move pose authoring to IR-first state while preserving deterministic projections and transparent diagnostics.

Backlog scope:

- `B1.1`, `B1.2`, `B1.3`, `B1.4`

Exit gate:

1. Authoring writes to IR as the canonical source of truth.
2. Neutral strategy is explicitly represented and round-trips without drift.
3. Ghost/intermediate compiled signals remain graph-internal only.
4. All pose import paths use unified structured feedback.

Current status:

- `done`

## Stage 2 — Multi-Stage Blend Topology

Objective:

- Support chained pose-group composition for `n` blend stages with deterministic compile behavior.

Backlog scope:

- `C2.1`, `C2.2`, `C2.3`

Exit gate:

1. IR supports explicit stage chains.
2. UI supports stage authoring and validation.
3. Golden fixture suite protects topology determinism.

Current status:

- `done`
- Progress: `C2.1`, `C2.2`, and `C2.3` are complete.

## Stage 3 — UX Simplification and Operational Hardening

Objective:

- Reduce cognitive load in day-to-day authoring and harden maintainability/performance quality gates.

Backlog scope:

- `D3.1`, `D3.2`, `D3.3`, `D3.4`

Exit gate:

1. Default UX abstracts low-level propsrig internals.
2. Inputs pane scales to stage/group control complexity.
3. Lint warning baseline is reduced or explicitly tracked.
4. Performance claims are backed by repeatable measurements.

Current status:

- `done`
- Progress: `D3.1`, `D3.2`, `D3.3`, and `D3.4` are complete; empirical baseline evidence is recorded in `docs/perf/inputs-pane-baseline-2026-02-19.md`.

## Stage 4 — Policy Semantics

Objective:

- Add advanced composition controls after core IR and stage model are stable.

Backlog scope:

- `E4.1`, `E4.2`, `E4.3`

Exit gate:

1. Per-channel override and priority semantics are specified and implemented.
2. Overlap bias mitigation behavior is example-driven and test-covered.

Current status:

- `done`
- Progress: `E4.1` and `E4.2` are implemented (per-channel override contracts + priority compile semantics with diagnostics) and `E4.3` remains the supporting design reference (`docs/notes/pose-rig-overlap-heuristics-2026-02-19.md`).

## Stage 4A — Pose-Control Composition Alignment

Objective:

- Align pose graph output paths and rig-graph composition so direct controls and pose outputs combine deterministically per channel.

Backlog scope:

- `A0.4`, `A0.5`, `A0.6`, `A0.7`

Exit gate:

1. Pose graph outputs target `rig/<face>/pose/control/<inputId>`.
2. Rig graph computes `effective_i = clamp(compose(direct_i, pose_i), min_i, max_i)` per targeted channel.
3. Per-channel compose mode is authorable in UI with MVP modes `add` (default) and `average`.
4. Inputs pane hides internal pose-control channels while preserving normal rig/pose-weight editing.
5. Regression tests cover path contracts, compile topology, and inspector/inputs behavior.

Current status:

- `done`
- Progress: `A0.4`, `A0.5`, `A0.6`, and `A0.7` are complete; execution details and validation log are captured in `plans/POSE_CONTROL_COMPOSITION_PLAN.md`.

## Stage 4B — Reference-Face Runtime/Export Reliability

Objective:

- Ensure reference-face driver/pose staging, export bundle composition, and reset semantics are runtime-truthful and deterministic.

Backlog scope:

- `R6.1`, `R6.2`, `R6.3`, `R6.4`, `R6.5`

Exit gate:

1. Reference driver and pose controls stage to canonical/runtime-resolved paths without blind fallback writes.
2. Runtime pose-control bridging preserves compatibility for legacy/direct-prefixed channels.
3. Bundled export uses mounted runtime refs when available and blocks known-bad fallback exports lacking `RobotData`.
4. Reset behavior applies deterministic defaults across drivers and poses and clears override-enabled state.
5. Validation evidence is captured for targeted suites and full-repo `validate:all`.

Current status:

- `in_progress`
- Progress: `R6.1` through `R6.4` are complete; `R6.5` (perf thresholds + session audit trail) remains open.

## Stage 5 — Import Migration Reliability

Objective:

- Convert import reliability from implicit behavior to explicit compatibility contracts with deterministic recovery and regression coverage.

Backlog scope:

- `F5.1`, `F5.2`, `F5.3`, `F5.4`, `F5.5`, `F5.6`, `F5.7`, `F5.8`

Exit gate:

1. Import outcome classes are explicit and consistent across rig/pose paths.
2. Discrepancy identity and replay behavior are collision-safe and deterministic.
3. Asset/sample/bundle import failures are user-visible and recoverable.
4. Metadata compatibility and root fallback paths are deterministic and diagnostics-first.
5. Persistence migration is versioned, ordered, and fixture-tested.
6. Pose remap flow can create missing standard inputs without manual canonical-path typing for common unresolved cases.
7. Legacy/current/malformed fixture matrix runs in CI and compatibility docs are source of truth.

Current status:

- `planned`

## Stage 6 — Animation + Orchestrator Unification (Wave-Based)

Objective:

- Eliminate split playback paths and make animation authoring/playback orchestrator-authoritative and exportable.

Backlog scope:

- `G7.1`, `G7.2`, `G7.3`, `G7.4`, `G7.5`, `G7.6`

Execution model:

- Wave-based phases captured in `plans/ANIMATION_ORCHESTRATOR_INTEGRATION_PLAN.md` (`Wave 0` through `Wave 5`).

Exit gate:

1. Playback authority is unified under orchestrator (`setInput` + `merged_writes` contract).
2. Authored clip IR compiles deterministically and round-trips through export/import.
3. Timeline preview, runtime playback, and exported behavior remain aligned.

Current status:

- `in_progress`
- Progress: exploratory seam analysis and wave plan are complete; implementation starts at `Wave 0` contract lock + instrumentation.
- Note: this stage is opened under explicit tracker waiver before full Stage 5 completion.

## Stage 7 — Workspace Clarity + Pose Blend Visualization

Objective:

- Improve authoring clarity and density by consolidating motion graph panes into sidebar surfaces, reclaiming graph workspace, and improving pose-group/blend readability.

Backlog scope:

- `U8.1`, `U8.2`, `U8.3`, `U8.4`

Exit gate:

1. Motion graph panes are sidebar-native and graph canvas can use the reclaimed workspace area.
2. Cross-pane visual language is consistent (labels, context chips, control hierarchy).
3. Pose group and blend staging visuals are understandable in dense projects.

Current status:

- `planned`

## Stage 8 — Sample Asset + Standard-Rig Finalization

Objective:

- Finalize canonical sample GLBs and standard-rig mappings for stable demo and regression baselines.

Backlog scope:

- `V9.1`, `V9.2`, `V9.3`

Exit gate:

1. Quori/Toasty examples are finalized for import/playback/export smoke flows.
2. Standard-rig coverage is defined and verified for those examples.
3. Fixture-backed regression matrix exists for sample assets.

Current status:

- `planned`

## Stage 9 — Speech + Viseme Runtime Extension (Amazon Polly Lane)

Objective:

- Add speech playback + viseme drive through orchestrator in a provider-based architecture.

Backlog scope:

- `P10.1`, `P10.2`, `P10.3`

Exit gate:

1. Polly adapter drives viseme channels through orchestrator input staging.
2. Provider abstraction allows future non-Polly speech backends.
3. Speech/viseme sync diagnostics and tests are in place.

Current status:

- `planned`

## Future Architecture Horizon (Post-Stage 9)

1. Evaluate monolithic graph refactor once pose-control composition and import contracts are stable.
2. Expand channel composition policy beyond MVP (`add`/`average`) to include optional weights and priority-based blending.
