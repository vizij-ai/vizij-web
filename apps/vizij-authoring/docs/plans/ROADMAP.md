# Vizij Authoring Roadmap

Last updated: 2026-02-19

This file defines execution order and stage gates. Implementation detail lives in `plans/BACKLOG.md`.

## Stage Ordering Contract

1. Earlier stage gates must be met before opening the next stage unless explicitly waived in `plans/TRACKER.md`.
2. Items inside a stage execute in backlog dependency order.
3. `P0` release blockers cannot be deferred without an explicit waiver.

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

## Future Architecture Horizon (Post-Stage 5)

1. Evaluate monolithic graph refactor once pose-control composition and import contracts are stable.
2. Expand channel composition policy beyond MVP (`add`/`average`) to include optional weights and priority-based blending.
