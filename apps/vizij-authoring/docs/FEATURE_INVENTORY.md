# Vizij Authoring — Feature & Capability Inventory

Last updated: 2026-07-15

This document is an exhaustive catalog of everything the `vizij-authoring` tool
(`apps/vizij-authoring/`) can do today — user-facing features, the concrete code that
implements each, and the underlying architecture (WASM engines, data-model schemas, state
stores) and known gaps. Paths are relative to `apps/vizij-authoring/` unless noted.

## What the tool is

vizij-authoring is a browser-based tool for authoring/"rigging" animated robot **faces**
(avatars) and exporting them as round-trippable Vizij **GLB bundles**. You load a 3D face,
inspect and wire up its controls, author poses / keyframe animations / procedural
node-graph programs / conversational speech behavior against it, validate against the real
runtime, and export.

Two defining properties:

- **Runtime-truthful.** The app runs the same Rust→WASM engines that downstream consumers
  use. What you author is evaluated by the production runtime, so the live preview is
  faithful, not an approximation.
- **No persisted project; GLB is the document.** There is no project database or save file.
  The working document is the in-memory Vizij scene store plus the bundle data embedded in
  the scene. "Save" and "Save As…" both route to the GLB export flow.

**Stack:** React 19, Zustand, ReactFlow 11 (node graph), Three.js 0.170, Radix/Base UI,
Tailwind 4, Vite. Single-page IDE-style workspace (not URL-routed). Deployed to Firebase
Hosting (target `vizij-workspace`).

**Entry points:** `src/main.tsx` → `src/App.tsx` (~4,600 lines, the central orchestrator).

---

## 1. Application shell, layout & navigation

- **Resizable multi-pane workspace** — left sidebar (stacked panels) / center viewport /
  bottom panel / right sidebar, all draggable (`react-resizable-panels`).
  `src/layouts/WorkspaceLayout.tsx`
- **Menu bar** — File / Edit / Mode / View / Settings, plus a dirty-state Save button and
  theme toggle. Settings include rotation display (degrees/radians), selection highlight,
  and dark mode. `src/components/app/AppMenuBar.tsx`
- **Panel-visibility store (Zustand)** — governs which of 13 panels are shown (hierarchy,
  variables, poses, inputs, motiongraphPalette, inspector, speech, debug, animation,
  motiongraph, toolbar, referenceFace, materials); enforces "exclusive center panel"
  (Animation / Program / Reference Face are mutually exclusive in the center).
  `src/state/workspaceStore.ts`
- **Light/Dark theme** — persisted to `localStorage` (`vizij-theme`).
  `src/state/themeStore.ts`, `src/components/ui/ThemeToggle.tsx`
- **Six "Edit Focus" modes** — auto-configure the panel layout: `default`, `pose-creation`,
  `pose-editing`, `animation`, `procedural-animation-programming`, `reference-face`.
  `src/state/AuthoringUiProvider.tsx`, `src/state/editFocusPanels.ts`
- **Workbench tabs** (in the Import/Export flow) — Import/Export, Rigging (scene-composer),
  Posing (pose-rig), Standard Feature Spaces. `src/components/app/workbenchConfig.ts`
- **Onboarding / instructional guides** per workbench.
  `src/components/app/workbenchGuides.tsx`, `src/components/common/InstructionCallout.tsx`
- **Reusable UI kit** — Button, Slider, NumberField, Modal, Tabs, Combobox, TreeRow, Switch,
  Checkbox, MenuBar, Tooltip, Card, Badge, Chip, EmptyState, and more.
  `src/components/ui/*`

---

## 2. Import

- **GLB/glTF scene load** — the main asset load, plus an "Import (Skip Checks)" variant that
  bypasses discrepancy validation. Supports high-poly GLBs exported from Vizij or other DCC
  tools. `src/hooks/useVizijAssetLoader.ts`, `src/components/app/AssetLoaderPanel.tsx`
- **Preset robot faces** — bundled sample faces fetched from `/assets/*.glb`. Preset library:
  **Quori** and **Toasty** (each with Blender-Export / Current / Extended variants). Hugo GLBs
  also ship in `public/assets/` (`Hugo_*.glb`). `src/components/app/facePresetAssets.ts`
- **Reference-face import** — load a second GLB to compare/retarget side-by-side.
  `src/components/app/ReferenceFacePanel.tsx`, `ReferenceFaceRuntime.tsx`
- **Rig-graph JSON import** — optional `.graph.json` imported alongside the GLB.
  `src/components/app/GraphImportPanel.tsx`, `src/utils/graphImport.ts`
- **Pose graph / pose config / pose IR JSON import** — via the advanced export/import dialog;
  pose-graph imports trigger a remap wizard. `src/hooks/usePoseGraphImport.ts`,
  `src/hooks/useVizijExport.ts` (`importPoseConfigFile`, `importPoseIrFile`)
- **Weighted multi-phase load progress** — load-asset, validate-root, bundle-sync,
  rig-import-normalization, pose-graph-bootstrap, runtime-stabilization.
  `src/components/app/FaceLoadingProgressBar.tsx`
- **Orientation confirmation dialog** — on import, prompts to confirm/correct root rotation
  (quarter-turn corrections). `src/components/app/OrientationConfirmationDialog.tsx`,
  `importOrientation.ts`
- **Import discrepancy wizard** — reconciles differences between imported data and the
  rebuilt rig, with semantic-risk guidance.
  `src/components/discrepancy/DiscrepancyWizard.tsx`, `src/hooks/useDiscrepancyReview.ts`

---

## 3. Export / Save

Central dialog: `src/components/app/ExportDialog.tsx`; logic in `src/hooks/useVizijExport.ts`.

- **Bundled-GLB export** — `.glb` with an embedded, round-trippable `VIZIJ_bundle`
  (rig graphs + IR, pose configs, pose graphs, stored animation clips, motion graphs, speech
  config, metadata). `src/components/app/ExportPanel.tsx`, `src/utils/runtimeBundle.ts`
- **Export toggles** — embed Vizij bundle on/off; preserve imported animations on/off;
  pose-group blend mode (average/additive); cross-group blend mode (average/additive).
- **Advanced / legacy JSON exports** — rig graph spec + `.ir.json`; pose graph file; pose
  config file; pose IR file. `src/components/app/RigGraphExportPanel.tsx`,
  `PoseRigPanels.tsx`
- **Pre-export validation / audits that can block export** — rig-graph fatal issues,
  GraphSpec normalization, pose-graph validation, bundle-contract audits (IR-match, missing
  runtime targets). `src/utils/bundleAudit.ts`, `robotDataAudit.ts`
- **Dirty-state Save button** — highlights when there are unsaved changes.
  `src/hooks/useExportDirtyState.ts`, `useBundleSynchronizer.ts`
- **Download helpers** — `src/utils/download.ts`, `fileIO.ts` (`downloadJsonFile`,
  `ensureExtension`).

---

## 4. Keyframe animation editor

- **Transport controls** — play / pause / stop / step, loop toggle, play-speed (0.5×–2×),
  seconds/frames time display (32 fps), live playback clock.
  `src/components/panels/AnimationPanel.tsx`
- **Timeline editor** — scrubbable time ruler, playhead, per-track lanes; double-click to add
  a keyframe; ticks in seconds or frames. `src/components/animation/TimelineEditor.tsx`
- **Track rows with draggable keyframes** — click to select, pointer-drag to retime; shows
  interpolation + keyframe count. `src/components/animation/TrackRow.tsx`
- **Add-track modal** — searchable input catalog (only editable/selectable rig inputs);
  prevents duplicates. `src/components/panels/inputCatalog.ts`
- **Animation store (Zustand)** — add/remove tracks, add/update/remove keyframes, upsert from
  live input values, per-track interpolation (**linear / step / cubic**), per-keyframe
  interpolation overrides, duration, loop, speed, clip-IR import/export, runtime transport
  sync. `src/state/animationStore.ts`
- **Clip IR compiler + curve sampling** — `src/utils/animationClipCompiler.ts`,
  `src/types/animationClipIr.ts` (`AnimationClipIR` schemaVersion 1).
- **Multiple clips** — multiple authored clips managed as "targets," plus imported-from-bundle
  clips (name/duration overrides, hide toggles). `src/App.tsx`
- **Runtime transport bridge** — drives the live face during playback (orchestrator-backed).
  `src/hooks/useAnimationTransport.ts`

---

## 5. Procedural motion-graph editor ("Program")

Built on ReactFlow/xyflow. Directory: `src/motiongraph/`.

- **Graph canvas** — pan/zoom, minimap, background grid, auto-fit, drag-from-palette node
  creation, typed edges with compatibility validation, double-click edge to delete,
  multi-select (Shift), delete (Backspace/Delete), **copy/paste nodes (Ctrl/Cmd+C/V)** with
  edge remapping, collapsible port-type legend. `src/motiongraph/components/EditorCanvas.tsx`
- **Node palette** — registry-driven categories, search filter, expand/collapse all,
  drag-to-canvas, node docs/tooltips. `src/motiongraph/components/NodePalette.tsx`,
  `contexts/RegistryProvider.tsx`
- **Node types** — dynamically generated from the WASM node-graph registry; special Input
  Source and Output Target nodes. `GraphNode.tsx`, `InputSourceNode.tsx`,
  `OutputTargetNode.tsx`
- **Inspectors & IO sets** — node inspector, input-source inspector, Input Sets / Output Sets
  panels (choose which rig inputs/outputs are exposed as graph IO). `MgNodeInspector.tsx`,
  `InputSourceInspector.tsx`, `InputSetsPanel.tsx`, `OutputSetsPanel.tsx`
- **Live value inspection** — output value chart + value sampler. `OutputValueChart.tsx`,
  `MotionGraphValueSampler.tsx`
- **Port coloring & connection validation** — `utils/portColors.ts`, `connectionValidation.ts`
- **Editor store** — nodes/edges/enabledInputs/enabledOutputs/customInputPaths; hydrate/
  snapshot/clear. `src/motiongraph/store/useEditorStore.ts`
- **Spec ↔ editor-state conversion** — `utils/buildGraphSpec.ts`, `specToEditorState.ts`
- **Program playback** — Play/Pause/Stop driving the runtime; horizontal/vertical split of
  viewport + editor. `src/motiongraph/MotionGraphPanel.tsx`, `MotionGraphDriverBridge.tsx`,
  `src/hooks/useGraphPlaybackControls.ts`
- **Multiple programs** — authored programs as targets, plus programs imported from the
  bundle (`kind: "motiongraph"`).

---

## 6. Pose rig authoring (Posing)

Core API in `src/poseRig/usePoseRigAuthoring.ts`:

- **Poses** — create, duplicate, delete, rename, edit description, create-from-snapshot,
  **capture** from current values, apply, per-input value editing, add/remove pose inputs,
  per-input compose mode (add/average).
- **Neutral pose** — capture neutral, apply neutral; neutral mode face-default/explicit.
- **Pose groups** — create, rename, delete, set group blend mode, set group neutral source,
  add/remove membership, batch updates.
- **Blend stages** — create, rename, set blend mode, delete, set sources, set neutral source
  (an ordered compositing pipeline with topology validation).
- **Rig config** — rig kind (generic/face-specific), rig name, blend mode + cross-group blend
  mode.
- **Live value editing** — `updateCurrentValue` drives the runtime face.
- **Store & services** — `src/poseRig/store.tsx`,
  `poseRig/services/{poseConfigService,poseGraphService,poseIrService,poseSnapshotService}.ts`,
  `graphBuilder.ts`, `graphParser.ts`, `graphTransforms.ts`, `groupMembership.ts`.
- **Pose graph remap wizard** — maps imported pose-graph inputs onto the current rig.
  `src/components/poseRig/PoseGraphRemapWizard.tsx`
- **Pose diagnostics** — errors/warnings/info surfaced in the inspector.

---

## 7. Inspector (right sidebar)

`src/components/inspector/InspectorPanel.tsx` + `InspectorContent.tsx`. Four modes —
**scene object, rig driver, pose, material**:

- **Rig driver editing** — value slider + numeric field (Min/Def/Max quick buttons), edit
  default value, range min/max, driver path, degrees/radians display, lock/unlock, delete
  custom driver, rename.
- **Transform editing** — Position / Rotation / Scale rows.
  `RiggingTransformSection.tsx`
- **Material editing** — color (picker via `react-colorful`), opacity, label, create/assign.
  `RiggingMaterialSection.tsx`, `MaterialEditor.tsx`
- **Morph targets** — per-target rows, lock/unlock all. `RiggingMorphTargetsSection.tsx`
- **Binding editor & connections** — parent/child driver links, expressions, pipeline stages,
  connections graph, legacy-binding migration. `src/components/binding/BindingEditor.tsx`,
  `BindingConnections.tsx`, `VariablePipelineStages.tsx`, `pipelineStages.ts`,
  `rigConnections.ts`
- **Pose inspection** — grouped pose variables, target vs. current-pose value sliders,
  pose-weight preview/blend, compose-mode toggle, driven-property/variable counts.
- **Reference-face scope tabs** — Main Face / Reference Face / Both Faces (combined slider) for
  comparing and co-driving two faces.
- **Expression editor + diagnostics** — compiled equation with validation (arithmetic +
  comparison/boolean operators). `src/utils/bindingExpressions.ts`, `pipelineStages.ts`
- **Chain/breadcrumb navigation** — traverse between connected entities (Pose ↔ Rig ↔
  PropsRig ↔ Animatable). `inspectorChainPath.ts`

---

## 8. Left-sidebar authoring surfaces

- **Hierarchy / Face Elements** — tree + viewport-synced selection, filter, duplicate/move/
  delete selection, "Apply Smart Transform Locks," selection-glow toggle.
  `src/components/panels/HierarchyPanel.tsx`
- **Scene-composer hierarchy** — searchable tree, expand/collapse, reparenting.
  `src/components/scene-composer/SceneHierarchyPanel.tsx`, `SceneSelectionDetails.tsx`,
  `src/scene/useSceneComposer.ts`
- **Variables / Authoring surfaces** — Drivers / Poses / Pose Groups / Animations / Programs /
  Inputs surfaces: searchable tree, add/duplicate/delete, sliders, keyframe insertion into
  the timeline, pose-group management, reference-face variable/pose copy proposals.
  `src/components/panels/VariablesPanel.tsx`, `AuthoringTargetList.tsx`,
  `variablesSurfaceOrder.ts`
- **Materials panel** — manage shared materials, filter, create.
  `src/components/panels/MaterialsPanel.tsx`
- **Inputs panel / input catalog** — browse standard rig inputs.
  `src/components/panels/inputCatalog.ts`, `src/hooks/useManagedStandardInputs.ts`

---

## 9. 3D viewport / runtime & preview

- **Live 3D face runtime** — rendered via `@vizij/runtime-react` + `@vizij/render` (Three.js),
  with the orchestrator driving inputs. `src/components/app/Viewer.tsx`
- **Selection highlighting / glow** — toggle; viewport ↔ inspector selection bridge.
- **Runtime face controls overlay** — in-viewport Play/Pause.
  `RuntimeFaceControlsOverlay.tsx`, `RuntimeFaceFrame.tsx`
- **Runtime source toolbar** — choose which authored system (poses / animation clip / program
  / speech) drives live runtime inputs; create/select runtime targets; Play/Pause/Stop; name
  clips. `RuntimeSourceToolbar.tsx`
- **Empty-state interactive demo** — idle/mouse gaze tracking + emotion/voice demo rows shown
  before a face is loaded. `src/components/app/emptyStateDemo/*` (`EmptyStateDemo.tsx`,
  `DemoEmotionRow.tsx`, `DemoVoicePanel.tsx`, `useDemoIdleGaze.ts`, `useDemoMouseGaze.ts`)
- **Reference-face runtime** — side-by-side (split horizontal/vertical) on its own runtime
  instance, stepped only while visible. `src/components/app/ReferenceFaceRuntime.tsx`

---

## 10. Speech & conversational avatar

`src/components/panels/SpeechPanel.tsx` plus hooks:

- **Text-to-speech** — AWS Polly (voice picker from `src/data/pollyVoices.ts`) with
  **viseme/lip-sync** driving the face. `src/hooks/useSpeechPlayback.ts`,
  `src/lib/visemeMapping.ts`, `src/services/pollyApi.ts`
- **Two modes** — Echo (mic → avatar repeats) and Conversation (mic → LLM → avatar responds).
- **Speech recognition** — Deepgram push-to-talk STT. `src/hooks/useSpeechRecognition.ts`,
  `src/services/deepgramConfig.ts`
- **LLM conversation** — OpenAI (default `gpt-4o-mini`) with system prompt, agent name,
  history, and emotion-tagged JSON responses that trigger emotion poses.
  `src/hooks/useConversation.ts`, `src/services/openaiConfig.ts`
- **PAP input mapping** — configurable `/speech/speaking`, `/speech/user_speaking`,
  `/speech/thinking` paths + emotion/viseme input groups, auto-provisioned into the rig.
- **Config persistence** — API keys/settings in `localStorage`; all speech config is embedded
  into the exported bundle (`collectSpeechConfigFromLocalStorage`).

---

## 11. Standard Feature Spaces (mapping)

Map a loaded model's inputs onto a standardized feature-space schema for cross-face interop.
Path shape: `/standard/{namespace}/{channel}/{track}/{attribute}` (e.g.
`/standard/semio/left_eye/pos/x`).

- **Editor / controls** — `src/components/app/StdFeatureSpacesEditor.tsx`,
  `StdFeatureSpacesControls.tsx`, `StdFeatureSpacesMappingEditor.tsx` (Setup / Channels /
  Mapping tabs).
- **Standard channels panel** — view/edit channel hierarchy, search, mismatch filter, add
  namespaces/channels with min/max ranges. `StdFeatureSpacesChannelsPanel.tsx`
- **Coverage panel** — track which standard inputs are mapped to scene properties.
  `StandardInputCoveragePanel.tsx`
- **Remap / resolution utilities** — `src/utils/standardInput*.ts` (`standardInputPaths`,
  `standardInputBindings`, `standardInputRemap`, `standardInputResolutionIndex`).
- **Reference catalog & mapping** — `src/referenceFace/{mapping,referenceCatalog,types}.ts`.

---

## 12. Diagnostics, audits & debug

- **Debug panel** — monitor runtime status, playback, rig health; frame-step/stop.
  `src/components/panels/DebugPanel.tsx`
- **Graph diagnostics panel** — search issues by id/message, download IR graph, open
  inspector, paste/parse saved machine-report JSON. `src/components/app/GraphDiagnosticsPanel.tsx`,
  `src/utils/graphDiff.ts`
- **RobotData audit** — nodes without RobotData, missing animatables, feature drift.
  `src/components/app/RobotDataAuditPanel.tsx`, `src/hooks/useRobotDataAuditRunner.ts`,
  `src/utils/robotDataAudit.ts`, `rigRoundtripAudit.ts`
- **Bundle audit / summary** — inspect embedded bundle contents (graph/pose/animation counts,
  metadata). `src/components/app/VizijBundleAuditPanel.tsx`, `VizijBundleSummaryPanel.tsx`,
  `src/hooks/useBundleAudit.ts`
- **Memory-investigation harness** — debug/perf mode that can bypass the runtime.
  `src/debug/memoryInvestigation.ts`, `src/App.tsx` (`MemoryDebugBridge`)

---

## 13. Architecture & WASM engines

Four Rust→WASM engines back the stack (excluded from Vite `optimizeDeps` in `vite.config.ts`):

1. **`@vizij/node-graph-wasm`** — node-graph evaluation; `GraphSpec`/`NodeSpec` format +
   `normalizeGraphSpec`.
2. **`@vizij/animation-wasm`** — keyframe animation playback (backs the transport adapter).
3. **`@vizij/orchestrator-wasm`** — controller orchestration/sequencing.
4. **`@vizij/arora-web-wasm`** — the Arora device runtime that `@vizij/runtime-react` composes
   rig + pose + program graphs into and steps.

WASM requires **cross-origin isolation**: COOP `same-origin` + COEP `require-corp` headers,
set in `vite.config.ts` (dev) and `firebase.json` (prod).

**Provider tree** (`src/App.tsx`): `VizijContext` (from `main.tsx`) →
`RigControllerProvider` → `PoseRigProvider` → `AuthoringUiProvider` → `RegistryProvider`
(motion-graph node schemas). The reference face wraps its own `ReferenceFaceProvider` +
`SharedVariableSyncProvider`.

Note: rig and pose are **distinct** GraphSpecs (not merged) — the bundle carries separate
rig-graph payload, pose-graph payload, pose config, and pose IR + diagnostics
(see `docs/ARCHITECTURE.md`).

---

## 14. Internal `@vizij` dependency map

| Package                       | Kind       | Capability it powers                                                                                                                                                                                                                               |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vizij/utils`                | workspace  | Core value/type vocabulary: `AnimatableNumber/Color/…`, `StandardRigInput`, `RawValue`, namespace helpers, id helpers. The shared type layer every layer agrees on.                                                                                |
| `@vizij/node-graph-authoring` | workspace  | Authoring-time compiler: `buildRigGraphSpec`, `compileIrGraph`, `bindingToDefinition`, `createDefaultBinding`; `BindingMap`, `IrGraph`, `MachineReport`. Turns authored bindings/expressions into GraphSpec + IR; ships the `vizij-ir-report` CLI. |
| `@vizij/render`               | workspace  | Renderer + scene store: `createVizijStore`/`VizijContext`/`useVizijStore*` (Zustand `world`/`animatables`/`values`), `loadGLTFFromBlobWithBundle`, `exportScene`; types `World`, `Feature`, `VizijBundleExtension`.                                |
| `@vizij/node-graph-wasm`      | npm (WASM) | Canonical graph spec format + normalization for rig/pose/motion graphs.                                                                                                                                                                            |
| `@vizij/runtime-react`        | workspace  | Bundle-first, runtime-truthful core: `VizijRuntimeProvider`, `VizijRuntimeFace`, `useVizijRuntime`, `useAnimationTransport`, `useMotionGraphNamespace`, `useSpeechPlayback`; `setGraphBundle()` hot-swap, `transformOutputWrite()` output remap.   |
| `@vizij/orchestrator-react`   | workspace  | `OrchestratorProvider`, `useOrchestrator` over `@vizij/orchestrator-wasm`.                                                                                                                                                                         |
| `@vizij/node-graph-react`     | workspace  | `init()` (WASM init) + `getNodeSchemas()` (palette catalog).                                                                                                                                                                                       |
| `@vizij/value-json`           | npm        | JSON (de)serialization for the Vizij value type.                                                                                                                                                                                                   |
| `@deepgram/sdk`               | npm        | Deepgram STT SDK for the Speech panel.                                                                                                                                                                                                             |

Local Vite alias (not an npm package): **`@vizij/authoring-shared` → `src/shared/index.ts`**,
re-exporting `useDialogQueue`, `useBundleAudit`, `usePoseGraphImport`, `useVizijExport`,
`useGraphPlaybackControls`, `fileIO`, `standardInputPaths`.

---

## 15. Data model / authored-entity schemas

- **Rig / bindings** — `src/state/bindingAuthoringStore.tsx` (`bindings`, `inputBindings`,
  `standardInputs`, `managedStandardInputs`, `animatableComponents`, `pipelineMetadataV1`,
  binding issues), `src/rig/*` (`importer.ts`, `autoInputs.ts`, `legacyMigration.ts`,
  `persistence.ts`, `driverAdapters.ts`), compiled via `src/hooks/rigController/rigGraphCompiler.ts`.
- **Standard inputs** — `src/types/standardInputs.ts` (`ManagedStandardInput`,
  `source: "auto"|"custom"`), `src/utils/standardInput*.ts`.
- **Poses & pose groups** — `src/poseRig/types.ts`: `PoseDefinition`, `PoseGroupDefinition`,
  `PoseRigConfigFile` (`POSE_RIG_CONFIG_VERSION = 1`), `PoseRigIrFile`
  (`POSE_RIG_IR_VERSION = 1`), blend modes (average/additive/add), cross-group override modes
  incl. `priority` with tie-break, neutral modes (face-default/explicit) + scoped neutral
  (inherit/pose-reference/direct-values), `PoseIrBlendStageDefinition`, `PoseDiagnostic`.
- **Animation clips** — `src/types/animationClipIr.ts`: `AnimationClipIR` (schemaVersion 1,
  `duration`, `tracks`), keyframe interpolation linear/step/cubic + in/out tangents.
- **Programs** — `src/motiongraph/store/useEditorStore.ts` (nodes/edges/enabledInputs/
  enabledOutputs/customInputPaths).
- **Scene / materials** — `src/scene/sceneGraph.ts` (`SceneObjectNode`), `sceneEditing.ts`,
  `featureEntries.ts`, `featureMutations.ts`.
- **Reference face** — `src/referenceFace/types.ts` (`ReferenceCatalogInput`, pipeline links,
  mapping status/confidence, merge decisions).
- **Bundle payload** — `src/types/bundle.ts` (`BundleGraphWithIr`).
- **Discrepancy diff** — `src/types/discrepancy.ts` (`GraphDiffEntry`, `GraphDiffResult`,
  `DiscrepancyReviewState`).

**Canonical paths:** pose weight `rig/{face}/poses/{poseId}.weight`; pose control
`rig/{face}/pose/control/{inputId}`; derived `/pose/groups/{id}.output`,
`/pose/stages/{id}.output`; standard input `/standard/{namespace}/{channel}/{track}/{attribute}`.

---

## 16. State management

Two coexisting patterns:

**Zustand global stores (`create`)**

- `src/state/workspaceStore.ts` — panel visibility/ordering + exclusive-center logic.
- `src/state/animationStore.ts` — timeline authoring + transport.
- `src/state/themeStore.ts` — theme, persisted to `localStorage`.
- `src/motiongraph/store/useEditorStore.ts` — reactflow program editor state.

**Context + `useSyncExternalStore` (provider-scoped, reset per loaded face)**

- `src/state/RigControllerProvider.tsx` → `useBindingAuthoring` (`bindingAuthoringStore.tsx`)
  and `useGraphRuntime` (`graphRuntimeStore.tsx` — compiled `graphSpec`, `poseGraphSpec`,
  `poseConfig`, world/animatables/values mirror, status/errors, `graphMachineReport`,
  `discrepancyReview`).
- `src/state/PoseRigProvider.tsx` → `usePoseRig`.
- `src/state/AuthoringUiProvider.tsx` → `useAuthoringUiState` / `useAuthoringUiActions`.
- `src/state/selectionStore.tsx` — unified selection stack.
- `src/state/ReferenceFaceContext.tsx`, `SharedVariableSyncContext.tsx` — reference-face state
  - main↔reference variable mirroring.

The renderer's own store (`createVizijStore()` from `@vizij/render`) is created in
`src/main.tsx` and provided via `VizijContext`.

---

## 17. Persistence

- **No scene/project persistence.** The working document is the in-memory Vizij store + the
  exported GLB bundle, which is the durable artifact.
- **`localStorage` is used only for:** speech settings/keys (`SpeechPanel.tsx`,
  `deepgramConfig.ts`, `openaiConfig.ts`), theme (`themeStore.ts`), a rig persistence helper
  (`src/rig/persistence.ts`), and hierarchy expand/collapse state
  (`src/components/scene-composer/useHierarchyTreeState.ts`).
- Firebase is static hosting only — no server database.

---

## 18. Known gaps / caveats

- **Undo/Redo are non-functional stubs** — the Edit-menu items render but do nothing
  (`src/components/app/AppMenuBar.tsx:180-181`). The motion-graph editor has its own
  Ctrl/Cmd+C/V copy-paste, but there is no global history.
- **Standard Feature Spaces export is "coming soon"** — explicitly labeled in
  `src/components/app/StdFeatureSpacesEditor.tsx:135`.
- **`docs/references/ui-component-inventory.md` is partly stale** (dated 2025-11-20; references
  some renamed/removed files).
- **Stray file** — `src/layouts/temp.txt` exists in the tree; not load-bearing.
- **"Save" and "Save As…" both route to the export flow** — there is no separate save format.

---

## 19. Testing & build

- **Unit tests** — vitest, colocated (`src/**/__tests__`, `*.test.ts(x)`); plus a
  VariablesPanel perf baseline (`perf:inputs-baseline`).
- **E2E** — Playwright (`e2e/`): smoke + workflow + memory-investigation projects
  (`test:e2e`, `test:e2e:smoke`, `test:e2e:debug`, `test:e2e:memory:*`).
- **Scripts** — `dev`, `build`, `preview`, `typecheck`, `lint`/`lint:fix`, `validate`
  (lint + typecheck + test), `prettier:*`, `clean`, `reset`/`reset:hard`.
- **Deploy** — Firebase Hosting, target `vizij-workspace`, serving `dist/`
  (`firebase.json`, `.firebaserc`).

---

## Source docs

- `docs/ARCHITECTURE.md` — system boundaries, compile/runtime invariants, path/identity contracts.
- `docs/UI_DESIGN.md` — UI behavior contract for authoring workflows.
- `docs/Authoring_Blueprint.md` — layer and namespace contract.
- `README.md` (app root) — overview and core workflows.
