# Vizij Authoring Architecture

Last updated: 2026-02-19
Audience: engineers working on `apps/vizij-authoring`

This document defines system boundaries, canonical data contracts, and compile/runtime invariants.

## Source Hierarchy

1. Program objective: `plans/GOAL.md`
2. Delivery order: `plans/ROADMAP.md`
3. Work items: `plans/BACKLOG.md`
4. Execution state and evidence: `plans/TRACKER.md`
5. UI behavior contract: `UI_DESIGN.md`
6. Layer-level contract details: `Authoring_Blueprint.md`

## Core Intent

`vizij-authoring` must stay runtime-truthful:

1. authored state,
2. compiled graph state,
3. runtime-applied values

must remain semantically aligned.

## Layer Model

1. Animatable layer: render-facing scene leaves.
2. Autorig layer: low-level generated channels (`/autorig/...`) that write to animatables.
3. Abstract rig layer: authored controls and bindings.
4. Pose layer: semantic pose targets and group/stage composition.
5. Binding layer: directed edges between authoring controls.

Boundary invariant:

- Abstract rig controls must not directly write animatable leaves.
- Scene writes are mediated through autorig channels.

## Pose IR and Compile Pipeline

Current compile path:

1. Authoring store mutations land in pose IR first; config/UI views are projected from IR (`PoseIrService`).
2. IR compiles into pose graph spec (`buildPoseGraphSpecFromIr`).
3. Compiler resolves canonical target channels, neutral baseline, group contributions, and cross-group composition.
4. Compiler emits output nodes bound to canonical rig input paths.

Composition semantics currently supported:

1. Intra-group: `average` or `additive` using pose input weights.
2. Cross-group: `average` or `additive` composition over group outputs.
3. Neutral fallback: explicit neutral values or standard-input defaults.

Deferred semantics (not MVP):

1. Per-channel override policies.
2. Priority/tie-break rules for overlaps.
3. Activity-weighting skew mitigation policy lock-in.

## Runtime Graph Packaging

Authoring currently produces a single runtime bundle update that contains distinct payloads:

1. rig graph payload,
2. pose graph payload,
3. pose config metadata,
4. pose IR + diagnostics metadata (for audit/debug).

Important: rig and pose are still separate graph specs today, not one monolithic merged graph.

## Canonical Path and Identity Contracts

1. Generated low-level rig paths use `/autorig/...`.
2. Pose-weight controls use canonical per-pose paths: `rig/{face}/poses/{poseId}.weight`.
3. Pose-weight controls carry stable source IDs (`pose-weight:{poseId}`).
4. Pose target references resolve to canonical existing input IDs.
5. Ghost/intermediate blend signals are compile-time graph internals, not authored inputs.

## Diagnostics and Validation Contracts

1. Compile/import/export must emit machine-readable diagnostics for warnings/errors.
2. Unknown channels, invalid mappings, and blocked retargets are never silent.
3. Export validation checks runtime compatibility before writing assets.
4. Import normalization and retargeting must be deterministic and idempotent.

## Performance and Reactivity Constraints

1. Heavy UI surfaces avoid broad store subscriptions.
2. Hidden surfaces avoid expensive tree/filter work.
3. Hot path canonical resolution uses indexed/cached lookups.
4. Input synchronization logic must avoid update loops/churn.

## Change Discipline

1. If user-visible behavior changes, update `UI_DESIGN.md` first (or in the same change).
2. If sequencing or priorities change, update `ROADMAP.md` and `BACKLOG.md` together.
3. If validation status changes, record it in `TRACKER.md` with command evidence.
