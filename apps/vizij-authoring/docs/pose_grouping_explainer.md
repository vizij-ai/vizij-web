# Pose Grouping And Blending In Vizij Authoring

Last updated: 2026-03-30
Historical implementation record: `apps/vizij-authoring/docs/archive/plans/POSE_GROUP_STAGE_INSPECTOR_SPRINT_PLAN_2026-02-26.md`

This document explains how pose grouping and blending work in the `vizij-authoring` app in plain English.

It covers:

1. How the UI is organized.
2. How authoring data is modeled.
3. What gets compiled and executed under the hood.
4. Which configuration layers exist and how they stack.
5. Where implementation and docs currently align or drift.
6. Historical rollout and cleanup notes for scoped neutral authoring in stage/group inspectors.

## 1) What This System Is Doing

**Executive summary:** The app lets you author pose targets per channel, organize poses into groups, blend inside each group, then blend across groups, and finally combine that pose result with direct driver values at runtime.

### 1.1 The mental model in one pass

At a high level, each pose stores target values for one or more rig channels.  
Those poses can belong to one or more pose groups.  
Each group has its own local blend mode (`average` or `additive`) that decides how member poses combine.

After each group computes its output, the app composes group outputs across groups.  
That cross-group composition can happen in two ways:

1. Legacy/global compatibility mode (single mode across groups).
2. Explicit ordered blend stages (a stage chain with selected group/stage sources).

Then the pose graph writes its result to internal pose-control paths:
`rig/<face>/pose/control/<inputId>`.

The rig graph then combines:

1. Direct channel value (`direct_i`)
2. Pose channel value (`pose_i`)

using per-channel compose mode (`add` or `average`), then clamps.

#### References

- [ARCHITECTURE.md](./ARCHITECTURE.md#pose-ir-and-compile-pipeline)
- [ARCHITECTURE.md](./ARCHITECTURE.md#canonical-path-and-identity-contracts)
- [UI_DESIGN.md](./UI_DESIGN.md#pose-groups-and-composition-ux-contract)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1090)
- [graphBuilder.ts](../../../packages/@vizij/node-graph-authoring/src/graphBuilder.ts#L1560)

### 1.2 Why this split exists

The split between pose graph and rig graph is intentional:

1. Pose authoring stays focused on semantic pose behavior (poses/groups/stages).
2. Rig graph remains owner of final runtime-effective channel values.

So the pose system does not directly replace normal controls.  
It produces an internal signal that the rig graph composes with direct controls.

This keeps the runtime contract explicit and supports future policy extension without forcing all logic into one monolithic authoring surface.

#### References

- [ARCHITECTURE.md](./ARCHITECTURE.md#runtime-graph-packaging)
- [ARCHITECTURE.md](./ARCHITECTURE.md#pose-ir-and-compile-pipeline)
- [rigGraphCompiler.ts](../src/hooks/rigController/rigGraphCompiler.ts#L117)

## 2) How The UI Works

**Executive summary:** You author groups and stages in the Pose Groups surface, edit per-pose memberships in both panel and inspector, set per-channel compose mode in pose channel rows, use Inputs for read-only composition observability, and use stage/group inspectors as the current home for neutral editing plus composition output analysis.

### 2.1 Where to find the controls

The app mounts two `VariablesPanel` instances:

1. `Control Authoring`: Drivers, Poses, Pose Groups.
2. `Input Controls`: Inputs-only surface.

This means Inputs are visually separated from the authoring tabs for poses/groups, even though both are powered by the same panel component.

#### References

- [App.tsx](../src/App.tsx#L1022)
- [App.tsx](../src/App.tsx#L1040)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L57)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2614)

### 2.2 Group lifecycle and membership editing

In the Pose Groups surface you can:

1. Create group.
2. Rename selected configured group.
3. Delete selected configured group.
4. Assign/unassign currently selected pose to a group row.

In pose inspector you also get membership editing:

1. Free-form add group path.
2. Remove membership chips.
3. Quick-add configured groups.
4. Path field writes through `updatePoseGroup`.

Under the hood, membership is identity-driven (`groupIds`) and legacy fields (`group`, `groupId`) are normalized for compatibility.

#### References

- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2334)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L3391)
- [InspectorContent.tsx](../src/components/inspector/InspectorContent.tsx#L1788)
- [InspectorContent.tsx](../src/components/inspector/InspectorContent.tsx#L1896)
- [store.tsx](../src/poseRig/store.tsx#L1347)
- [groupMembership.ts](../src/poseRig/groupMembership.ts#L115)

### 2.3 Blend stages UI

Blend stages are authored in the Pose Groups surface.

You can:

1. Add stage.
2. Rename stage.
3. Reorder stage.
4. Delete stage (blocked when downstream stages reference it).
5. Set stage mode (`average` or `add`).
6. Toggle stage sources from groups and prior stages.

The UI runs topology checks before committing sensitive actions like reorder/source edits and shows inline block reasons.

#### References

- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L139)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2383)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2447)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2891)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L3034)

### 2.4 Per-channel compose mode in pose channel rows

For each driven channel in a pose, UI exposes compose mode:

1. `Add` (default behavior).
2. `Average`.

This compose mode controls direct+pose merge behavior later in rig graph compilation, not group composition.

In expanded controls, each channel also shows:

1. `Control Driver` row (live direct value).
2. `Control Target` row (pose target).
3. Numeric fields with fixed 4-decimal formatting.

#### References

- [InspectorContent.tsx](../src/components/inspector/InspectorContent.tsx#L2109)
- [InspectorContent.tsx](../src/components/inspector/InspectorContent.tsx#L379)
- [InspectorContent.tsx](../src/components/inspector/InspectorContent.tsx#L442)
- [InspectorContent.tsx](../src/components/inspector/InspectorContent.tsx#L168)

### 2.5 Pose Group Inspector

When a pose group is selected (and no pose is selected), inspector shows a group-focused view:

1. Group blend mode toggle (configured groups only).
2. Pose weights list for that group.
3. Solo/play/reset controls for rapid preview.

Current preview math is neutral-relative:

1. Neutral comes from authored `neutralInputs` when present.
2. Missing neutral channels fall back to channel defaults.
3. Additive mode sums weighted deltas from neutral.
4. Average mode applies weighted overlay from neutral.

This makes it easy to test group-level behavior without opening every pose one by one, while still showing the same baseline behavior the compiler uses.

#### References

- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx#L257)
- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx#L278)
- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx#L337)
- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx#L115)
- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx#L176)

### 2.6 Inputs panel role: observability, not neutral authoring

Inputs panel intentionally hides internal pose-control paths and adds derived read-only rows to show composition state:

1. Group outputs: `/pose/groups/{groupId}.output`
2. Stage outputs: `/pose/stages/{stageId}.output`

Kernel value for users:

1. You can verify that groups/stages are producing expected runtime signals.
2. You can inspect provenance (`mode`, `sources`) without entering debug tooling.
3. You cannot accidentally edit composition internals from this pane.

This keeps Inputs useful as a runtime monitor while avoiding confusion about it being an authoring surface for neutral.

#### References

- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L1518)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L1577)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L1604)
- [UI_DESIGN.md](./UI_DESIGN.md#inputs-pane-contract)

### 2.7 Stage/group inspector direction for composition outputs and neutral editing

Agreed direction for UX:

1. Keep Inputs read-only for composition observability.
2. Put neutral editing in stage/group inspectors.
3. Support two neutral authoring methods:
   - pose reference (pick a pose as baseline),
   - direct per-channel neutral values.
4. Keep overlay-average semantics for now.
5. Design for future blend strategies beyond additive/overlay-average.

Recommended inspector structure:

1. Settings section (mode, source selection, neutral source selection).
2. Sliders/play controls for active source weights.
3. Composition outputs section (read-only effective channel outputs + neutral details + contribution breakdown).

Note on sampling: fixed checkpoints like `0/25/50/75/100` are not the right default for multi-source authoring, because source weights are not guaranteed to move uniformly. The inspector should show live composition for the current authored source weights, with optional user-defined probes later if needed.

#### References

- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2891)
- [UI_DESIGN.md](./UI_DESIGN.md#pose-groups-and-composition-ux-contract)

## 3) Architecture And State Model

**Executive summary:** The store holds authored state plus derived drafts, and every meaningful pose edit gets projected through config -> IR -> pose graph so the UI and runtime metadata stay synchronized.

### 3.1 Core data contracts

Key contract concepts:

1. Config blend modes: `average | additive`
2. IR blend modes: `average | add`
3. Per-channel direct+pose compose mode: `average | add`
4. Cross-group override mode: includes `priority`
5. Stage source kinds: `group | stage`
6. IR contracts enforce canonical target IDs and synthetic-node boundaries

These contracts are the basis for normalization, diagnostics, and compiler assumptions.

#### References

- [types.ts](../src/poseRig/types.ts#L5)
- [types.ts](../src/poseRig/types.ts#L10)
- [types.ts](../src/poseRig/types.ts#L74)
- [types.ts](../src/poseRig/types.ts#L94)

### 3.2 Store rebuild loop

`PoseRigState` carries both:

1. Authored fields (`poses`, `neutralInputs`, blend/group controls).
2. Derived drafts (`poseConfigDraft`, `poseIrDraft`, `poseGraphSpec`).

When relevant fields change, store rebuilds drafts:

1. Build/project config.
2. Normalize or compile IR.
3. Build pose graph from IR.
4. Update diagnostics/warnings.

This gives deterministic derived state for export, runtime sync, and diagnostics.

#### References

- [store.tsx](../src/poseRig/store.tsx#L471)
- [store.tsx](../src/poseRig/store.tsx#L659)
- [store.tsx](../src/poseRig/store.tsx#L768)
- [store.tsx](../src/poseRig/store.tsx#L859)
- [store.tsx](../src/poseRig/store.tsx#L1765)

### 3.3 Group identity and membership normalization

Membership normalization does three important things:

1. Canonicalizes paths and IDs.
2. Resolves legacy membership fields (`group`, `groupId`) into `groupIds`.
3. Keeps stable deterministic ordering.

This prevents random group-order jitter and preserves compatibility with older imports.

#### References

- [groupMembership.ts](../src/poseRig/groupMembership.ts#L3)
- [groupMembership.ts](../src/poseRig/groupMembership.ts#L77)
- [groupMembership.ts](../src/poseRig/groupMembership.ts#L115)
- [store.tsx](../src/poseRig/store.tsx#L431)

## 4) What Happens Under The Hood

**Executive summary:** Pose compiler builds neutral-relative signals per channel from groups/stages/overrides, using additive and overlay-average composition. Rig compiler then merges pose signals with direct channels, and runtime staging keeps pose-control paths internal.

### 4.1 Pose graph compilation

Per channel, compiler:

1. Builds group contributions from pose weights and pose targets relative to neutral.
2. Applies intra-group mode:
   - `additive`: sums weighted deltas and reapplies neutral,
   - `average`: uses weighted overlay with neutral as base.
3. Composes across groups via compatibility mode, explicit blend stage chain, or per-channel priority override path.
4. Emits final result to internal pose-control output path.

Compiler also rejects unexpected authored input nodes in pose graph, enforcing synthetic/internal boundary.

#### References

- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L898)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1090)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1107)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1119)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1320)

### 4.2 Rig graph direct+pose composition

Rig graph compile receives pose config snapshot and computes per-input compose modes from pose definitions.

For composed channels, it creates a pose-control input path and then:

1. `average` mode: `(direct + pose) / 2`
2. `add` mode: normalized additive merge relative to baseline
3. Clamp to channel min/max

Staged pipeline path follows same principle but can include parent contributions and override logic.

#### References

- [rigGraphCompiler.ts](../src/hooks/rigController/rigGraphCompiler.ts#L95)
- [rigGraphCompiler.ts](../src/hooks/rigController/rigGraphCompiler.ts#L144)
- [graphBuilder.ts](../../../packages/@vizij/node-graph-authoring/src/graphBuilder.ts#L1560)
- [graphBuilder.ts](../../../packages/@vizij/node-graph-authoring/src/graphBuilder.ts#L1640)

### 4.3 Runtime input routing and staging

Runtime route builder skips pose-control paths when mapping user-editable inputs.  
That means internal pose signals are not treated as normal external inputs.

Queued runtime writes are deduped with `Object.is` so unchanged values do not churn runtime input staging.

#### References

- [runtimeInputRoutes.ts](../src/hooks/rigController/runtimeInputRoutes.ts#L120)
- [runtimeInputStaging.ts](../src/hooks/rigController/runtimeInputStaging.ts#L16)
- [useRigController.ts](../src/hooks/useRigController.ts#L2125)
- [useRigController.ts](../src/hooks/useRigController.ts#L2926)

### 4.4 Neutral semantics and baseline fallback

Current compiler baseline per channel:

1. Use authored `neutralInputs[inputId]` when present.
2. Otherwise use channel `defaultValue`.
3. Otherwise use `0`.

Current neutral behavior:

1. Neutral is global in config/IR today.
2. Neutral influences additive composition.
3. Neutral also influences overlay-average composition (base + weighted deltas), so it is not additive-only in the current implementation.
4. Diagnostics warn when explicit neutral is missing for targeted channels, because fallback changes behavior.

This is why neutral is a workflow-critical baseline, not just a static import/export field.

#### References

- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L49)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L983)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1033)
- [types.ts](../src/poseRig/types.ts#L192)
- [poseIrService.ts](../src/poseRig/services/poseIrService.ts#L1300)

## 5) Configuration Layers And How They Stack

**Executive summary:** Channel output is resolved through a strict layered policy: neutral baseline -> pose targets -> group blend -> cross-group policy/stages -> pose-control output -> rig direct+pose compose -> clamp.

### 5.1 Configuration knobs available today

Authorable controls include:

1. Pose channel target values.
2. Per-pose `composeModes` map (`add`/`average`).
3. Group definitions + group blend mode.
4. Global `crossGroupBlendMode`.
5. Optional per-channel `crossGroupChannelOverrides`, including `priority`.
6. Optional ordered `blendStages`.
7. Neutral mode (`explicit` vs `face-default`).
8. Global neutral channel map (`neutralInputs`), shared across groups/stages.

#### References

- [types.ts](../src/poseRig/types.ts#L183)
- [types.ts](../src/poseRig/types.ts#L74)
- [types.ts](../src/poseRig/types.ts#L94)
- [types.ts](../src/poseRig/types.ts#L179)
- [store.tsx](../src/poseRig/store.tsx#L937)
- [store.tsx](../src/poseRig/store.tsx#L1129)
- [UI_DESIGN.md](./UI_DESIGN.md#pose-groups-and-composition-ux-contract)

### 5.2 Effective precedence per channel

Actual precedence in compiler/runtime is:

1. Resolve neutral baseline for channel (`neutralInputs` -> channel default -> `0`).
2. Resolve pose contributions inside each group relative to that neutral.
3. If stages exist, stage chain decides cross-group output.
4. If no stages, cross-group override for that channel can supersede global mode.
5. If no override, global cross-group mode applies.
6. Pose graph outputs channel to internal pose-control path.
7. Rig graph composes direct input with pose-control input using per-channel compose mode.
8. Clamp to channel range.

So stage chains override legacy cross-group composition path.  
Per-channel compose mode is downstream and separate from group/stage policy.  
Neutral baseline affects additive and overlay-average behavior in current compiler semantics.

#### References

- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L49)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1106)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1119)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1293)
- [graphBuilder.ts](../../../packages/@vizij/node-graph-authoring/src/graphBuilder.ts#L1560)

### 5.3 Guardrails and validation

Topology/contract guardrails appear in both UI and services:

1. Stage topology checks (duplicates, unknown references, self/forward refs, empty sources).
2. Invalid stage edits blocked in UI before apply.
3. Config/IR normalize and emit warnings/diagnostics for malformed overrides/stages/compose entries.
4. Canonical target contract enforced during IR-based pose graph build.
5. Explicit-neutral gaps produce warnings when targeted channels are missing neutral values.

#### References

- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L139)
- [store.tsx](../src/poseRig/store.tsx#L182)
- [poseConfigService.ts](../src/poseRig/services/poseConfigService.ts#L680)
- [poseIrService.ts](../src/poseRig/services/poseIrService.ts#L524)
- [poseIrService.ts](../src/poseRig/services/poseIrService.ts#L1300)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1339)

### 5.4 Target neutral layering (agreed direction)

Target precedence for future scoped neutral:

1. Stage neutral override (when editing a stage output context).
2. Group neutral override (when editing a group output context).
3. Global neutral (`neutralInputs`).
4. Channel default fallback.

Target authoring methods for each scoped neutral:

1. Pose reference baseline.
2. Direct per-channel baseline values.

Blend strategy direction:

1. Keep current overlay-average and additive behavior.
2. Keep architecture open for additional strategies later.

This layering preserves current compatibility while giving authors context-specific baselines where additive behavior needs it most.

#### References

- [types.ts](../src/poseRig/types.ts)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts)
- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2891)
- [UI_DESIGN.md](./UI_DESIGN.md#neutral-and-value-semantics)

## 6) Import, Export, And Diagnostics

**Executive summary:** Imports are normalized and remapped into canonical contracts, and exports include config + IR + diagnostics so pose behavior is auditable and runtime-checkable.

### 6.1 Config and IR import flow

Config import:

1. Parse JSON.
2. Normalize config against current standard inputs.
3. Compile to IR.
4. Project back to config/state drafts.
5. Merge warnings/diagnostics.

IR import:

1. Parse JSON.
2. Normalize IR and contracts.
3. Project to config.
4. Update drafts and diagnostics.

This keeps data valid even when payloads come from older schemas or mismatched IDs.

#### References

- [usePoseRigAuthoring.ts](../src/poseRig/usePoseRigAuthoring.ts#L402)
- [store.tsx](../src/poseRig/store.tsx#L1664)
- [store.tsx](../src/poseRig/store.tsx#L1726)
- [poseConfigService.ts](../src/poseRig/services/poseConfigService.ts#L505)
- [poseIrService.ts](../src/poseRig/services/poseIrService.ts#L1440)

### 6.2 Export packaging

Export prefers config resolved from IR when IR is present, and includes:

1. Rig graph payload.
2. Pose graph payload.
3. Pose config.
4. Pose IR and pose diagnostics in metadata.

This preserves authoring intent plus machine-facing evidence for downstream review.

#### References

- [useVizijExport.ts](../src/hooks/useVizijExport.ts#L183)
- [useVizijExport.ts](../src/hooks/useVizijExport.ts#L856)
- [useVizijExport.ts](../src/hooks/useVizijExport.ts#L906)
- [ARCHITECTURE.md](./ARCHITECTURE.md#runtime-graph-packaging)

## 7) Historical Docs Consistency Check (2026-02-26 Snapshot)

**Executive summary:** This review snapshot captured the remaining drift as of 2026-02-26. Some items below have since been cleaned up, but the section remains useful as historical context for why the docs were normalized.

### 7.1 Where docs and code are aligned

Aligned:

1. Internal pose-control path contract and hidden Inputs rows.
2. Derived read-only group/stage output rows in Inputs.
3. Stage topology guardrail expectations.
4. Support for per-channel cross-group overrides including `priority`.
5. Direct+pose effective value contract.

#### References

- [ARCHITECTURE.md](./ARCHITECTURE.md#pose-ir-and-compile-pipeline)
- [ARCHITECTURE.md](./ARCHITECTURE.md#canonical-path-and-identity-contracts)
- [UI_DESIGN.md](./UI_DESIGN.md#inputs-pane-contract)
- [UI_DESIGN.md](./UI_DESIGN.md#pose-groups-and-composition-ux-contract)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L1518)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1119)

### 7.2 Where docs drift from implementation

Drift points:

1. `Authoring_Blueprint.md` says Inputs replaces Drivers and no dedicated Drivers pane, but Drivers surface still exists.
2. `Authoring_Blueprint.md` says `/pose/control` should not be used as generated namespace, but active architecture and compiler use `rig/<face>/pose/control/<inputId>`.
3. `ARCHITECTURE.md` wording says mutations land in IR first; implementation is mostly projection-first edits that then regenerate IR.
4. `UI_DESIGN.md` says three-row channel rendering; implementation is collapsible header row plus two detailed rows.
5. App `README.md` mentions multi-select batch apply for pose groups, but batch API is not wired in current UI.
6. `materials` panel key still maps to Pose Groups surface visibility, which is a naming legacy.
7. Docs describe neutral strategy at global level, but do not define planned stage/group neutral authoring semantics (pose reference + direct channel values in inspector).
8. Docs do not explicitly lock that current `average` behavior is overlay-average relative to neutral.

#### References

- [Authoring_Blueprint.md](./Authoring_Blueprint.md#72-inputs-surface-replaces-drivers-pane)
- [Authoring_Blueprint.md](./Authoring_Blueprint.md#75-wiring-model-no-dedicated-drivers-pane)
- [Authoring_Blueprint.md](./Authoring_Blueprint.md#2-current-context-and-required-contract-adjustment)
- [ARCHITECTURE.md](./ARCHITECTURE.md#pose-ir-and-compile-pipeline)
- [UI_DESIGN.md](./UI_DESIGN.md#what-i-drive-channel-row-contract)
- [UI_DESIGN.md](./UI_DESIGN.md#neutral-and-value-semantics)
- [README.md](../README.md#available-interactions)
- [App.tsx](../src/App.tsx#L1022)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2618)
- [usePoseRigAuthoring.ts](../src/poseRig/usePoseRigAuthoring.ts#L249)
- [variablesSurfaceOrder.ts](../src/components/panels/variablesSurfaceOrder.ts#L24)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1033)

### 7.3 Suggested cleanup order for docs

Recommended order:

1. Update `Authoring_Blueprint.md` first (it has the largest contract drift).
2. Update app `README.md` claims about batch group assignment UX.
3. Tighten `ARCHITECTURE.md` wording around IR-first mutations vs projection-first implementation.
4. Add scoped neutral contract to `UI_DESIGN.md` and `ARCHITECTURE.md` (stage/group inspector location, pose-reference + direct neutral authoring, precedence rules).
5. Explicitly document current overlay-average semantics and note future blend-strategy extensions.
6. Optionally clarify `UI_DESIGN.md` channel-row language to reflect current expandable layout.
7. Decide whether to rename `materials` visibility key to a pose-group-native key in workspace panel state docs/code.

#### References

- [docs/README.md](./README.md#update-rules)
- [Authoring_Blueprint.md](./Authoring_Blueprint.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [UI_DESIGN.md](./UI_DESIGN.md)

## 8) Historical Rollout Notes For Scoped Neutral In Stage/Group Inspectors

**Executive summary:** We can deliver this safely in phases: lock contracts, add scoped neutral data shape, update compiler neutral resolution, ship inspector UX for neutral authoring and composition outputs, then close with migration/tests/docs.

### 8.1 Decision lock (agreed in this review)

Direction to implement:

1. Keep current overlay-average behavior.
2. Keep additive behavior.
3. Treat blend-strategy set as extensible (more strategies later).
4. Author neutral in two ways:
   - pose reference baseline,
   - direct per-channel values.
5. Put neutral editing in stage/group inspectors.
6. Keep Inputs as read-only composition observability.

#### References

- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1033)
- [graphBuilder.ts](../src/poseRig/graphBuilder.ts#L1218)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L1518)
- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx#L257)

### 8.2 Contract and data model changes

Phase 1 implementation goals:

1. Add optional scoped neutral definitions to group and blend-stage contracts.
2. Represent neutral source type (`inherit`, `pose-reference`, `direct-values`).
3. Keep backward compatibility: missing scoped fields means inherited global behavior.
4. Preserve import/export projection consistency across config and IR.

Suggested file touchpoints:

1. Pose config/IR type contracts.
2. Config normalization/projection services.
3. Store patch/rebuild pipeline.

#### References

- [types.ts](../src/poseRig/types.ts)
- [poseConfigService.ts](../src/poseRig/services/poseConfigService.ts)
- [poseIrService.ts](../src/poseRig/services/poseIrService.ts)
- [store.tsx](../src/poseRig/store.tsx)

### 8.3 Compiler neutral resolution changes

Phase 2 implementation goals:

1. Introduce effective-neutral resolution per evaluation context:
   - stage override,
   - group override,
   - global neutral,
   - channel default.
2. Keep current additive and overlay-average algorithms, but feed them context-appropriate neutral.
3. Preserve stage topology and cross-group override behavior.
4. Emit diagnostics for invalid neutral references (unknown pose, missing target channels, partial values).

#### References

- [graphBuilder.ts](../src/poseRig/graphBuilder.ts)
- [poseIrService.ts](../src/poseRig/services/poseIrService.ts#L1300)
- [poseConfigService.ts](../src/poseRig/services/poseConfigService.ts)

### 8.4 Inspector UX implementation

Phase 3 implementation goals:

1. Extend Pose Group Inspector with:
   - neutral source selector,
   - pose-reference picker,
   - direct per-channel neutral editor.
2. Add Stage Inspector with matching neutral authoring controls.
3. Add composition outputs section in both inspectors:
   - effective output per channel (read-only),
   - neutral source/value visibility,
   - source contribution breakdown.
4. Avoid fixed uniform checkpoints by default; show current live source weights and runtime result.

#### References

- [InspectorPanel.tsx](../src/components/inspector/InspectorPanel.tsx)
- [InspectorContent.tsx](../src/components/inspector/InspectorContent.tsx)
- [VariablesPanel.tsx](../src/components/panels/VariablesPanel.tsx#L2891)
- [UI_DESIGN.md](./UI_DESIGN.md#pose-groups-and-composition-ux-contract)

### 8.5 Import/export, migration, and diagnostics

Phase 4 implementation goals:

1. Migration from global-only neutral to scoped-neutral-capable payloads with no behavior regression when scoped fields are absent.
2. Export scoped neutral metadata in config and IR.
3. Surface clear diagnostics for fallback behavior and bad neutral references.
4. Keep deterministic normalization/project-back behavior for round trips.

#### References

- [usePoseRigAuthoring.ts](../src/poseRig/usePoseRigAuthoring.ts)
- [store.tsx](../src/poseRig/store.tsx#L1664)
- [poseConfigService.ts](../src/poseRig/services/poseConfigService.ts#L505)
- [poseIrService.ts](../src/poseRig/services/poseIrService.ts#L1440)
- [useVizijExport.ts](../src/hooks/useVizijExport.ts#L856)

### 8.6 Validation and documentation closeout

Phase 5 implementation goals:

1. Unit tests for neutral precedence and blend behavior across group/stage contexts.
2. Inspector interaction tests for neutral authoring flows.
3. Update UI and architecture contracts to include scoped neutral behavior and overlay-average semantics.
4. Update explainer and app README examples.

#### References

- [docs/README.md](./README.md#update-rules)
- [UI_DESIGN.md](./UI_DESIGN.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [pose_grouping_explainer.md](./pose_grouping_explainer.md)
