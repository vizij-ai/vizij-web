# Vizij Authoring Architecture

Last updated: 2026-10-19
Audience: engineers working on `apps/vizij-authoring`

This document defines system boundaries, canonical data contracts, and compile/runtime invariants.

## Source Hierarchy

1. Program objective: `plans/GOAL.md`
2. Delivery order: `plans/ROADMAP.md`
3. Work items: `plans/BACKLOG.md`
4. Execution state and evidence: `plans/TRACKER.md`
5. UI behavior contract: `UI_DESIGN.md`
6. Layer-level contract details: `Authoring_Blueprint.md`

## The Face Runs on the Deployed Runtime

The main face and the reference face are each a `@vizij/runtime` face, run by
`@vizij/runtime-react`'s `VizijRuntimeProvider`: the runtime a deployed Vizij
runs (see the repository's
[`ARCHITECTURE.md`](../../../ARCHITECTURE.md#what-runs-a-face)). Authored
state, the compiled graphs and the values the face shows stay aligned because
there is no second evaluator to drift from the device. What that takes:

1. **The face in the viewport is an export.** The viewport loads the main face
   from the GLB bytes `@vizij/render`'s headless exporter makes from the
   document's world (`buildSceneGraph` and `exportScene`, in
   `src/hooks/useMainFaceBytes.ts`), the exporter the Export dialog writes with
   (`src/hooks/useVizijExport.ts`). The bytes are re-made only when the world's
   structure changes; a value edit applies to the loaded face in place
   (`setStaticFeature`).
2. **No separate preview path.** The authored rig and pose graphs replace the
   bundle's own in its composition (`composeVizij`, which keeps the bundle's
   animation source) and swap into the running device whole
   (`runtime.loadGraph`, `RuntimeGraphBridge` in
   `src/components/app/Viewer.tsx`). The device keeps its runs, its animation
   players and its store.
3. **No separate preview stepper.** The timeline's clip compiles to clip IR,
   then to `@vizij/runtime`'s `Animation`, keyframe tangents included
   (`src/utils/animationClipCompiler.ts`). `runtime.moduleAnimation` turns
   that into Arora's animation module's `Clip`, which loads on the timeline's
   player: `load_clip` once, `reload_clip` on each edit, so the playhead and
   the playback state stay (`src/hooks/useAnimationTransport.ts`). Play,
   pause, stop, seek, loop and speed are the module's transport. The module
   interpolates as the timeline draws (`sampleTrackAt`): a `cubic` segment is
   glTF's `CUBICSPLINE` Hermite on the keyframes' tangents, the chord slope
   where one is absent. The panel shows the player state the device reports
   (`decodePlayerStates`).
   With no face loaded the transport plays nothing. The bridge is mounted with
   the viewport, not with the timeline panel, so showing or hiding the panel
   leaves the device and its player as they are.
4. **The reference face runs on its own runtime**
   (`src/components/app/ReferenceFaceRuntime.tsx`): its own provider and
   device, stepped only while it is visible (`run={visible}`).
5. **The export is what ran.** The export builds the rig graph with the
   compiler the live face uses (`buildRigGraphSpec` from
   `@vizij/node-graph-authoring`), and is blocked when that graph does not
   match its compiled IR. It writes the pose graph and the pose config beside
   it, and serializes the authored clips into the bundle's `animations[]`,
   which import reads back into the same authoring state
   (`bundleAnimationEntryToClipIr`). A deployed Vizij loading the file composes
   the same graphs.
6. **Locks and edits are holds on the device.** An inspector lock keeps the
   locked outputs at the value the face shows (`runtime.hold`,
   `RuntimeHoldBridge`). An edit (a slider drag, a field being typed in) holds
   the keys it writes against the face's own writers while it lasts
   (`runtime.holdKeys`, `src/hooks/useEditHolds.ts`), so the standard
   adaptation, a program or an animation does not overwrite the value being
   edited.

## Layer Model

1. Animatable layer: render-facing scene leaves.
2. PropsRig layer: low-level generated channels (`/propsrig/...`) that write to animatables.
3. Abstract rig layer: authored controls and bindings.
4. Pose layer: semantic pose targets and group/stage composition.
5. Binding layer: directed edges between authoring controls.

Boundary invariant:

- Abstract rig controls must not directly write animatable leaves.
- Scene writes are mediated through propsrig channels.

## Rig Input Pipeline and the Override Stage

Every staged rig input compiles (`buildRigGraphSpec`, in
`@vizij/node-graph-authoring`'s `graphBuilder.ts`) to one chain:

```text
parents → poses → direct input → normalized-additive blend → override → clamp
```

1. The blend combines the contributions present: the parents' (through the
   parent-blend expression), the pose graph's
   (`rig/<face>/pose/control/<inputId>`), and the direct input's when it is
   enabled. The direct input is off by default; its path is the input's own.
2. The override selects: `effective = override.enabled ? override.value : blend`,
   built from existing node types as `blend + enabled·(value − blend)`.
3. The clamp holds the result to the input's range; it is on by default.

The override's keys are `rig/<face>/override/<inputId>/{enabled,value}`
(`buildRigPipelineV1OverrideEnabledPath` and `…ValuePath` in `@vizij/utils`).
They are internal runtime paths: not rows of the Inputs pane, and not under
`standard/`.

The override is the inspector's control for a deterministic manual value,
outside binding expressions; the binding's former `self` slot is the direct
input, not the override. It lives inside the graph so that what the inspector
shows is what the device computes; an override held outside the graph, in a
controller, would be a second evaluator. Hence:

- Runtime clients (apps, Studio, a ROS bridge) drive a face through its
  standard and its methods, never through `override/*`.
- An edit hold (`holdKeys`, above) is a different mechanism under a different
  name: it keeps a store key from the face's own writers for the length of an
  edit. Neither replaces the other, and the override stage stays in the
  compiled rig.
- An input staged with its direct input off and with no parents or poses moves
  only through its override. Animating it, which writes the input's own path,
  takes enabling its direct input.

The implementation plan is
[`plans/OVERRIDE_PIPELINE_IMPLEMENTATION_PLAN_2026-02-25.md`](./plans/OVERRIDE_PIPELINE_IMPLEMENTATION_PLAN_2026-02-25.md);
the proposal, with the alternatives it set aside, is
[`reports/override-pipeline-binding-editor-proposal-2026-02-25.md`](./reports/override-pipeline-binding-editor-proposal-2026-02-25.md).

## Pose IR and Compile Pipeline

Current compile path:

1. Authoring store mutations update authored pose state, then projection rebuilds flow through `PoseConfigService` + `PoseIrService` (config -> IR -> projected config drafts).
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
7. Scoped neutral strategy for stage/group contexts:
   - neutral source type: `inherit`, `pose-reference`, `direct-values`.
   - effective precedence: `stage > group > global > input.defaultValue > 0`.
   - current `average` behavior remains overlay-average relative to the effective neutral baseline.

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

The bundle carries distinct payloads:

1. rig graph payload,
2. pose graph payload,
3. pose config metadata,
4. pose IR + diagnostics metadata (for audit/debug).

Rig and pose are separate graph specs in the bundle. `composeVizij` composes
them, with the bundle's other graphs, into the one graph the device runs.

Execution note:

1. Separate-graph packaging is intentional for MVP delivery speed and compatibility.
2. Rig graph composition nodes consume both direct rig-control and pose-control signals to produce final effective values per channel.

## Canonical Path and Identity Contracts

1. Generated low-level rig paths use `/propsrig/...`.
2. Pose-weight controls use canonical per-pose paths: `rig/{face}/poses/{poseId}.weight`.
3. Pose-weight controls carry stable source IDs (`pose-weight:{poseId}`).
4. Pose target references resolve to canonical existing input IDs.
5. Pose graph outputs use internal paths `rig/{face}/pose/control/{inputId}`.
6. Ghost/intermediate blend signals are compile-time graph internals, not authored inputs.
7. Inputs-pane IA distinguishes authored controls (`rig-input`, `pose-weight`) from derived composition outputs (`group-output`, `stage-output`).
8. Internal pose-control paths are not shown as user-editable Inputs rows in default UX.
9. Derived composition outputs use deterministic synthetic paths (`/pose/groups/{groupId}.output`, `/pose/stages/{stageId}.output`) for visibility and provenance.
10. Derived group/stage outputs are read-only/non-selectable in Inputs; edits flow through pose/pose-group/stage authoring surfaces.

## Source Motion Import and Animation Interop

Animation crosses the tool boundary in two directions, with deliberately
unequal standing:

1. `VizijBundleExtension.animations` is **authoritative** and lossless.
2. Native glTF animation channels are a **derived, lossy projection** written
   for interoperability (Blender, viewers, other engines) and never trusted
   over the bundle on re-import.

Boundary invariants:

1. Animation tracks bind by **name-derived channel path**
   (`/propsrig/{element}/{feature}/{component}`), never by animatable id.
   Regenerated ids do not break bindings; renames do.
2. The propsrig path rule (`buildPropsRigInputPath`) and the morph feature-key
   rule (`sanitizeMorphKey`) each have exactly one implementation, shared by
   rig generation and animation channel resolution. Duplicating either lets
   generation and resolution drift silently.
3. Import resolution is exact, deterministic, and idempotent; unresolved
   channels are reported with the path attempted.
4. Tracks whose channel disappears are **detached, not deleted**, and excluded
   from compile and from the bundle.
5. Baked animations carry provenance in glTF `extras` (not a custom extension),
   because Blender preserves extras and drops unknown extensions.

Full read/write cycle, per-format detail, and rigger guidance:
[`ANIMATION_INTEROP.md`](./ANIMATION_INTEROP.md).

## Diagnostics and Validation Contracts

1. Compile/import/export must emit machine-readable diagnostics for warnings/errors.
2. Pose config, pose IR, and pose graph imports share one structured diagnostics surface in authoring UI.
3. Unknown channels, invalid mappings, and blocked retargets are never silent.
4. Export validation checks runtime compatibility before writing assets.
5. Import normalization and retargeting must be deterministic and idempotent.

The live rig graph is the IR's compilation (`resolveRuntimeGraphSpec`): with
compile issues it falls back to the builder's own spec, and when the compile
fails the last good graph keeps running. The IR is therefore what to inspect
when the face and the authored bindings disagree. The Debug panel's graph
diagnostics (`src/components/app/GraphDiagnosticsPanel.tsx`) download the IR
and the machine report; its IR inspector diffs a saved machine report and
copies the matching `vizij-ir-report --diff` command, the parity check of
`@vizij/node-graph-authoring`'s CLI. The binding editor shows, per slot, the
upstream nodes and the CASE metadata the machine report gives
(`src/components/binding/SlotDiagnosticsContext.tsx`).

## Code Structure

1. Pose rig state is `PoseRigStore` (`src/poseRig/store.tsx`), a vanilla store
   with a React hook. Its logic lives in services (`PoseConfigService`,
   `PoseIrService`, `PoseGraphService`, `PoseSnapshotService`, in
   `src/poseRig/services/`), and components reach it through
   `usePoseRigStore` or `usePoseRig` (`src/state/PoseRigProvider.tsx`). Logic
   goes in store actions and services, not in components.
2. Binding expressions are parsed once, by `@vizij/node-graph-authoring`'s
   `parseControlExpression` (arithmetic, comparisons, `&&` and `||`,
   parentheses); `collectExpressionReferences` and `mapExpression` work on its
   tree. Build on those rather than re-parsing expression strings.

## Performance and Reactivity Constraints

1. Heavy UI surfaces avoid broad store subscriptions.
2. Hidden surfaces avoid expensive tree/filter work.
3. Hot path canonical resolution uses indexed/cached lookups.
4. Input synchronization logic must avoid update loops/churn.

## Change Discipline

1. If user-visible behavior changes, update `UI_DESIGN.md` first (or in the same change).
2. If sequencing or priorities change, update `ROADMAP.md` and `BACKLOG.md` together.
3. If validation status changes, record it in `TRACKER.md` with command evidence.
