# Pose and Pose Group IR Design

Last updated: 2026-02-18  
Owner: Vizij Authoring  
Status: draft design document (current-state + target-state)

## 1) Goal

Define a clear authoring and compile contract for:

1. Pose definition (author intent).
2. Pose-group blend (driven by pose weights).
3. Cross-group blend (blend-style composition of group outputs, policy-driven).
4. Neutral behavior (default face baseline vs explicit neutral).
5. IR-to-graph compilation that preserves user mental model.

This document captures what exists today and what must change to reach the target behavior.

## 2) User Mental Model (Target Product Semantics)

1. A pose is authored intent: a set of channel targets at full activation.
2. A pose group blends member poses using pose input weights.
3. Multiple pose groups may overlap on channels; each group emits a per-channel output.
4. Cross-group blend composes those group outputs using the same family of blend semantics as group blend, but with policy-defined weighting.
   1. V1 uses global cross-group blend policy (`add` or `average`) without per-channel overrides.
   2. Priority and per-channel override behavior are deferred until a later design pass with examples.
5. Neutral defines baseline output when no pose is active:
   1. face default values, or
   2. an explicitly authored neutral profile.
6. Users should only need to author poses/groups/blend settings; compiler/runtime should handle graph topology.
7. Model should generalize to multi-stage blending with `n` layers, not only one cross-group merge stage.

## 3) Current State (As Implemented)

### 3.1 Data model

Current config type is `PoseRigConfigFile` in:

- `apps/vizij-authoring/src/poseRig/types.ts`

It already includes:

1. `poseGroups` with per-group `blendMode`.
2. `crossGroupBlendMode`.
3. `neutralInputs`.
4. Pose membership via canonical `groupIds` (with legacy `group`/`groupId` compatibility fields).

### 3.2 Compile model

Current build path is config-to-IR-to-GraphSpec:

1. `PoseGraphService.buildSpec(...)` first normalizes to IR via `PoseIrService.fromConfig(...)` in `apps/vizij-authoring/src/poseRig/services/poseGraphService.ts`.
2. `PoseGraphService.buildSpecFromIr(...)` compiles IR via `buildPoseGraphSpecFromIr(...)` in `apps/vizij-authoring/src/poseRig/graphBuilder.ts`.

Current compiler behavior per channel:

1. Resolve neutral value.
2. Build per-group weighted contribution layer from pose weights.
3. Apply per-group blend mode (`average` overlay or `additive`).
4. Compose multiple group layers using `crossGroupBlendMode` (`additive` or `average`).
5. Emit output to rig typed path.

### 3.3 Current compiler topology for multiple pose groups

For a shared channel targeted by more than one group, `buildPoseGraphSpec(...)` currently builds:

1. Per group:
   1. pose-weight `join` node,
   2. delta constant + mask constant,
   3. `weightedsumvector`,
   4. group blend node (`add` or `blendweightedaverageoverlay`),
   5. group delta-from-neutral `subtract`.
2. Cross-group composition:
   1. `additive`: chain of `add` over group deltas, then one final `add` with neutral.
   2. `average`: joins group deltas + group activity-derived weights into `weightedsumvector`, then `blendweightedaverageoverlay` with neutral as base.
3. Output:
   1. one `output` node bound to the canonical rig typed path.

### 3.4 Neutral behavior

Neutral is currently sourced from `neutralInputs` with fallback to standard input defaults. Pose deltas are computed relative to neutral during compile.

### 3.5 What works today

1. First-class pose groups in config.
2. Two-stage blending exists in current GraphSpec compiler.
3. Deterministic membership normalization and tests around group id ordering.
4. Cross-group blending exists for shared channel targets.

### 3.6 Gaps and intentional deferrals

1. Store/edit flows are still config-centric; IR is currently derived in most edit paths rather than directly authored as primary state.
2. V1 intentionally uses simple cross-group operation selection (`additive`/`average`) while priority/override policy is deferred.
3. Per-channel override and priority semantics are intentionally deferred pending additional design/examples.
4. Guardrail `Q0.2` is still open:
   pose targets in IR must always reference canonical existing input ids; synthetic intermediate nodes may exist only in compiled graph topology.
5. Diagnostics are still stronger at GraphSpec/runtime parity than at user-intent IR validation.

### 3.7 Runtime graph packaging today

Authoring/runtime currently treats rig and pose as separate graph payloads:

1. Rig graph is sent as `rig` payload.
2. Pose graph is sent as `pose.graph` payload.
3. Pose config is sent as `pose.config`.
4. Runtime registers these together in one bundle update, but they are still distinct graph specs (not one merged monolithic graph).

## 4) Target IR Contract

### 4.1 Core entities

1. `PoseDefinition`
   1. `id`, `name`, metadata.
   2. `targets: Record<ChannelId, number>` values at full activation.
2. `PoseGroupDefinition`
   1. `id`, `name`, `path`.
   2. `poseIds: string[]`.
   3. `intraGroupBlendMode`.
3. `PoseNeutralDefinition`
   1. `mode: "face-default" | "explicit"`.
   2. `values: Record<ChannelId, number>` (when explicit).
4. `PoseCrossGroupBlendPolicy`
   1. v1 default operation (`add` or `average`).
   2. future extension: per-channel override map.
   3. future extension: priority map and tie-break rules for overlapping groups.
5. `PoseGraphIntentSummary`
   1. affected channels.
   2. membership map.
   3. diagnostics/issues.

### 4.2 Layer semantics

For each channel `c`:

1. Pose values are authored target values, not direct writes.
2. Group local output `G[g,c]` is computed from member pose weights and intra-group blend mode.
3. Final pose-layer output `L[c]` is computed by applying cross-group operation over all `G[g,c]` that target `c`.
4. `L[c]` is bound to canonical rig input channel `c`; downstream rig graph continues as usual.
5. IR does not define fake/ghost input variables.
   1. Compiler may emit synthetic merge nodes/signals in graph topology.
   2. Those synthetic signals are implementation detail and can appear in binding expressions, not as authored inputs.

### 4.3 Neutral semantics

1. Neutral is always defined before blending.
2. If no pose in any group contributes to channel `c`, output is neutral `N[c]`.
3. Group-level and cross-group operations are defined relative to neutral to avoid drift and to preserve zero-input determinism.

## 5) Proposed Blend Semantics (Compiler)

### 5.1 Intra-group blend (weight-driven)

Use current behavior as baseline:

1. Pose weights are runtime inputs.
2. Per-group per-channel output is derived from weighted contributions + neutral.
3. Blend mode remains `average` or `additive` at group level.

### 5.2 Cross-group blend (operation-driven, no direct group sliders)

Define a blend operation over group outputs for each channel:

1. `add`:
   1. combine deltas around neutral (`N + sum(G[g]-N)`).
2. `average`:
   1. activity-weighted average of contributing group outputs (weights derived from group activity in the compiled topology).
3. deferred extension (`priority` + per-channel overrides):
   1. intentionally postponed until policy examples and tie-break semantics are defined.

### 5.3 Multi-stage blending (`n` layers)

Target architecture should support chained layer composition, not only one cross-group stage:

1. stage-local group blend,
2. intermediate aggregate blend,
3. final aggregate blend,
4. optional additional layers as needed (`n`-stage pipeline).

## 6) IR to Graph Compilation Pipeline (Target)

1. Parse and normalize pose IR entities.
2. Resolve canonical channel ids from rig/autorig interface map.
3. Validate hard constraints (including `Q0.2` canonical input-id targeting in IR).
4. Build per-group blend subgraphs per channel.
5. Build cross-group compose nodes per channel from selected policy.
   1. v1 policy is global for the graph/layer (`add` or `average`).
6. Emit pose-layer outputs bound to canonical rig input typed paths.
7. Materialize synthetic merge signals only in compiled graph topology (never as authored input entities).
8. Compile to runtime `GraphSpec`.
9. Emit:
   1. `spec`,
   2. pose IR payload,
   3. machine-readable diagnostics,
   4. summary for inspector/export.

## 7) Validation and Diagnostics Contract

### 7.1 Errors (block compile/apply/export)

1. Pose target references unknown channel id.
2. IR pose target assignment tries to create implicit input (`Q0.2` violation).
3. Cross-group policy undefined for channel.
4. Deferred policy fields are provided in a v1 payload without feature flag enablement.

### 7.2 Warnings (allow with explicit acknowledgement)

1. Channel has no explicit neutral and relies on fallback defaults.
2. Group has zero effective contributors for all channels.
3. Legacy group metadata migrated heuristically.
4. Deferred policy fields are ignored in v1 compile mode.

## 8) Migration from Current Model

1. Keep reading existing `PoseRigConfigFile` schema.
2. Materialize explicit IR view from existing config fields.
3. Compile IR to GraphSpec for runtime/export use.
4. Preserve optional schema slots for future priority/override policy without enabling behavior in v1.
5. Gradually move authoring/editing surfaces to IR-native edits; legacy parity checks can remain as optional diagnostics during transition.

## 9) Delivery Plan to Reach Target

### 9.1 First milestone (IR foundation)

1. Implement first-class pose IR model + serialization (authoring source of truth).
2. Implement IR compiler for:
   1. intra-group blend,
   2. cross-group policy blend (`add`, `average`),
   3. multi-stage layering primitives (`n`-stage capable topology).
3. Implement authoring UI for direct IR editing:
   1. group definitions/membership,
   2. cross-group policy (`add` or `average`),
   3. neutral strategy and diagnostics.
4. Treat canonical-id targeting and synthetic-node boundaries (`Q0.2` concerns) as built-in compiler/UI invariants, not a separate patch stream.

### 9.2 Second milestone (deferred policy extensions)

1. Design per-channel override and priority semantics with concrete examples.
2. Define tie-break and activity-interaction rules.
3. Add focused test suites for policy edge-cases and layered blend behavior.

### 9.3 Follow-on (UX and runtime integration)

1. Surface group-local and cross-group operation state directly in authoring UI.
2. Surface per-channel compiled topology and diagnostics in inspector/export report.
3. Keep runtime/export integration aligned to the new IR compiler outputs; legacy parity is not a gate for this milestone.

## 10) Acceptance Criteria for This Design Goal

1. User can author poses as channel targets without implicit input creation.
2. User can author per-group blend behavior and cross-group blend operation.
3. Neutral behavior is deterministic and visible in authoring diagnostics.
4. Compiler emits equivalent runtime behavior from authored IR.
5. Export contains enough artifacts (`IR + GraphSpec + diagnostics`) for behavior auditing and debugging.
