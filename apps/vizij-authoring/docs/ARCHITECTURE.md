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

1. Authoring store mutations (poses, groups, and blend stages) land in pose IR first; config/UI views are projected from IR (`PoseIrService`).
2. IR compiles into pose graph spec (`buildPoseGraphSpecFromIr`).
3. Compiler resolves canonical target channels, neutral baseline, group contributions, and cross-group composition.
4. Compiler emits pose graph output nodes to internal pose-control rig input paths: `rig/<face>/pose/control/<inputId>`.

Composition semantics currently supported:

1. Intra-group: `average` or `additive` using pose input weights.
2. Cross-group compatibility mode: `average` or `additive` composition over group outputs when no explicit blend stages are authored.
3. Ordered blend stages: explicit `blendStages[]` chain with deterministic `group`/`stage` sources and per-stage `average`/`add` operation.
4. Per-channel cross-group overrides: optional channel map (`crossGroupChannelOverrides` / `crossGroupPolicy.overrides`) supporting `average`, `additive`, and `priority`.
5. Priority semantics:
   - deterministic ordering via explicit `priorityOrder`,
   - deterministic tie-break via `group-order` or `group-id`,
   - compiler realization via priority overlay chains using existing graph node types.
6. Neutral strategy:
   - `explicit`: authored neutral values with per-channel fallback to standard-input defaults when missing.
   - `face-default`: compile directly from standard-input defaults.

Direct/pose channel composition contract (execution target):

1. Pose authoring targets canonical direct rig controls by `inputId` in IR.
2. The pose graph writes only to internal pose-control paths (`rig/<face>/pose/control/<inputId>`).
3. The rig graph owns final per-channel composition:
   - `effective_i = clamp(compose(direct_i, pose_i), min_i, max_i)`.
4. MVP compose modes:
   - `add` (default),
   - `average`.
5. Internal pose-control paths are runtime inputs, but they are graph-internal implementation details from the default authoring UX perspective.

Remaining deferred semantics:

1. Activity-weighting skew mitigation policy lock-in (design examples captured in `docs/notes/pose-rig-overlap-heuristics-2026-02-19.md`).
2. Weighted and priority-based direct/pose composition policy extensions.
3. Potential monolithic-graph refactor that fuses rig + pose graphs once contracts are stable.

## Runtime Graph Packaging

Authoring currently produces a single runtime bundle update that contains distinct payloads:

1. rig graph payload,
2. pose graph payload,
3. pose config metadata,
4. pose IR + diagnostics metadata (for audit/debug).

Important: rig and pose are still separate graph specs today, not one monolithic merged graph.

Execution note:

1. Separate-graph packaging is intentional for MVP delivery speed and compatibility.
2. Rig graph composition nodes consume both direct rig-control and pose-control signals to produce final effective values per channel.

## Canonical Path and Identity Contracts

1. Generated low-level rig paths use `/autorig/...`.
2. Pose-weight controls use canonical per-pose paths: `rig/{face}/poses/{poseId}.weight`.
3. Pose-weight controls carry stable source IDs (`pose-weight:{poseId}`).
4. Pose target references resolve to canonical existing input IDs.
5. Pose graph outputs use internal paths `rig/{face}/pose/control/{inputId}`.
6. Ghost/intermediate blend signals are compile-time graph internals, not authored inputs.
7. Inputs-pane IA distinguishes authored controls (`rig-input`, `pose-weight`) from derived composition outputs (`group-output`, `stage-output`).
8. Internal pose-control paths are not shown as user-editable Inputs rows in default UX.
9. Derived composition outputs use deterministic synthetic paths (`/pose/groups/{groupId}.output`, `/pose/stages/{stageId}.output`) for visibility and provenance.
10. Derived group/stage outputs are read-only/non-selectable in Inputs; edits flow through pose/pose-group/stage authoring surfaces.

## Diagnostics and Validation Contracts

1. Compile/import/export must emit machine-readable diagnostics for warnings/errors.
2. Pose config, pose IR, and pose graph imports share one structured diagnostics surface in authoring UI.
3. Unknown channels, invalid mappings, and blocked retargets are never silent.
4. Export validation checks runtime compatibility before writing assets.
5. Import normalization and retargeting must be deterministic and idempotent.

## Performance and Reactivity Constraints

1. Heavy UI surfaces avoid broad store subscriptions.
2. Hidden surfaces avoid expensive tree/filter work.
3. Hot path canonical resolution uses indexed/cached lookups.
4. Input synchronization logic must avoid update loops/churn.

## Change Discipline

1. If user-visible behavior changes, update `UI_DESIGN.md` first (or in the same change).
2. If sequencing or priorities change, update `ROADMAP.md` and `BACKLOG.md` together.
3. If validation status changes, record it in `TRACKER.md` with command evidence.
