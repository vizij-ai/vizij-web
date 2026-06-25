# Authoring Rebuild — Feature Audit (keep / simplify / cut)

> Workstream 2. Inventory of every user-facing capability in today's `vizij-authoring`,
> mapped to the pipeline layer it touches (`01-conceptual-model.md` §2) and to the target
> interface it belongs in (§3), with a keep / simplify / cut call and the rationale.
>
> **Legend** — **Keep**: carry forward roughly as-is. **Simplify**: keep the capability,
> redesign the UX. **Cut**: drop from the product, or demote to debug-only / out-of-tool.
> Engine-side logic that survives lives in `@vizij/*` regardless of the UI verdict.

## How today's app is organized (for reference)

- **4 workbenches** (`components/app/workbenchConfig.ts`): Import/Export, Rigging
  (Scene Composer), Posing (Pose Rig), Standard Feature Spaces.
- **~13 toggleable panels** (`state/workspaceStore.ts`): hierarchy, variables, poses,
  inputs, motiongraphPalette, inspector, speech, debug, animation, motiongraph, toolbar,
  referenceFace, materials.
- Orchestrated by a 5,298-line `App.tsx` with a Face Creator flow, reference-face runtime,
  and a procedural node-graph ("motiongraph") editor embedded.

## Audit table

### Face Designer layer (`d` — compose primitives/components)

| Feature (current location) | Pipeline | Target interface | Verdict | Notes |
| --- | --- | --- | --- | --- |
| Scene hierarchy tree (`scene-composer/SceneHierarchyPanel`, `panels/HierarchyPanel`) | `d` | Face Designer | **Simplify** | Today it exposes raw scene-graph nodes. Recast around *face components* (mouth, eye) rather than primitive lines/circles, per the paper. Advanced raw view = progressive disclosure. |
| Face Creator parametric builder (`components/app/FaceCreatorPanel`, inline logic in `App.tsx`) | `d` | Face Designer | **Keep + promote** | A genuinely simple, designer-friendly way to compose a face (eyes, pupils, brows, lids, mouth, cheeks, nose, ears + colors/sizes). The closest thing to the desired "simple" UX. Extract logic out of `App.tsx`. |
| Materials editor (`inspector/MaterialEditor`, `panels/MaterialsPanel`) | `d` | Face Designer | **Simplify** | Keep color/material control; fold into the component-centric inspector instead of a standalone panel. |
| Morph targets (`inspector/RiggingMorphTargetsSection`) | `d`/`f` | Face Designer | **Keep** | Needed for visemes/expressions. Surface where the component is edited. |
| Transform editing (`inspector/RiggingTransformSection`, `rotationDisplay`) | `d` | Face Designer | **Keep** | Core to placing components. |
| Blender / external 3D round-trip (glTF/GLB) | `d` | Face Designer | **Keep** | Paper explicitly supports composing from external tools. Keep import/export of rigged components. |

### Rig layers (`f→d` and `c→f` — rigs & standards)

| Feature | Pipeline | Target interface | Verdict | Notes |
| --- | --- | --- | --- | --- |
| Binding editor: standard input → animatable via expression (`components/binding/*`, `inspector/BindingConnections`, `inspector/VariablePipelineStages`) | `f→d` | Rig Designer | **Simplify** | Core rig capability (the `Rig(f→d)` mapping). The expression/pipeline-stage UX is powerful but buried in 1,600–1,900-line components. Redesign as the central Rig Designer graph. |
| Variables panel (`panels/VariablesPanel`, **8,753 lines**) | `f`/`c` | Rig Designer | **Simplify (hard split)** | The single biggest complexity sink. Decompose: variable declaration, value inspection, and pipeline wiring are distinct jobs that should not co-habit one mega-panel. |
| Procedural node-graph editor ("motiongraph": `motiongraph/*`, EditorCanvas, NodePalette, input/output sets) | `c→f` / `t` | Rig Designer | **Keep + unify** | This *is* the visual "graph of transformations" the paper's Rig Designer calls for. Make it the spine of the Rig Designer rather than a hidden panel. Reuses `@vizij/node-graph-*`. |
| Pose Rig: poses, pose groups, blend stages (`poseRig/*`, `components/app/PoseRigPanels`) | `c→f` | Rig Designer | **Simplify** | Powerful abstraction-rig mechanism (blend named poses → outputs). Reconcile with the node-graph editor so there is *one* rig-authoring model, not two (`poseRig` store + motiongraph store today). |
| Pose Graph Remap Wizard (`poseRig/PoseGraphRemapWizard`, `usePoseGraphImport`) | `c→f` | Rig Designer | **Keep** | Maps an imported rig onto the current face — directly the "Share Rig / transformations that translate from one rig to another" hand-off. |
| Standard Feature Spaces editor — Setup / Channels / Mapping (`StdFeatureSpaces*`, `referenceFace/*`) | `c` | Rig Designer | **Simplify** | Aligning a face to a standard is a primary guided action, not a 3-tab sub-tool. The side-by-side reference-face Mapping concept is good; the surrounding machinery is heavy. |
| Standard input coverage (`StandardInputCoveragePanel`) | `c` | Rig Designer | **Keep** | "How complete is my mapping to the standard" is exactly the feedback an Abstraction Rigger needs. Keep as guidance in the standards flow. |
| Reference-face runtime/playback (`referenceFace/*`, `ReferenceFaceRuntime`, most of `next_steps.md`) | `c→f` validation | Rig Designer | **Simplify (de-risk)** | The single largest source of bugs. Keep "preview my rig against a reference" as a concept; rebuild the runtime/state path cleanly rather than porting the current one. |

### Animation values (`t`)

| Feature | Pipeline | Target interface | Verdict | Notes |
| --- | --- | --- | --- | --- |
| Animation timeline + keyframes (`components/animation/TimelineEditor`, `TrackRow`, `state/animationStore`) | `t` | Face Controller | **Keep** | Core Animator capability ("define properties/values over time"). |
| Transport (play/pause/loop/speed, `useAnimationTransport`, `useGraphPlaybackControls`) | `t` | Face Controller | **Keep** | Needed to drive/preview. |
| Procedural programs as animation source (motiongraph-as-target in `App.tsx`) | `t` | Face Controller | **Simplify** | Keep "a graph can be an animation source," but the dual authoring/playback role of motiongraph in `App.tsx` is a major complexity driver — separate authoring (Rig Designer) from playback (Controller). |
| Save animations as video / hi-FPS output (paper requirement) | `t` | Face Controller | **Keep (verify)** | Paper lists video export + high-FPS output as Animator requirements. Confirm current export support; likely a gap to fill. |

### Face Controller / playback / runtime

| Feature | Pipeline | Target interface | Verdict | Notes |
| --- | --- | --- | --- | --- |
| 3D Viewer (`components/app/Viewer`, `@vizij/render`) | render | Face Controller (+ all) | **Keep** | Shared preview surface across interfaces. |
| Runtime face controls overlay (`RuntimeFaceControlsOverlay`, `RuntimeSourceToolbar`) | control | Face Controller | **Simplify** | The live "drive the face" controls — the Controller's core. Promote from overlay to primary. |
| Multi-face / multi-screen control (paper requirement) | control | Face Controller | **Gap → add** | Paper explicitly calls for one rig controlling many faces and many screens. Not clearly present today; design in. |
| Speech / TTS / visemes (`panels/SpeechPanel`, `useSpeech*`, `useConversation`, `data/pollyVoices`, `services/polly|deepgram|openai`, `lib/visemeMapping`) | `c` (visemes) | Face Controller | **Keep, scope carefully** | Strong demo capability and tied to the paper's viseme standard. But it pulls in external API config (Polly/Deepgram/OpenAI). Keep as an optional Controller module, not core chrome. |

### Import / export / asset & bundle management

| Feature | Pipeline | Target interface | Verdict | Notes |
| --- | --- | --- | --- | --- |
| GLB import (file + presets: Quori, Toasty, `facePresetAssets`) | all | shell/global | **Keep** | Entry point. Presets are good onboarding. |
| Vizij bundle export with embedded rig graphs (`useVizijExport`, `ExportDialog`, `ExportPanel`, `RigGraphExportPanel`) | all | shell/global | **Keep** | The unifying artifact format. Reuse engine logic. |
| Bundle audit / summary (`VizijBundleAuditPanel`, `VizijBundleSummaryPanel`, `useBundleAudit`) | all | shell (advanced) | **Simplify** | Useful validation; demote to an advanced/diagnostics affordance. |
| RobotData audit (`RobotDataAuditPanel`, `useRobotDataAuditRunner`, `robotDataAudit`) | all | debug | **Cut from default** | Diagnostics born from the reference-face investigation. Keep as opt-in debug, not a first-class panel. |
| Discrepancy wizard (`discrepancy/DiscrepancyWizard`, `useDiscrepancyReview`) | all | shell (advanced) | **Simplify** | Import-time reconciliation. Keep the safety, streamline the flow. |
| Orientation confirmation dialog (`OrientationConfirmationDialog`, `importOrientation`) | `d` | Face Designer | **Keep** | Small, necessary import-time correctness step. |
| Graph import / diagnostics (`GraphImportPanel`, `GraphDiagnosticsPanel`) | rig | Rig Designer (advanced) | **Simplify** | Fold diagnostics into the Rig Designer; demote from standalone panel. |

### Cross-cutting / chrome

| Feature | Verdict | Notes |
| --- | --- | --- |
| Workbench tab system (`workbenchConfig`) | **Replace** | Replaced by the three-interface shell. |
| 13-panel workspace store + show/hide (`workspaceStore`, `WorkspaceLayout`) | **Replace** | Replaced by per-interface layouts with progressive disclosure. |
| Inspector (`inspector/*`, `InspectorContent` 5,547 lines) | **Simplify (hard split)** | One inspector trying to serve scene/material/binding/pose/variable selection. Split per interface. |
| Debug panel + memory investigation (`panels/DebugPanel`, `debug/memoryInvestigation`) | **Cut from default** | Dev-only; gate behind a flag. |
| Theme toggle, UI primitives (`components/ui/*`) | **Keep + harvest** | ~40 primitives (Button, Card, Select, Slider, Modal, Tabs, Tree…). **These are the seed of the Figma component library** (Workstream 5 / Code Connect). |

## Cross-cutting findings

1. **Two rig-authoring models coexist** — the `poseRig` store/services and the
   `motiongraph` editor store. The rebuilt Rig Designer should present **one** model.
   This is the highest-leverage simplification.
2. **`App.tsx` is an orchestration god-object** (5,298 lines) holding animation targets,
   procedural targets, bundle overrides, face-creator mutation logic, runtime export
   snapshots, and session lifecycle. The rebuild's app shell must push this into small,
   per-interface stores backed by `@vizij/*`.
3. **The reference-face runtime is the dominant bug source** (`next_steps.md`). Treat its
   rebuild as a clean re-implementation against the engine, not a port.
4. **The UI primitive library (`components/ui/*`) is an asset.** ~40 components ready to
   become the shared design system and the basis for the Figma port.
5. **Likely gaps vs. the paper to design in:** multi-face/multi-screen control; explicit
   video / high-FPS animation export; a clear "Developer API" testing affordance.

## Suggested keep/simplify/cut summary

- **Keep (carry forward):** Face Creator, timeline + transport, viewer, GLB import +
  bundle export, Blender round-trip, morph/transform editing, UI primitive library,
  pose-graph remap, standard-input coverage.
- **Simplify (redesign UX, keep capability):** binding/expression authoring, the
  node-graph editor (promote to Rig Designer spine), pose rig (unify with node graph),
  Standard Feature Spaces flow, scene hierarchy (component-centric), inspector (split),
  speech (optional module), reference-face preview (clean rebuild), bundle/discrepancy/
  graph diagnostics (demote to advanced).
- **Cut from default (debug/flagged or out-of-tool):** RobotData audit, debug + memory
  panels, the 4-workbench + 13-panel chrome, the `App.tsx` orchestration pattern.
- **Gaps to add:** multi-face/multi-screen control, video/high-FPS export, Developer API
  testing surface.

> Open question for review: should the Rig Designer present poses and node-graphs as a
> single unified model from day one, or ship node-graph-first with poses as a later mode?
> This affects Workstream 4 (IA) and Workstream 7 (architecture).
