# vizij-authoring on `@vizij/render` 1.0 and `@vizij/runtime-react` 1.0: plan

**Status: proposed** — decisions in section 5 await Victor. Ticket:
[VIZ-148](https://linear.app/semio-ai/issue/VIZ-148). The packages and their
design: `packages/@vizij/runtime-react/DESIGN-1.0.md`
([VIZ-147](https://linear.app/semio-ai/issue/VIZ-147), vizij-web
[#143](https://github.com/vizij-ai/vizij-web/pull/143),
[#144](https://github.com/vizij-ai/vizij-web/pull/144)). The runtime is
`@vizij/runtime` 6.0.0 (vizij-rs `npm/@vizij/runtime/README.md`). Line
references are to vizij-web `7128fa35` (the head of
[#152](https://github.com/vizij-ai/vizij-web/pull/152)); paths are under
`apps/vizij-authoring/src/` unless they say otherwise.

The authoring app keeps its document model — the `@vizij/render` zustand
store created in `main.tsx:21-26` — and stops rendering it. What the viewport
shows is a Vizij loaded from the bytes the headless exporter makes from that
document; what the app does to the face goes through the face's Arora API on
the `Runtime` that `useVizijRuntime()` hands out: its store (`setValue`,
`writeValues`, `readValues`, `listKeys`), its methods (`invoke`), its runs
(`run_behavior`, `halt`) and its graph (`loadGraph`, `applyGraphEdits`). No
function wraps a device call under a new name.

## 1. Every 0.4 call and its 1.0 or runtime-6 equivalent

Inventory: the TypeScript parser over every `import` of `@vizij/runtime-react`,
`@vizij/render` and `@vizij/runtime` in `apps/vizij-authoring/{src,e2e}` and
`apps/demo-graph-studio/src`, plus every context member the CI typecheck of
#152 rejects (181 errors). In the 1.0 column, `rt` is the context's `runtime`,
`d` its `description`, and `P(x)` is `rt.path(x)`.

### 1.1 Package versions

| Site                                                                                                     | 0.4                                                        | 1.0                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `../package.json:39`                                                                                     | `"@vizij/runtime": "^3.0.0"`                               | `^6.0.0`: the page resolves one copy, the one `@vizij/render` and `runtime-react` peer on |
| `hooks/useStandardProfiles.ts:2`                                                                         | `standardProfile`, `standardProfiles` (deprecated aliases) | `mapping`, `mappings`                                                                     |
| `hooks/useProfiles.ts:2`, `components/app/ProfileImportDialog.tsx:2`, `hooks/useSkills.ts:2`             | `profile`, `profiles`, `skills`, `skillSource`             | unchanged                                                                                 |
| `animationBake/graphEvaluatorDevice.ts:1`, `*.device.test.ts`, `../e2e/profile-edition.workflow.pw.ts:5` | `startRuntime`, `composeVizij`                             | unchanged                                                                                 |

### 1.2 Types that left `@vizij/runtime-react`

| Site                                                                                                                               | 0.4 type                                | 1.0                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `utils/runtimeBundle.ts:3-4,29-75`                                                                                                 | `VizijAssetBundle`, `PoseRigConfig`     | file deleted: the viewport's source is GLB bytes (section 2.1)                                 |
| `components/app/Viewer.tsx:2-5`, `ReferenceFaceRuntime.tsx:10`, `emptyStateDemo/EmptyStateDemo.tsx:3`, `DemoEmotionRow.test.tsx:4` | `VizijAssetBundle`                      | `VizijSource` (bytes, `File`, URL)                                                             |
| `state/graphRuntimeStore.tsx:8`                                                                                                    | `PoseRigConfig`                         | the app's own `PoseRigConfigFile` (`poseRig/types.ts`), which it already authors               |
| `hooks/useSpeechPlayback.ts:2`, `components/panels/SpeechPanel.tsx:116-117`                                                        | `PoseDefinition`, `PoseGroupDefinition` | the app's own `poseRig/types.ts` definitions (SpeechPanel already casts to them at `:229-232`) |
| `hooks/useAnimationTransport.ts:3`, `hooks/__tests__/comparableRuntimeAnimations.test.ts:2`                                        | `VizijAnimationAsset`                   | `Animation` from `@vizij/runtime` (`describe`'s shape, what `rt.moduleAnimation` takes)        |
| `components/app/runtimeOutputLocks.ts:1`, `runtimeOutputLocks.test.ts:3`                                                           | `RuntimeOutputWrite`                    | deleted with the write filter (`rt.hold`, section 1.3)                                         |
| `animationBake/bakeGraphSources.ts:1,26-48`                                                                                        | `GraphSource`                           | deleted: the bake composes with `composeVizij` (section 1.7)                                   |

### 1.3 The main face's viewport (`components/app/Viewer.tsx`)

| Site                                          | 0.4                                                                                                                           | 1.0                                                                                                                                                                                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `:766-771`, `App.tsx:4706-4715`               | `<VizijRuntimeProvider assetBundle={glb: {kind: "world"}} autostart onRegisterControllers transformOutputWrite>`              | `<VizijRuntimeProvider glb={bytes} vizijId="authoring-main" options={{ graphs: ["rig", "pose-driver", "pose"], program: "none" }}>`, its placement per decision B (section 5); `bytes` per section 2.1                                                                               |
| `:820-828`                                    | `<VizijRuntimeFace showSafeArea showSelectionGlow toneMapping onPointerMissed>`                                               | `<VizijRuntimeFace showSafeArea={faceBoundsOverlayVisible} selection={showSelectionGlow && selectedSceneId ? [selectedSceneId] : []} toneMapping bounds={authoredRootBounds} onPick>`                                                                                                |
| `:100-188` `RuntimeSelectionBridge`           | the provider's isolated render store's `elementSelection`, both ways, with pending-echo guards                                | deleted: `onPick={({ elementId }) => elementId ? onSelectScene(elementId) : onClearSelection()}`, and the selection goes back through the `selection` prop. No isolated store exists to synchronise                                                                                  |
| `:190-238` `RuntimeInputBridge`               | publishes `setInput` and `animateValue` closures, `ready`, `loading`, `rootId`, `outputPaths.length` into `graphRuntimeStore` | deleted under decision B; otherwise it publishes `rt` and `useAnimateValue()`'s `animateValue`, no closure around either                                                                                                                                                             |
| `:254-292` `FaceBoundsRuntimeBridge`, measure | `deriveRootBounds` over the provider store's mounted `refs`                                                                   | `deriveRootBounds(buildSceneGraph(world, animatables, rootId))` over the document (gap G2)                                                                                                                                                                                           |
| `:294-317` same, bounds push                  | writes authored `rootBounds` into the isolated store's world for the camera and safe area                                     | deleted: the `bounds` prop reaches `setView`                                                                                                                                                                                                                                         |
| `:322-387` `RuntimeExportBodyBridge`          | `refs`, `getExportableBodies` snapshots of mounted three.js groups                                                            | deleted: export is headless (section 1.6)                                                                                                                                                                                                                                            |
| `:396-430` `RuntimeInputCatalogBridge`        | `ready`, `inputConstraints`, `namespace` → `buildRuntimeInputCatalogFromConstraints`                                          | `d.rigInputs` (id, path, label, group, range, default) merged with `rt.listKeys(rt.rigPrefix)` for the composed graph's free inputs the rig does not declare (their `__meta` range and rest value); `runtimeInputsFromConstraints.ts` and its namespace stripper deleted             |
| `:432-475` `RuntimeGraphBridge`               | `setGraphBundle({ rig, pose }, { tier: "graphs" })` on every rig or pose graph change                                         | `rt.loadGraph(await composeVizij(document, { graphs: ["rig", "pose-driver", "pose"], program: "none" }))`, `document` being `{ asset: { version: "2.0" }, extensions: { VIZIJ_bundle: bundle } }` — no scene reload (section 2.1, G3)                                                |
| `:477-508` `RuntimeStatusDebug`               | `loading`, `ready`, `rootId`, `error`, `controllers`, `outputPaths`                                                           | `status`, `error`, `behaviorError`, `vizijId`, `d.graphs.length` plus the runs under `BEHAVIOR_RUNS`, `Object.keys(d.animatables).length` as the output count (the text `runtime: ready` and `outputs: N` that `e2e/helpers.ts:41` and `rig-state-gate.workflow.pw.ts:38` read stay) |
| `:515-564` `MotionGraphRuntimeBridge` reset   | `setInput(path, { float })` of App-computed `resetValues` on stop (`App.tsx:5016`)                                            | `rt.invoke("reset_keys", { keys: { strs: await outputKeys(graph) } })` on stop; the App's `activeProgramRuntimeResetValues` deleted                                                                                                                                                  |
| `:679-690`, `runtimeOutputLocks.ts:75-213`    | `transformOutputWrite` filtering each output write against the locked inspector targets                                       | `rt.hold(added)` / `rt.release(removed)` as `lockedInspectorTargetIds` changes: those ids are already `<animatableId>` and `<animatableId>:x…z`/`:r…b`, the forms `hold` takes. The index and merge logic deleted                                                                    |
| `:736-743`                                    | `onRegisterControllers` → `runtimeViewGraphCount`                                                                             | `d.graphs.length`                                                                                                                                                                                                                                                                    |
| `:657`, `:670-677`                            | `runtimeAnimatables` default as the lock's fallback value                                                                     | deleted: a hold keeps what shows                                                                                                                                                                                                                                                     |
| `:712-718` `handleResetInputs`                | `applyStandardInputBatch(defaults)`                                                                                           | `rt.invoke("reset_keys", { keys: { strs: inputs.map((i) => P(i.path)) } })` for the same managed, non-pose inputs; the authoring store's batch stays for the panels' own state                                                                                                       |

### 1.4 Shared face chrome

| Site                                        | 0.4                                               | 1.0                                                                                                             |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `components/app/RuntimeFaceFrame.tsx:28-34` | `ready`, `loading`, `stagePoseNeutral()` on ready | `status`, `error`; the staging deleted (`loadVizij`'s `stageNeutral`)                                           |
| `RuntimeFaceFrame.tsx:69`                   | `<VizijRuntimeFace showSafeArea={false}>`         | `<VizijRuntimeFace className>`                                                                                  |
| `RuntimeFaceFrame.tsx:80-121`               | badge from `ready`/`loading`/`error`              | from `status`/`error`; "Loading face…" only while `rt` is null, since a reload keeps the previous scene drawing |
| `RuntimeFaceControlsOverlay.tsx:46`         | `ready`, `loading`, `stepHz`                      | `status`; the FPS chip deleted (the device paces itself; no `stepHz`)                                           |

### 1.5 The reference face (`components/app/ReferenceFaceRuntime.tsx`)

| Site               | 0.4                                                                                      | 1.0                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `:60-64,228-239`   | bundle `{ namespace: "refface", glb: url aggressive, pose.stageNeutralFilter }`          | `glb={file}` (a `File` is a `Blob`); `stageNeutralFilter` deleted, authored defaults keep colours (DESIGN-1.0 section 8; G6)      |
| `:265-281`         | object URL per file                                                                      | deleted: the provider reads the `Blob`                                                                                            |
| `:303-307`         | `<VizijRuntimeProvider assetBundle autostart driveRuntime>`                              | `<VizijRuntimeProvider glb={file} options={{ graphs: ["rig", "pose-driver", "pose"], program: "none" }} run={visible}>`           |
| `:354-362`         | `ready`, `loading`, `setInput`, `inputConstraints`, `faceId`, `assetBundle`, `namespace` | `status`, `rt`, `d`                                                                                                               |
| `:71-176`          | namespace strippers, `buildRuntimeWritePathMap` scoring candidate paths                  | deleted: a rig input's key is `P(input.path)`                                                                                     |
| `:178-226,393-400` | override routes from `assetBundle.rig.spec` input nodes                                  | `rt.listKeys(P("override/"))`: the device lists `override/<id>/{enabled,value}` itself                                            |
| `:374-385`         | input catalogue from constraints                                                         | as the main face (1.3)                                                                                                            |
| `:418-470`         | `setInput(path, { float })` through the resolved route                                   | `rt.setValue(P(path), value)` (or the override pair through `rt.writeValues`, one step)                                           |
| `:477-486`         | `onBundleReady(assetBundle.bundle)`                                                      | `onBundleReady` from the app's own import of the file (`loadGLTFFromBlobWithBundle`), or `d.metadata` where only metadata is read |
| `:522-548`         | reset through `setInput`                                                                 | `rt.invoke("reset_keys", { keys: { strs } })` over the resettable inputs' keys and their `override/<id>/enabled`                  |

### 1.6 Export (`hooks/useVizijExport.ts`, `components/app/ExportDialog.tsx`)

| Site                                                          | 0.4                                                                                                                                                                                        | 1.0                                                                                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExportDialog.tsx:126-158,216-217`                            | `getExportableBodies` from the store or the viewport's snapshot, `exportSceneRoot` fallback                                                                                                | deleted: `useVizijExport` builds the scene                                                                                                            |
| `useVizijExport.ts:159,613,755-842`                           | candidate mounted bodies, 12 frame retries, the "fallback scene has no RobotData" guard                                                                                                    | `buildSceneGraph(world, animatablesForExport, rootId)` — headless, in Node too; the retries and the guard deleted                                     |
| `useVizijExport.ts:1241`                                      | `exportScene(exportableBodies[0], { bundle, animations })`                                                                                                                                 | `exportScene(buildSceneGraph(…), { bundle, animations })`                                                                                             |
| `useVizijExport.ts:628,737`, `utils/rigRoundtripAudit.ts:118` | `values.get(getLookup(exportFaceId, id))`, while scene editing writes `getLookup(DEFAULT_NAMESPACE, id)` (`scene/featureMutations.ts:35,101,147`, `scene/useSceneComposer.ts:237,788-793`) | one namespace: the export reads the document's values under the key scene editing writes them, so an inspector override reaches the exported defaults |
| `App.tsx:643,925-952,5025,5447`                               | `runtimeExportBodies` state and its handler                                                                                                                                                | deleted                                                                                                                                               |
| `components/panels/DebugPanel.tsx:99`                         | `refs` (mounted object count)                                                                                                                                                              | `memoryBytes()` and the face's `status`                                                                                                               |

### 1.7 Animation bake (`animationBake/*`, `useVizijExport.ts:1109-1160`)

| Site                                                      | 0.4                                                                  | 1.0                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useVizijExport.ts:1132`, `bakeStepCost.device.test.ts:6` | `composeGraphSpecs(collectBakeGraphSources(bundle))` (JS composer)   | `composeVizij({ asset, extensions: { VIZIJ_bundle: bundle } }, { graphs: ["rig", "pose-driver"], program: "none" })`: the device's composition, the one the exported face runs. `collectBakeGraphSources` deleted; `outputPathsOfSpec` stays (or `outputKeys(composed)`) |
| `useVizijExport.ts:1149-1154`                             | `collectInputPathMap(source.spec)` per source (input-node id → path) | deleted                                                                                                                                                                                                                                                                  |
| `bakeAuthoredClips.ts:2,181-194`                          | `resolveAnimationBridgeOutputPaths(channel, …, inputPathMap)`        | `bundleRigPrefix + track.channel` — how `moduleAnimation` keys a track for playback, so the bake and the timeline drive the same key; `inputPathMap` leaves the bake's options                                                                                           |
| `realBundleConventions.test.ts:5-8,123-153`               | the three JS helpers over the shipped bundles                        | `composeVizij` over each shipped GLB's JSON chunk (`parseGlbJsonChunk`), and every clip channel resolving to a key the composed spec declares as an input                                                                                                                |
| `bakeAuthoredClips.ts` `root` (`useVizijExport.ts:1156`)  | the mounted body, for binding validation                             | the same `buildSceneGraph` root the export writes                                                                                                                                                                                                                        |

`three` stays in `animationBake/*` and `scene/sceneEditing.ts`: clip
building and maths, not rendering.

### 1.8 The timeline (`hooks/useAnimationTransport.ts`)

| Site                                    | 0.4                                                                                                          | 1.0                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:133-152,483-500`                      | `rootId`, `assetBundle.animations`, `setGraphBundle({ animations })` on every clip change                    | the face's own animations are on players at load (`d.animations`, weight 0); the authored clip: `load_animation` of `rt.moduleAnimation(clip)` once per `Runtime`, `create_player` named after it, `add_instance_with_weight` 0; each edit `reload_animation` in place (playback stays) |
| `:345-367` transport façade             | `playAnimation`, `pauseAnimation`, `stopAnimation`, `seekAnimation`, `setAnimationLoop`, `getAnimationState` | `invoke("play" \| "pause" \| "stop" \| "seek" \| "set_loop" \| "set_speed" \| "set_weight", { player, … })`; the façade and `AnimationRuntimeTransportAdapter` deleted under decision B                                                                                                 |
| `:351,362,724,753`                      | `getAnimationState(id)` polled                                                                               | `decodePlayerStates(useVizijValues([ANIMATION_PLAYERS_PATH])[…])`, the player by name                                                                                                                                                                                                   |
| `:390-402`                              | `stopAnimation(id, { clearOutputs })` then `setInput(path, 0)` per authored output                           | `stop`, `set_weight` 0, `reset_keys` of `clip.tracks.map((t) => P(t.channel))`                                                                                                                                                                                                          |
| `:404-441`                              | `setAnimationActive(bool)`                                                                                   | `set_weight` 0 on every instance and `stop` (inactive), the authored weight back to 1 (active)                                                                                                                                                                                          |
| `:103-122` `muteAnimationClip`          | track-less clip copies pushed to mute                                                                        | deleted: weight 0 mutes                                                                                                                                                                                                                                                                 |
| `:588` `useAnimationTransport`          | `useOptionalVizijRuntime()` or the store's adapter                                                           | `useOptionalVizijRuntime()` (under decision B the panel sits inside the provider)                                                                                                                                                                                                       |
| `:30-65,432-435,469` signature rounding | compares the merged list against what the provider holds to latch `transportRuntimeReady`                    | ready once `load_animation` resolved on the current `Runtime`; the signature comparison deleted                                                                                                                                                                                         |

### 1.9 The motion-graph editor (`motiongraph/*`)

| Site                                                      | 0.4                                                                              | 1.0                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hooks/useMotionGraphDriver.ts:37-44,113-194`             | `setGraphBundle({ programs: [graph] })` on every spec change, then `playProgram` | first sync: `rt.invoke("run_behavior", { name: controllerId, behavior: await behaviorValue(spec) })`, keeping `{ run, spec }`; each later sync: `rt.applyGraphEdits(await runEdits(run, previousSpec, spec))`, so kept nodes keep their springs and smoothing |
| `useMotionGraphDriver.ts:199-212`                         | `getProgramState(id)`, replay after the provider re-registers                    | the run's status key (`runStatus(rt.readValues([handle.status])…)`); a new `Runtime` (a structural reload) starts a new run                                                                                                                                   |
| `useMotionGraphDriver.ts:122-158,259-277`                 | `stopProgram(id, { resetOutputs: false })`, `setGraphBundle({ programs: [] })`   | `rt.halt(run)`: outputs hold; the reset is the Viewer's explicit `reset_keys` on stop (1.3)                                                                                                                                                                   |
| `useMotionGraphDriver.ts:24-111` resync key, publish refs | guards against the provider's re-registration and context identity churn         | deleted: nothing re-registers; the key is the `Runtime`                                                                                                                                                                                                       |
| `MotionGraphDriverBridge.tsx:42-43`                       | `namespace`, `controllers`                                                       | `rt`                                                                                                                                                                                                                                                          |
| `utils/buildGraphSpec.ts:168,179`                         | `${namespace}/${outputPath}`, `${namespace}/${inputPath}`                        | `outputPath`, `inputPath`: the editor's paths are already the face's own (`rig/<faceId>/…`); the `namespace` parameter goes                                                                                                                                   |
| `components/InputValueBridge.tsx:33,77-82`                | `setInput(path, { bool })` / `{ float }`                                         | `rt.setValue(path, { bool })` / a number                                                                                                                                                                                                                      |
| `components/MotionGraphValueSampler.tsx:24-86`            | `subscribeToStep` + `getValueSnapshot` with namespaced candidates                | `useVizijChanges(batch => …)` over the output nodes' paths; one candidate path each                                                                                                                                                                           |
| `hooks/useMotionGraphNamespace.ts:101-208`                | `assetBundle.bundle.graphs`, `assetBundle.rig.spec`, `inputConstraints`          | deleted: nothing imports it                                                                                                                                                                                                                                   |

Pause is a halt, resume a new spawn, reset explicit
([VIZ-167](https://linear.app/semio-ai/issue/VIZ-167), DESIGN-1.0 D3): the
Viewer already mounts the driver only while playing and resets only on stop.

### 1.10 Panels that write through `graphRuntimeStore`

| Site                                                                                                                                      | 0.4                                                                                                   | 1.0                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `state/graphRuntimeStore.tsx:58-74,126-133`                                                                                               | `stageRuntimeInput`, `animateRuntimeValue`, `runtimeView*`, `measureFaceGeometryBounds`               | deleted under decision B; `measureFaceGeometryBounds` becomes a function of the document (1.3) |
| `hooks/useRigController.ts:1324,1342-1371,4418-4425`, `hooks/rigController/runtimeInputStaging.ts:13-62`, `hooks/graphRuntime.ts:228-239` | `stageRuntimeInput(path, value)`, `runtimeViewReady`                                                  | `rt.setValue(P(path), value)`, `status === "ready"`                                            |
| `App.tsx:202-207,793-800,4717-4725,4765-4788,4863,4961`                                                                                   | `runtimeView*` readiness for the loading bar and logs                                                 | the provider's `status` and `vizijId`                                                          |
| `components/inspector/FaceBoundsSection.tsx:86-137,241-244`                                                                               | `runtimeViewRootId`, `measureFaceGeometryBounds`                                                      | `rootId`, the document measure                                                                 |
| `components/panels/SpeechPanel.tsx:124-134,248-249,374-390,453-475`, `hooks/useSpeechPlayback.ts`                                         | Polly visemes and emotions staged as pose weights through `stageRuntimeInput` / `animateRuntimeValue` | decision C                                                                                     |

### 1.11 The empty-state demo (`components/app/emptyStateDemo/*`)

The demo shows Quori as shipped, as the showcase does (DESIGN-1.0 6.3): the
default composition, its active program running from load.

| Site                            | 0.4                                                                                        | 1.0                                                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EmptyStateDemo.tsx:11-27`      | bundle `{ namespace: "empty-demo", glb: url aggressive, stageNeutralFilter }`, `autostart` | `<VizijRuntimeProvider glb="/assets/Quori_Current_Extended.glb">`                                                                                    |
| `useDemoMouseGaze.ts:4-5,25-28` | `setInput(eye, mapNormalizedControlValue(…))`, `resolveFaceControls`                       | the gaze target from the pointer: `P("standard/vizij/gaze/target/{x,y}")` in `[0, 1]` and its weight, as `vizij-showcase/src/hooks/useGazeTarget.ts` |
| `useDemoIdleGaze.ts:3-5,22-25`  | `animateValue` on eyes, lids and blink on timers                                           | deleted: the face's own program                                                                                                                      |
| `DemoEmotionRow.tsx:3-5,29,63`  | `EMOTION_POSE_KEYS`, `buildPoseWeightPathMap`, `resolvePoseSemantics`, `animateValue`      | `useAnimateValue().animateValue(P("standard/vizij/expression/<name>"), w)`, the previous expression tweened to 0                                     |
| `DemoVoicePanel.tsx:14-47`      | the Polly timeline over viseme pose weights                                                | `rt.invoke("say", { text, voice })`                                                                                                                  |

### 1.12 demo-graph-studio

Its four errors (`bakeAuthoredClips.ts:2`, `bakeGraphSources.ts:1`,
`useVizijExport.ts:19` twice) come through the `@vizij/authoring-shared`
barrel (`src/shared/index.ts:4`), which re-exports `useVizijExport` although
the demo imports only `downloadJsonFile`, `readJsonFile` and `useDialogQueue`
(`PersistencePanel.tsx:9-13`, `InspectorPanel.tsx:13`). They clear when
authoring's exporter compiles; decision E is whether the barrel keeps
re-exporting the exporter.

### 1.13 Unit tests that mock the 0.4 surface

`Viewer.test.tsx`, `ReferenceFaceRuntime.test.tsx`,
`RuntimeFaceControlsOverlay.test.tsx`, `emptyStateDemo/DemoEmotionRow.test.tsx`,
`emptyStateDemo/DemoVoicePanel.test.tsx`, `hooks/useProfiles.test.ts`,
`hooks/__tests__/useVizijExport.test.tsx` (`getExportableBodies` at
`:254,1000,1027,1055,2125`), `hooks/__tests__/useVizijAssetLoader.test.tsx`,
`motiongraph/hooks/useMotionGraphDriver.test.tsx`,
`components/app/runtimeOutputLocks.test.ts`: each mocks the context the
component now reads (`runtime`, `description`, `status`) or the headless
exporter's input.

## 2. Where authoring touches the runtime, on the Bevy view

### 2.1 The viewport

**One canvas.** `<VizijCanvas>` is mounted once, inside the viewer wrapper
(`App.tsx:5036-5080`; the main pane at `:4985`), positioned over it with
pointer events on (DESIGN-1.0 D2). The wrapper holds the main pane and the reference pane, and the main pane
holds the empty-state demo, so every slot the app shows lies on the canvas.
The panes' own content stacks above it; where the main face takes picks, the
pane's chrome over the slot lets presses through (`pointer-events: none`) and
its buttons and chips keep theirs. A demo face scrolled past the wrapper's edge
is cropped there.

**The face's bytes.** The main face is the document exported: one function
assembles the bundle (`buildVizijBundle`, `useVizijExport.ts:1666`) and
`exportScene(buildSceneGraph(world, animatables, rootId), { bundle })` encodes
it, without the bake. The viewport and Export share that function, so the
export round-trip e2e also checks what the viewport loads.

**Reloads are keyed on world data only.** The bytes are re-made, and the
provider reloads (same `vizijId`; the previous scene draws until the new one
is ready; selection and holds carry over), when the world's structure
changes: elements, hierarchy, types, geometry, materials, which features are
animated by which animatable, and the animatables' types and ranges. Values do
not reload:

- a static feature's value, and an animatable's default, apply in place
  through `setStaticFeature(vizijId, elementId, feature, value)`; the next
  structural reload carries them in its bytes;
- a rig, pose-driver or pose graph change applies through
  `rt.loadGraph(composeVizij(document, { graphs, program: "none" }))`;
- a program runs beside the graph (2.3); an animation loads into the
  animation module (2.4).

The structural key takes the place of 0.4's `JSON.stringify(world)`
signature (`runtime-react` 0.4 `updatePolicy.ts:77-93`), under which any value
in the world reloaded the face.

**Picks and selection.** `onPick` maps a pick to the document's selection: a
hit selects `elementId` (the RobotData id `buildSceneGraph` writes is the
world element's id), a miss clears it. The `selection` prop draws the glow on
the selected element while the menu's glow toggle is on.

**Holds.** The inspector's locks become holds: the view declines the device's
writes to a locked animatable or component, and an inspector value on it
shows through `setStaticFeature`.

**Framing.** The authored `rootBounds` reach `setView` through the `bounds`
prop; the safe-area outline is the slot's DOM overlay. Fit to Geometry
measures the document with `deriveRootBounds(buildSceneGraph(…))`.

### 2.2 The inspector

Edits change the document. Structural ones reload; values go in place as
above; locks are holds. The input catalogue comes from `d.rigInputs` and
`rt.listKeys(rt.rigPrefix)`. Slider writes are `rt.setValue(P(path), v)`;
resets are `reset_keys` over the inputs the button names.

### 2.3 The motion-graph editor

The editor's graph is a program: a `run_behavior` run named after the
controller, edited live with `runEdits` + `applyGraphEdits`, halted on pause
and stop, reset with `reset_keys(outputKeys(graph))` on stop only. Input-source
nodes write the store with `rt.setValue`. The output plot reads the provider's
per-frame batches (`useVizijChanges`): the last value of each output per frame.
A structural reload gives a new `Runtime`, on which the editor spawns a new run.

### 2.4 The timeline

The authored clip is an animation in the face's animation module, loaded from
`rt.moduleAnimation(clip)` and reloaded in place on each edit; the face's own
animations sit on their players from load. The transport is the module's
methods by player; its state is `decodePlayerStates` of
`vizij/animations/players`. Muting is weight 0; stopping lets go of the keys
with `reset_keys` of the clip's channels.

### 2.5 Export and bake

Export builds the scene from the document (`buildSceneGraph`), so it needs no
mounted viewport and runs in Node: ellipse and rectangle elements export as
RobotData nodes the view draws (DESIGN-1.0 3.5). The bake samples each clip
through the device's own composition of the bundle (`composeVizij` on
`startRuntime`), each track driving `rigPrefix + channel` as playback does.

### 2.6 The reference face and the demo

The reference face loads the user's file as its own Vizij with the rig
composition, mirrors the main face's input changes by path, and resets through
`reset_keys`. The empty-state demo is Quori as shipped, driven through the
Vizij standard.

## 3. Gaps

Each is a capability authoring needs that `@vizij/runtime` 6 or the 1.0
packages lack. None is worked around in the app.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Fix belongs in                                                                                                                                                                    | Blocks VIZ-148?                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| G1  | **Cubic tangents.** Authored and imported keyframes carry `inTangent`/`outTangent` (`types/animationClipIr.ts:8`, `utils/animationClipCompiler.ts:225-232`). The runtime's `AnimationKeyframe` has none, and `module_animation` samples `cubic` with the engine's default ease (vizij-rs `crates/vizij/src/modules/animation.rs:285-370`), so timeline playback and other apps' playback differ from the authored curve and from the bake, which samples it with the tangents. 0.4 had the same limit (`engine/animationModule.ts:26-28` on `main`). | vizij-rs: `AnimationKeyframe.inTangent`/`outTangent` read by `describe` and mapped onto the keypoints' transition handles by `module_animation`                                   | decision D                                           |
| G2  | **Fit to Geometry over primitives.** `buildSceneGraph` exports an ellipse or rectangle as a node with no mesh; `deriveRootBounds` measures meshes, so it leaves them out of the fitted bounds.                                                                                                                                                                                                                                                                                                                                                       | vizij-web `@vizij/render`: `deriveRootBounds` counts a RobotData `ellipse`/`rectangle` node as its unit shape under its scale — a PR into `integration/bevy-view` before the port | yes, for faces with primitives                       |
| G3  | **To verify: `loadGraph` on a loaded Vizij.** Graph edits apply through `rt.loadGraph(composed)` without a reload. Unchecked: that LOAD keeps the behavior runs, the animation players and the store's held values.                                                                                                                                                                                                                                                                                                                                  | vizij-rs (`crates/vizij/src/web.rs`) if it does not                                                                                                                               | yes, if it fails: graph edits would otherwise reload |
| G4  | **To verify: picks on primitives.** A pick is "over each element's mesh as drawn"; the ellipse and rectangle meshes are the view's own. The picking e2e includes an authored ellipse.                                                                                                                                                                                                                                                                                                                                                                | vizij-rs `view` picking if it misses                                                                                                                                              | yes, if it fails                                     |
| G5  | **To verify: the adaptation as a run.** Decision C (a) runs the bundle's `standard-adaptation` graph through `run_behavior` for a preview. Unchecked: that `behaviorValue` takes an embedded adaptation spec and that its run writes the face's prefixed keys.                                                                                                                                                                                                                                                                                       | vizij-rs if it does not                                                                                                                                                           | only under decision C (a)                            |
| G6  | **To verify: colours under `stageNeutral` for a pre-standard face.** The reference face drops `stageNeutralFilter`; a GLB authored before the faces carried authored defaults ([VIZ-171](https://linear.app/semio-ai/issue/VIZ-171)) may stage its colour inputs to the neutral pose's values. The authoring exporter writes authored defaults for the main face.                                                                                                                                                                                    | the face (re-exported from authoring), not the runtime                                                                                                                            | no                                                   |

Not gaps, for the record: the plot's per-frame sampling (one value per output
per frame); the memory measure (`memoryBytes()` replaces 0.4's "Render loads"
and "Runtime instances" counters); program input ranges
([VIZ-198](https://linear.app/semio-ai/issue/VIZ-198), which can land before
or with this); `composeVizij` before any GLB exists (it reads `VIZIJ_bundle`
from the document's root extension).

## 4. Pull requests

Into `integration/bevy-view`, stacked on
[#152](https://github.com/vizij-ai/vizij-web/pull/152). The authoring app
builds only once every 0.4 call is gone (rollup rejects a missing named
export), so the port is one pull request, reviewed by its commits; the gate
comes before it and the measurements after.

**PR 1 — `vizij-authoring: e2e gate for the viewport port` (VIZ-148 step 1).**
Specs only, written against the app's own test ids so they run on either
renderer:

- `viewport-picking.smoke.pw.ts`: click a mesh of Quori, assert the
  inspector's target; click the background, assert the selection cleared;
  click an authored ellipse (G4).
- the pixel check: wait for the main face's ready flag, sample the viewport
  with `e2e/pixels.ts` (more than eight colours), move an input slider and
  assert the sample changed against the face's idle change over the same
  interval.
- `export-roundtrip.workflow.pw.ts`: import Quori, export the GLB, reload it,
  zero differences in RobotData, bundle and node transforms; the plain-GLB
  path (import → export → load as the reference face).

Evidence: the three pass against `main`'s three.js viewport (decision A). On
the integration branch they run from PR 2.

**PR 2 — `vizij-authoring on @vizij/render 1.0 and @vizij/runtime-react 1.0:
the viewport on the Bevy view` (steps 2–5).** Commits, in order:

1. `@vizij/runtime ^6.0.0`, `mapping`/`mappings`; the types of 1.2.
2. Export from the document: `buildSceneGraph` in `useVizijExport`, the
   `getLookup` namespace made one, the bake on `composeVizij` and
   `rigPrefix + channel` (1.6, 1.7).
3. The viewport: `<VizijCanvas>` in the viewer wrapper, the provider per
   decision B, the slot's props, picks, holds, static features, reloads keyed
   on world structure, graph edits by `loadGraph`, the input catalogue
   (1.3, 1.4, 1.10).
4. The motion-graph editor as runs (1.9).
5. The timeline on the animation module (1.8).
6. The reference face and the empty-state demo (1.5, 1.11).
7. The speech panel per decision C.
8. Deletions: `runtimeBundle.ts`, `runtimeInputsFromConstraints.ts`, the
   lock filter, `useMotionGraphNamespace.ts`, `bakeGraphSources.ts`'s
   composer input; the unit tests of 1.13; demo-graph-studio per decision E.

Evidence: `pnpm --filter vizij-authoring test` and `typecheck`;
`test:e2e:smoke` (with PR 1's specs) and `test:e2e` (the workflow suite, the
memory thresholds excepted); the root `e2e/tests/authoring-smoke.spec.ts` and
`authoring-journey.spec.ts`; `e2e/tests/standalone-demos-smoke.spec.ts` for
`demo-graph-studio` (port 5202); `pnpm --filter demo-graph-studio typecheck`.
A G2 render PR, if needed, lands before it.

**PR 3 — `vizij-authoring: StrictMode memory checkpoints and the
structural-edit load time` (steps 6–7).** The memory workflow runs on the dev
server (`test:e2e:memory:dev`), where StrictMode's double effects run, and
records `memoryBytes()` beside the JS heap at each checkpoint;
`preset-churn` and `reference-face-churn` assert growth under 1 MB. A workflow
spec times each structural edit — export, then `loadVizij` to ready — and the
numbers go into `docs/perf/`. Evidence: that run, and the load time accepted
by Victor.

## 5. Decisions for Victor

**A. Where the gate is proven.** The specs must pass on the three.js viewport
to show they test the right thing; the integration branch cannot run them
before the port.

- (a) Land PR 1 on `main`, green in CI, then bring `main` into the
  integration branch (a rebase of the stack, #143 to #152, or a merge of `main`).
- (b) PR 1 into the integration branch, its evidence a run of the same specs
  on a branch off `main` (CI or a recorded local run), linked in the PR.
- (c) The specs as the first commit of PR 2, proven the same way as (b).

Recommendation: (b). It keeps the gate reviewable on its own and keeps `main`
and the stack untouched until the branch lands.

**B. Where the main face's provider sits.** The panels that drive the face
(variables through `useRigController`, the speech panel, the animation panel)
live outside the Viewer.

- (a) Lift `<VizijRuntimeProvider>` to wrap the workspace, its `glb` the
  bytes App makes; panels read `useOptionalVizijRuntime()` and
  `useAnimateValue()`. `graphRuntimeStore`'s bridge fields, the Viewer's
  bridges and the animation transport adapter are deleted; `<VizijRuntimeFace>`
  stays the Viewer's one mount site.
- (b) Keep the provider in the Viewer and publish `rt` and `animateValue`
  into `graphRuntimeStore` for the panels.

Recommendation: (a). App already owns the document the bytes come from, and
the face's API then reaches every panel the way React passes it, with no
store relaying it.

**C. Speech and expressions in the main viewport.** The viewport composes
the rig without the standard adaptation, so pose sliders are not overwritten
each step (DESIGN-1.0 section 8); the device's `say` writes the standard's
keys, which nothing there maps onto the face.

- (a) A "preview as shipped" mode: spawn the bundle's `standard-adaptation`
  graph and its active program as runs; the speech panel speaks through
  `invoke("say", { text, voice })` and shows expressions through
  `standard/vizij/expression/*`; leaving the mode halts both runs and
  `reset_keys` their outputs. The Polly timeline (`useSpeechPlayback.ts`,
  `services/pollyApi.ts`) is deleted. Depends on G5.
- (b) Keep the panel's Polly timeline, writing the face's own viseme and
  emotion pose weights through `rt.setValue`.
- (c) Compose the adaptation always; direct pose editing then fights it.

Recommendation: (a), as its own commit of PR 2. It previews the face the way
every client drives it. The speech config's `visemeGroupId` and
`emotionGroupId` (what the panel authors today) are then read by no device;
whether the panel keeps authoring them is part of this decision.

**D. Cubic tangents (G1).**

- (a) Block VIZ-148 on the vizij-rs fix.
- (b) A vizij-rs ticket, not blocking: the limit is 0.4's too, and the baked
  glTF animations already honour the tangents.

Recommendation: (b).

**E. The `@vizij/authoring-shared` barrel.** It re-exports the exporter, so
demo-graph-studio's typecheck and bundle reach `three`, `@vizij/render` and
`@vizij/runtime` for three helpers it uses.

- (a) The barrel exports what both apps use (`useDialogQueue`, `fileIO`,
  `standardInputPaths`); authoring imports its hooks by path.
- (b) Leave it: the demo compiles once authoring does.

Recommendation: (a), in PR 2's last commit.
