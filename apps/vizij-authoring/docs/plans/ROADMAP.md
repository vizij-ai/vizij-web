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

- `in_progress`

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

- `planned`

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

- `planned`

## Stage 3 — UX Simplification and Operational Hardening

Objective:

- Reduce cognitive load in day-to-day authoring and harden maintainability/performance quality gates.

Backlog scope:

- `D3.1`, `D3.2`, `D3.3`, `D3.4`

Exit gate:

1. Default UX abstracts low-level autorig internals.
2. Inputs pane scales to stage/group control complexity.
3. Lint warning baseline is reduced or explicitly tracked.
4. Performance claims are backed by repeatable measurements.

Current status:

- `planned`

## Stage 4 — Deferred Policy Semantics

Objective:

- Add advanced composition controls after core IR and stage model are stable.

Backlog scope:

- `E4.1`, `E4.2`, `E4.3`

Exit gate:

1. Per-channel override and priority semantics are specified and implemented.
2. Overlap bias mitigation behavior is example-driven and test-covered.

Current status:

- `deferred` (explicitly not required for MVP)
