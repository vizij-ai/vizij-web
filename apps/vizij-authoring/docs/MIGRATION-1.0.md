# vizij-authoring on `@vizij/render` 2.0 and `@vizij/runtime-react` 1.0: plan

**Status: decided** (section 5), with one decision open (G8) and four
upstream items (G1, G6, G7, G10). Ticket:
[VIZ-148](https://linear.app/semio-ai/issue/VIZ-148). The packages and their
design: `packages/@vizij/runtime-react/DESIGN-1.0.md`
([VIZ-147](https://linear.app/semio-ai/issue/VIZ-147)). The runtime is
`@vizij/runtime` 6.2 (vizij-rs `npm/@vizij/runtime/README.md`).

Two lines of the packages exist side by side:

| Line                   | `@vizij/render`                                        | `@vizij/runtime-react` | `@vizij/runtime` | Who uses it                                                                                          |
| ---------------------- | ------------------------------------------------------ | ---------------------- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| published, from `main` | 1.0.0: the three.js renderer, the loader, the exporter | 0.4.1                  | 2.4 (its own)    | vizij-authoring on `integration/bevy-view`, and demo-graph-studio through authoring's shared sources |
| workspace, on staging  | publishes as 2.0.0: faces as slots on one Bevy canvas  | 1.0                    | ^6.2 (peer)      | every other app on `integration/bevy-view`                                                           |

This plan moves vizij-authoring from the first line to the second. Line
references are to the authoring sources on `integration/bevy-view`
(`a2eafa5b`; `src/` is unchanged since `7128fa35`); paths are under
`apps/vizij-authoring/src/` unless they say otherwise.

The authoring app keeps its document model — the `@vizij/render` zustand
store created in `main.tsx:21-26` — and stops rendering it. What the viewport
shows is a Vizij loaded from the bytes the headless exporter makes from that
document; what the app does to the face goes through the face's Arora API on
the `Runtime` that `useVizijRuntime()` hands out: its store (`setValue`,
`writeValues`, `readValues`, `listKeys`), its methods (`invoke`), its runs
(`run_behavior`, `halt`) and its graph (`loadGraph`, `applyGraphEdits`). No
function wraps a device call under a new name.

## 1. Every 0.4 call and its equivalent on the workspace line

Inventory: the TypeScript parser over every `import` of `@vizij/runtime-react`,
`@vizij/render` and `@vizij/runtime` in `apps/vizij-authoring/{src,e2e}` and
`apps/demo-graph-studio/src`, plus every context member a typecheck against
`@vizij/runtime-react` 1.0 rejects (181 errors). In the right-hand column, `rt`
is the context's `runtime`, `d` its `description`, and `P(x)` is
`rt.path(x)`. The PR column refers to section 4.

### 1.1 Package versions

| Site                                                                                                     | Today                                                      | Workspace line                                                 | PR  |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------- | --- |
| `../package.json:39`                                                                                     | `"@vizij/runtime": "^3.0.0"`                               | `^6.2.0`, the copy `@vizij/render` and `runtime-react` peer on | 3   |
| `../package.json:38,40`                                                                                  | `@vizij/render ^1.0.0`, `@vizij/runtime-react ^0.4.1`      | `workspace:*` (2.0, 1.0)                                       | 4   |
| `hooks/useStandardProfiles.ts:2`                                                                         | `standardProfile`, `standardProfiles` (deprecated aliases) | `mapping`, `mappings`                                          | 3   |
| `hooks/useProfiles.ts:2`, `components/app/ProfileImportDialog.tsx:2`, `hooks/useSkills.ts:2`             | `profile`, `profiles`, `skills`, `skillSource`             | unchanged                                                      | 3   |
| `animationBake/graphEvaluatorDevice.ts:1`, `*.device.test.ts`, `../e2e/profile-edition.workflow.pw.ts:5` | `startRuntime`, `composeVizij`                             | unchanged                                                      | 3   |

### 1.2 Types that left `@vizij/runtime-react`

| Site                                                                                                                               | 0.4 type                                | Workspace line                                                                                                                         | PR   |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `utils/runtimeBundle.ts:3-4,29-75`                                                                                                 | `VizijAssetBundle`, `PoseRigConfig`     | file deleted: the viewport's source is GLB bytes (section 2.1)                                                                         | 4    |
| `components/app/Viewer.tsx:2-5`, `ReferenceFaceRuntime.tsx:10`, `emptyStateDemo/EmptyStateDemo.tsx:3`, `DemoEmotionRow.test.tsx:4` | `VizijAssetBundle`                      | `VizijSource` (bytes, `File`, URL)                                                                                                     | 4    |
| `state/graphRuntimeStore.tsx:8`                                                                                                    | `PoseRigConfig`                         | the app's own `PoseRigConfigFile` (`poseRig/types.ts`), which it already authors                                                       | 4    |
| `hooks/useSpeechPlayback.ts:2`, `components/panels/SpeechPanel.tsx:116-117`                                                        | `PoseDefinition`, `PoseGroupDefinition` | the app's own `poseRig/types.ts` definitions (SpeechPanel already casts to them at `:229-232`); deleted with the Polly timeline (1.10) | 4, 5 |
| `hooks/useAnimationTransport.ts:3`, `hooks/__tests__/comparableRuntimeAnimations.test.ts:2`                                        | `VizijAnimationAsset`                   | `Animation` from `@vizij/runtime` (`describe`'s shape, what `rt.moduleAnimation` takes)                                                | 4    |
| `components/app/runtimeOutputLocks.ts:1`, `runtimeOutputLocks.test.ts:3`                                                           | `RuntimeOutputWrite`                    | deleted with the write filter (`rt.hold`, 1.3)                                                                                         | 4    |
| `animationBake/bakeGraphSources.ts:1,26-48`                                                                                        | `GraphSource`                           | deleted: the bake composes with `composeVizij` (1.7)                                                                                   | 4    |

### 1.3 The main face's viewport (`components/app/Viewer.tsx`)

| Site                                          | 0.4                                                                                                                            | Workspace line                                                                                                                                                                                                                                                                       | PR      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `:766-771`, `App.tsx:4706-4715`               | `<VizijRuntimeProvider assetBundle={glb: {kind: "world"}} autostart onRegisterControllers transformOutputWrite>` in the Viewer | `<VizijRuntimeProvider glb={bytes} vizijId="authoring-main" run={playing}>` around the workspace in `App.tsx`, the face's default composition with its active program (section 2.1); `bytes` per section 2.1                                                                         | 4, 5, 6 |
| `:820-828`                                    | `<VizijRuntimeFace showSafeArea showSelectionGlow toneMapping onPointerMissed>`                                                | `<VizijRuntimeFace showSafeArea={faceBoundsOverlayVisible} selection={showSelectionGlow && selectedSceneId ? [selectedSceneId] : []} toneMapping bounds={authoredRootBounds} onPick>`, the Viewer's one mount site                                                                   | 4       |
| `:100-188` `RuntimeSelectionBridge`           | the provider's isolated render store's `elementSelection`, both ways, with pending-echo guards                                 | deleted: `onPick={({ elementId }) => elementId ? onSelectScene(elementId) : onClearSelection()}`, and the selection goes back through the `selection` prop. No isolated store exists to synchronise                                                                                  | 4       |
| `:190-238` `RuntimeInputBridge`               | publishes `setInput` and `animateValue` closures, `ready`, `loading`, `rootId`, `outputPaths.length` into `graphRuntimeStore`  | deleted: the panels sit inside the provider (1.10)                                                                                                                                                                                                                                   | 4       |
| `:254-292` `FaceBoundsRuntimeBridge`, measure | `deriveRootBounds` over the provider store's mounted `refs`                                                                    | `deriveRootBounds(buildSceneGraph(world, animatables, rootId))` over the document, ellipses and rectangles included (G2)                                                                                                                                                             | 4       |
| `:294-317` same, bounds push                  | writes authored `rootBounds` into the isolated store's world for the camera and safe area                                      | deleted: the `bounds` prop reaches `setView`                                                                                                                                                                                                                                         | 4       |
| `:322-387` `RuntimeExportBodyBridge`          | `refs`, `getExportableBodies` snapshots of mounted three.js groups                                                             | deleted: export is headless (1.6)                                                                                                                                                                                                                                                    | 4       |
| `:396-430` `RuntimeInputCatalogBridge`        | `ready`, `inputConstraints`, `namespace` → `buildRuntimeInputCatalogFromConstraints`                                           | `d.rigInputs` (id, path, label, group, range, default) merged with `rt.listKeys(rt.rigPrefix)` for the composed graph's free inputs the rig does not declare (their `__meta` range and rest value); `runtimeInputsFromConstraints.ts` and its namespace stripper deleted             | 4       |
| `:432-475` `RuntimeGraphBridge`               | `setGraphBundle({ rig, pose }, { tier: "graphs" })` on every rig or pose graph change                                          | `rt.loadGraph(await composeVizij(document))`, `document` being `{ asset: { version: "2.0" }, extensions: { VIZIJ_bundle: bundle } }` — no scene reload (section 2.1, G3)                                                                                                             | 4       |
| `:477-508` `RuntimeStatusDebug`               | `loading`, `ready`, `rootId`, `error`, `controllers`, `outputPaths`                                                            | `status`, `error`, `behaviorError`, `vizijId`, `d.graphs.length` plus the runs under `BEHAVIOR_RUNS`, `Object.keys(d.animatables).length` as the output count (the text `runtime: ready` and `outputs: N` that `e2e/helpers.ts:41` and `rig-state-gate.workflow.pw.ts:38` read stay) | 4       |
| `:515-564` `MotionGraphRuntimeBridge` reset   | `setInput(path, { float })` of App-computed `resetValues` on stop (`App.tsx:5016`)                                             | `rt.invoke("reset_keys", { keys: { strs: await outputKeys(graph) } })` on stop; the App's `activeProgramRuntimeResetValues` deleted                                                                                                                                                  | 4       |
| `:679-690`, `runtimeOutputLocks.ts:75-213`    | `transformOutputWrite` filtering each output write against the locked inspector targets                                        | `rt.hold(added)` / `rt.release(removed)` as `lockedInspectorTargetIds` changes: those ids are already `<animatableId>` and `<animatableId>:x…z`/`:r…b`, the forms `hold` takes. The index and merge logic deleted                                                                    | 4       |
| `:736-743`                                    | `onRegisterControllers` → `runtimeViewGraphCount`                                                                              | `d.graphs.length`                                                                                                                                                                                                                                                                    | 4       |
| `:657`, `:670-677`                            | `runtimeAnimatables` default as the lock's fallback value                                                                      | deleted: a hold keeps what shows                                                                                                                                                                                                                                                     | 4       |
| `:712-718` `handleResetInputs`                | `applyStandardInputBatch(defaults)`                                                                                            | `rt.invoke("reset_keys", { keys: { strs: inputs.map((i) => P(i.path)) } })` for the same managed, non-pose inputs; the authoring store's batch stays for the panels' own state                                                                                                       | 4       |

### 1.4 Shared face chrome

| Site                                        | 0.4                                               | Workspace line                                                        | PR  |
| ------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- | --- |
| `components/app/RuntimeFaceFrame.tsx:28-34` | `ready`, `loading`, `stagePoseNeutral()` on ready | `status`, `error`; the staging deleted (`loadVizij`'s `stageNeutral`) | 4   |
| `RuntimeFaceFrame.tsx:69`                   | `<VizijRuntimeFace showSafeArea={false}>`         | `<VizijRuntimeFace className>`                                        | 4   |
| `RuntimeFaceFrame.tsx:80-121`               | badge from `ready`/`loading`/`error`              | the slot's own loading view; the badge keeps `error` only             | 4   |
| `RuntimeFaceControlsOverlay.tsx:46`         | `ready`, `loading`, `stepHz`                      | `status`; the FPS chip deleted (the device paces itself; no `stepHz`) | 4   |

### 1.5 The reference face (`components/app/ReferenceFaceRuntime.tsx`)

| Site               | 0.4                                                                                      | Workspace line                                                                                                                    | PR      |
| ------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `:60-64,228-239`   | bundle `{ namespace: "refface", glb: url aggressive, pose.stageNeutralFilter }`          | `glb={file}` (a `File` is a `Blob`); `stageNeutralFilter` deleted, authored defaults keep colours (DESIGN-1.0 section 8; G5)      | 4       |
| `:265-281`         | object URL per file                                                                      | deleted: the provider reads the `Blob`                                                                                            | 4       |
| `:303-307`         | `<VizijRuntimeProvider assetBundle autostart driveRuntime>`                              | `<VizijRuntimeProvider glb={file} run={visible && playing}>`, the same composition as the main face (2.1)                         | 4, 5, 6 |
| `:354-362`         | `ready`, `loading`, `setInput`, `inputConstraints`, `faceId`, `assetBundle`, `namespace` | `status`, `rt`, `d`                                                                                                               | 4       |
| `:71-176`          | namespace strippers, `buildRuntimeWritePathMap` scoring candidate paths                  | deleted: a rig input's key is `P(input.path)`                                                                                     | 4       |
| `:178-226,393-400` | override routes from `assetBundle.rig.spec` input nodes                                  | `rt.listKeys(P("override/"))`: the device lists `override/<id>/{enabled,value}` itself                                            | 4       |
| `:374-385`         | input catalogue from constraints                                                         | as the main face (1.3)                                                                                                            | 4       |
| `:418-470`         | `setInput(path, { float })` through the resolved route                                   | the main face's edit, mirrored by path: the same write and the same hold (G8)                                                     | 4, 5    |
| `:477-486`         | `onBundleReady(assetBundle.bundle)`                                                      | `onBundleReady` from the app's own import of the file (`loadGLTFFromBlobWithBundle`), or `d.metadata` where only metadata is read | 4       |
| `:522-548`         | reset through `setInput`                                                                 | `rt.invoke("reset_keys", { keys: { strs } })` over the resettable inputs' keys and their `override/<id>/enabled`                  | 4       |

### 1.6 Export (`hooks/useVizijExport.ts`, `components/app/ExportDialog.tsx`)

| Site                                                          | 0.4                                                                                                                                                                                        | Workspace line                                                                                                                                                | PR  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `ExportDialog.tsx:126-158,216-217`                            | `getExportableBodies` from the store or the viewport's snapshot, `exportSceneRoot` fallback                                                                                                | deleted: `useVizijExport` builds the scene                                                                                                                    | 4   |
| `useVizijExport.ts:159,613,755-842`                           | candidate mounted bodies, 12 frame retries, the "fallback scene has no RobotData" guard                                                                                                    | `buildSceneGraph(world, animatablesForExport, rootId)` — headless, in Node too, ellipses and rectangles as RobotData nodes; the retries and the guard deleted | 4   |
| `useVizijExport.ts:1241`                                      | `exportScene(exportableBodies[0], { bundle, animations })`                                                                                                                                 | `exportScene(buildSceneGraph(…), { bundle, animations })`                                                                                                     | 4   |
| `useVizijExport.ts:628,737`, `utils/rigRoundtripAudit.ts:118` | `values.get(getLookup(exportFaceId, id))`, while scene editing writes `getLookup(DEFAULT_NAMESPACE, id)` (`scene/featureMutations.ts:35,101,147`, `scene/useSceneComposer.ts:237,788-793`) | one namespace: the export reads the document's values under the key scene editing writes them, so an inspector override reaches the exported defaults         | 4   |
| `App.tsx:643,925-952,5025,5447`                               | `runtimeExportBodies` state and its handler                                                                                                                                                | deleted                                                                                                                                                       | 4   |
| `components/panels/DebugPanel.tsx:99`                         | `refs` (mounted object count)                                                                                                                                                              | `memoryBytes()` and the face's `status`                                                                                                                       | 4   |
| `../e2e/export-roundtrip.workflow.pw.ts`                      | leaves the glTF nodes' translation, rotation and scale out: the mounted export writes the sampled pose                                                                                     | compares them: the headless export writes each element's authored values                                                                                      | 4   |

### 1.7 Animation bake (`animationBake/*`, `useVizijExport.ts:1109-1160`)

| Site                                                      | 0.4                                                                  | Workspace line                                                                                                                                                                                                                                                           | PR  |
| --------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- |
| `useVizijExport.ts:1132`, `bakeStepCost.device.test.ts:6` | `composeGraphSpecs(collectBakeGraphSources(bundle))` (JS composer)   | `composeVizij({ asset, extensions: { VIZIJ_bundle: bundle } }, { graphs: ["rig", "pose-driver"], program: "none" })`: the device's composition, the one the exported face runs. `collectBakeGraphSources` deleted; `outputPathsOfSpec` stays (or `outputKeys(composed)`) | 4   |
| `useVizijExport.ts:1149-1154`                             | `collectInputPathMap(source.spec)` per source (input-node id → path) | deleted                                                                                                                                                                                                                                                                  | 4   |
| `bakeAuthoredClips.ts:2,181-194`                          | `resolveAnimationBridgeOutputPaths(channel, …, inputPathMap)`        | the key the face's rig resolves the track's channel to — the resolution `moduleAnimation` applies for playback (vizij-rs `ChannelKeys`), so the bake and the timeline drive the same key (G10); `inputPathMap` leaves the bake's options                                 | 4   |
| `realBundleConventions.test.ts:5-8,123-153`               | the three JS helpers over the shipped bundles                        | `composeVizij` over each shipped GLB's JSON chunk (`parseGlbJsonChunk`), and every clip channel resolving to a key the composed spec declares as an input                                                                                                                | 4   |
| `bakeAuthoredClips.ts` `root` (`useVizijExport.ts:1156`)  | the mounted body, for binding validation                             | the same `buildSceneGraph` root the export writes                                                                                                                                                                                                                        | 4   |

`three` stays in `animationBake/*` and `scene/sceneEditing.ts`: clip
building and maths, not rendering.

### 1.8 The timeline (`hooks/useAnimationTransport.ts`)

| Site                                    | 0.4                                                                                                          | Workspace line                                                                                                                                                                                                                                                                          | PR  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `:133-152,483-500`                      | `rootId`, `assetBundle.animations`, `setGraphBundle({ animations })` on every clip change                    | the face's own animations are on players at load (`d.animations`, weight 0); the authored clip: `load_animation` of `rt.moduleAnimation(clip)` once per `Runtime`, `create_player` named after it, `add_instance_with_weight` 0; each edit `reload_animation` in place (playback stays) | 4   |
| `:345-367` transport façade             | `playAnimation`, `pauseAnimation`, `stopAnimation`, `seekAnimation`, `setAnimationLoop`, `getAnimationState` | `invoke("play" \| "pause" \| "stop" \| "seek" \| "set_loop" \| "set_speed" \| "set_weight", { player, … })`; the façade and `AnimationRuntimeTransportAdapter` deleted                                                                                                                  | 4   |
| `:351,362,724,753`                      | `getAnimationState(id)` polled                                                                               | `decodePlayerStates(useVizijValues([ANIMATION_PLAYERS_PATH])[…])`, the player by name                                                                                                                                                                                                   | 4   |
| `:390-402`                              | `stopAnimation(id, { clearOutputs })` then `setInput(path, 0)` per authored output                           | `stop`, `set_weight` 0, `reset_keys` of `clip.tracks.map((t) => P(t.channel))`                                                                                                                                                                                                          | 4   |
| `:404-441`                              | `setAnimationActive(bool)`                                                                                   | `set_weight` 0 on every instance and `stop` (inactive), the authored weight back to 1 (active)                                                                                                                                                                                          | 4   |
| `:103-122` `muteAnimationClip`          | track-less clip copies pushed to mute                                                                        | deleted: weight 0 mutes                                                                                                                                                                                                                                                                 | 4   |
| `:588` `useAnimationTransport`          | `useOptionalVizijRuntime()` or the store's adapter                                                           | `useOptionalVizijRuntime()`: the animation panel sits inside the provider                                                                                                                                                                                                               | 4   |
| `:30-65,432-435,469` signature rounding | compares the merged list against what the provider holds to latch `transportRuntimeReady`                    | ready once `load_animation` resolved on the current `Runtime`; the signature comparison deleted                                                                                                                                                                                         | 4   |

### 1.9 The motion-graph editor (`motiongraph/*`)

| Site                                                      | 0.4                                                                              | Workspace line                                                                                                                                                                                                                                                | PR  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `hooks/useMotionGraphDriver.ts:37-44,113-194`             | `setGraphBundle({ programs: [graph] })` on every spec change, then `playProgram` | first sync: `rt.invoke("run_behavior", { name: controllerId, behavior: await behaviorValue(spec) })`, keeping `{ run, spec }`; each later sync: `rt.applyGraphEdits(await runEdits(run, previousSpec, spec))`, so kept nodes keep their springs and smoothing | 4   |
| `useMotionGraphDriver.ts:199-212`                         | `getProgramState(id)`, replay after the provider re-registers                    | the run's status key (`runStatus(rt.readValues([handle.status])…)`); a new `Runtime` (a structural reload) starts a new run                                                                                                                                   | 4   |
| `useMotionGraphDriver.ts:122-158,259-277`                 | `stopProgram(id, { resetOutputs: false })`, `setGraphBundle({ programs: [] })`   | `rt.halt(run)`: outputs hold; the reset is the Viewer's explicit `reset_keys` on stop (1.3)                                                                                                                                                                   | 4   |
| `useMotionGraphDriver.ts:24-111` resync key, publish refs | guards against the provider's re-registration and context identity churn         | deleted: nothing re-registers; the key is the `Runtime`                                                                                                                                                                                                       | 4   |
| `MotionGraphDriverBridge.tsx:42-43`                       | `namespace`, `controllers`                                                       | `rt`                                                                                                                                                                                                                                                          | 4   |
| `utils/buildGraphSpec.ts:168,179`                         | `${namespace}/${outputPath}`, `${namespace}/${inputPath}`                        | `outputPath`, `inputPath`: the editor's paths are already the face's own (`rig/<faceId>/…`); the `namespace` parameter goes                                                                                                                                   | 4   |
| `components/InputValueBridge.tsx:33,77-82`                | `setInput(path, { bool })` / `{ float }`                                         | `rt.setValue(path, { bool })` / a number                                                                                                                                                                                                                      | 4   |
| `components/MotionGraphValueSampler.tsx:24-86`            | `subscribeToStep` + `getValueSnapshot` with namespaced candidates                | `useVizijChanges(batch => …)` over the output nodes' paths; one candidate path each                                                                                                                                                                           | 4   |
| `hooks/useMotionGraphNamespace.ts:101-208`                | `assetBundle.bundle.graphs`, `assetBundle.rig.spec`, `inputConstraints`          | deleted: nothing imports it                                                                                                                                                                                                                                   | 3   |

### 1.10 Panels that write through `graphRuntimeStore`

The panels sit inside the provider (decision B): each reads
`useOptionalVizijRuntime()` and `useAnimateValue()` itself.

| Site                                                                                                                                      | 0.4                                                                                                   | Workspace line                                                                                                                                              | PR   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `state/graphRuntimeStore.tsx:58-74,126-133`                                                                                               | `stageRuntimeInput`, `animateRuntimeValue`, `runtimeView*`, `measureFaceGeometryBounds`               | deleted; `measureFaceGeometryBounds` becomes a function of the document (1.3)                                                                               | 4    |
| `hooks/useRigController.ts:1324,1342-1371,4418-4425`, `hooks/rigController/runtimeInputStaging.ts:13-62`, `hooks/graphRuntime.ts:228-239` | `stageRuntimeInput(path, value)`, `runtimeViewReady`                                                  | `rt.setValue(P(path), value)` under the edit's hold (G8), `status === "ready"`                                                                              | 4, 5 |
| `App.tsx:202-207,793-800,4717-4725,4765-4788,4863,4961`                                                                                   | `runtimeView*` readiness for the loading bar and logs                                                 | the provider's `status` and `vizijId`                                                                                                                       | 4    |
| `components/inspector/FaceBoundsSection.tsx:86-137,241-244`                                                                               | `runtimeViewRootId`, `measureFaceGeometryBounds`                                                      | `rootId`, the document measure                                                                                                                              | 4    |
| `components/panels/SpeechPanel.tsx:124-134,248-249,374-390,453-475`, `hooks/useSpeechPlayback.ts`, `services/pollyApi.ts`                 | Polly visemes and emotions staged as pose weights through `stageRuntimeInput` / `animateRuntimeValue` | `rt.invoke("say", { text, voice })`; the viseme timeline built live from the run's feedback (section 2.5); `useSpeechPlayback.ts` and `pollyApi.ts` deleted | 5    |

### 1.11 The empty-state demo (`components/app/emptyStateDemo/*`)

The demo shows Quori as shipped, as the showcase does (DESIGN-1.0 6.3): the
default composition, its active program running from load.

| Site                            | 0.4                                                                                        | Workspace line                                                                                                                                       | PR  |
| ------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| `EmptyStateDemo.tsx:11-27`      | bundle `{ namespace: "empty-demo", glb: url aggressive, stageNeutralFilter }`, `autostart` | `<VizijRuntimeProvider glb="/assets/Quori_Current_Extended.glb">`                                                                                    | 4   |
| `useDemoMouseGaze.ts:4-5,25-28` | `setInput(eye, mapNormalizedControlValue(…))`, `resolveFaceControls`                       | the gaze target from the pointer: `P("standard/vizij/gaze/target/{x,y}")` in `[0, 1]` and its weight, as `vizij-showcase/src/hooks/useGazeTarget.ts` | 4   |
| `useDemoIdleGaze.ts:3-5,22-25`  | `animateValue` on eyes, lids and blink on timers                                           | deleted: the face's own program                                                                                                                      | 4   |
| `DemoEmotionRow.tsx:3-5,29,63`  | `EMOTION_POSE_KEYS`, `buildPoseWeightPathMap`, `resolvePoseSemantics`, `animateValue`      | `useAnimateValue().animateValue(P("standard/vizij/expression/<name>"), w)`, the previous expression tweened to 0                                     | 4   |
| `DemoVoicePanel.tsx:14-47`      | the Polly timeline over viseme pose weights                                                | `rt.invoke("say", { text, voice })`                                                                                                                  | 4   |

### 1.12 demo-graph-studio

demo-graph-studio imports `downloadJsonFile`, `readJsonFile` and
`useDialogQueue` from the `@vizij/authoring-shared` barrel
(`PersistencePanel.tsx:9-13`, `InspectorPanel.tsx:13`). The barrel
(`src/shared/index.ts`) exports what both apps use — the dialog queue, file IO
and the standard input paths — and authoring imports its own hooks
(`useVizijExport`, `useBundleAudit`, `usePoseGraphImport`,
`useGraphPlaybackControls`) by path, so the demo's typecheck and bundle never
reach the exporter, three.js or a runtime (decision E, PR 1).

### 1.13 Unit tests that mock the 0.4 surface

`Viewer.test.tsx`, `ReferenceFaceRuntime.test.tsx`,
`RuntimeFaceControlsOverlay.test.tsx`, `emptyStateDemo/DemoEmotionRow.test.tsx`,
`emptyStateDemo/DemoVoicePanel.test.tsx`, `hooks/useProfiles.test.ts`,
`hooks/__tests__/useVizijExport.test.tsx` (`getExportableBodies` at
`:254,1000,1027,1055,2125`), `hooks/__tests__/useVizijAssetLoader.test.tsx`,
`motiongraph/hooks/useMotionGraphDriver.test.tsx`,
`components/app/runtimeOutputLocks.test.ts`: each mocks the context the
component reads (`runtime`, `description`, `status`) or the headless
exporter's input, in the PR that changes the component.

## 2. Where authoring touches the runtime, on the Bevy view

### 2.1 The viewport

**One canvas.** `<VizijCanvas>` is mounted once, inside the viewer wrapper
(`App.tsx:5036-5080`; the main pane at `:4985`), positioned over it with
pointer events on (DESIGN-1.0 D2). The wrapper holds the main pane and the
reference pane, and the main pane holds the empty-state demo, so every slot
the app shows lies on the canvas. The panes' own content stacks above it;
where the main face takes picks, the pane's chrome over the slot lets presses
through (`pointer-events: none`) and its buttons and chips keep theirs. A demo
face scrolled past the wrapper's edge is cropped there.

**One provider for the main face**, around the workspace in `App.tsx`
(decision B), so the viewport, the inspector, the panels, the motion-graph
editor and the timeline all reach the same `Runtime`. `<VizijRuntimeFace>` in
the Viewer is where it draws.

**The face's bytes.** The main face is the document exported: one function
assembles the bundle (`buildVizijBundle`, `useVizijExport.ts:1666`) and
`exportScene(buildSceneGraph(world, animatables, rootId), { bundle })` encodes
it, without the bake. The viewport and Export share that function, so the
export round-trip e2e also checks what the viewport loads.

**The composition.** The face loads as any app loads it: its rig, pose
driver, pose graph and standard adaptation, with its active program running
from load as a run (`loadVizij`'s defaults). An app's drive and the author's
preview are one and the same: expressions, visemes and `say` reach the face
through its adaptation. Animations drive rig inputs directly and win over the
graph's writes to the same keys, as the later source each step.

**Playing and paused.** The provider's `run` follows the viewer's play state.
Playing, the device paces itself. Paused, it is stopped: each change the
author makes — an input, an inspector value, a timeline scrub (`seek`), a
program edit — is followed by `rt.step(0)`, so the whole behavior evaluates
once with no time passing. Time-dependent state holds still across such a
step only once G6 is fixed.

**Direct edits win while they are made.** A control that edits a key the
composition writes (a pose weight the adaptation writes, a rig input the
program writes) holds that key for the edit's duration — from the press to the
release of a slider, or while an inspector value is locked — so the author's
value shows over the graph's. The mechanism is G8's.

**The program under edit.** While the motion-graph editor plays a program,
its run takes the active program's place: the active program's run is halted
and the edited graph runs (2.3); on stop, the edited run is halted, its output
keys reset, and the active program runs again.

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
  `rt.loadGraph(composeVizij(document))`;
- a program runs beside the graph (2.3); an animation loads into the
  animation module (2.4).

The structural key takes the place of the published runtime-react 0.4's
`JSON.stringify(world)` signature (`updatePolicy.ts:77-93`), under which any
value in the world reloads the face.

**Picks and selection.** `onPick` maps a pick to the document's selection: a
hit selects `elementId` (the RobotData id `buildSceneGraph` writes is the
world element's id), a miss clears it. The `selection` prop draws the glow on
the selected element while the menu's glow toggle is on.

**Locks.** The inspector's locks become holds: the view declines the device's
writes to a locked animatable or component, and an inspector value on it
shows through `setStaticFeature`.

**Framing.** The authored `rootBounds` reach `setView` through the `bounds`
prop; the safe-area outline is the slot's DOM overlay. Fit to Geometry
measures the document with `deriveRootBounds(buildSceneGraph(…))`.

### 2.2 The inspector

Edits change the document. Structural ones reload; values go in place as
above; locks are holds. The input catalogue comes from `d.rigInputs` and
`rt.listKeys(rt.rigPrefix)`. Slider writes are `rt.setValue(P(path), v)`
under the edit's hold; resets are `reset_keys` over the inputs the button
names.

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
with `reset_keys` of the clip's channels. A clip's keyframes play with the
engine's ease where they carry cubic tangents (G1).

### 2.5 The speech panel

The panel speaks through the face: `rt.invoke("say", { text, voice })` returns
the run's handle, and the panel builds its viseme timeline live from what the
run reports as it plays — each viseme and its intensity on the run's feedback
keys (`viseme`, `intensity`), read per frame with `useVizijChanges` — and
shows the utterance from the face's speech state, `P("standard/vizij/speech")`.
Words appear as they arrive once the run reports them (G7). The face's mouth
moves through its adaptation, as for any app. `halt(run)` stops it.

The speech config the panel authors keeps `voice` — the face's default voice,
which the panel passes to `say` and an app reads from `d.metadata` — and drops
`visemeGroupId` and `emotionGroupId`: the standard adaptation maps the
standard's visemes and expressions onto the face's poses, and no device or app
reads the group ids.

### 2.6 Export and bake

Export builds the scene from the document (`buildSceneGraph`), so it needs no
mounted viewport and runs in Node: ellipse and rectangle elements export as
RobotData nodes the view draws (DESIGN-1.0 3.5). The bake samples each clip
through the device's own composition of the bundle (`composeVizij` on
`startRuntime`), each track driving the key the face's rig resolves its
channel to, as playback does (G10).

### 2.7 The reference face and the demo

The reference face loads the user's file as its own Vizij, composed and
played as the main face is, and receives the main face's edits by path under
the same holds; it resets through `reset_keys`. The empty-state demo is Quori
as shipped, driven through the Vizij standard.

## 3. Gaps

Each is a capability authoring needs that `@vizij/runtime` 6.2 or the
workspace packages lack. None is worked around in the app.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Fix belongs in                                                                                                                                                    | Blocks               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| G1  | **Cubic tangents.** Authored and imported keyframes carry `inTangent`/`outTangent` (`types/animationClipIr.ts:8`, `utils/animationClipCompiler.ts:225-232`). The runtime's `AnimationKeyframe` has none, and `module_animation` samples `cubic` with the engine's default ease (vizij-rs `crates/vizij/src/modules/animation.rs:285-370`). Timeline playback in authoring is the same as on the published 0.4 line, which has the same limit; the gap is with the baked glTF animations, which the bake samples with the tangents.                                                                                                                                      | vizij-rs: `AnimationKeyframe.inTangent`/`outTangent` read by `describe` and mapped onto the keypoints' transition handles by `module_animation`. A tracked ticket | nothing              |
| G2  | **Fit to Geometry over primitives.** `buildSceneGraph` exports an ellipse or rectangle as a node with no mesh; `deriveRootBounds` measures meshes, so it leaves them out of the fitted bounds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `@vizij/render`: `deriveRootBounds` measures a RobotData `ellipse`/`rectangle` node as its unit shape under its scale                                             | PR 4 (fixed by PR 2) |
| G3  | **To verify: `loadGraph` on a loaded Vizij.** Graph edits apply through `rt.loadGraph(composed)` without a reload. Unchecked: that LOAD keeps the behavior runs, the animation players and the view's holds.                                                                                                                                                                                                                                                                                                                                                                                                                                                            | vizij-rs (`crates/vizij/src/web.rs`) if it does not                                                                                                               | PR 4, if it fails    |
| G4  | **To verify: picks on primitives.** A pick is "over each element's mesh as drawn"; the ellipse and rectangle meshes are the view's own. `e2e/viewport-picking.smoke.pw.ts` presses an ellipse and a rectangle, and passes on the published three.js line.                                                                                                                                                                                                                                                                                                                                                                                                               | vizij-rs `view` picking if it misses                                                                                                                              | PR 4, if it fails    |
| G5  | **To verify: colours under `stageNeutral` for a pre-standard face.** The reference face drops `stageNeutralFilter`; a GLB authored before the faces carried authored defaults ([VIZ-171](https://linear.app/semio-ai/issue/VIZ-171)) may stage its colour inputs to the neutral pose's values. The authoring exporter writes authored defaults for the main face.                                                                                                                                                                                                                                                                                                       | the face (re-exported from authoring), not the runtime                                                                                                            | nothing              |
| G6  | **`step(0)` snaps springs, dampers and slews.** At `dt = 0`, Time, Oscillator, the noise nodes fed by time and the animation players hold still (the graph's time `t` advances by `dt`, vizij-rs `crates/interop/vizij-arora-behavior/src/lib.rs:807-810`). Spring, Damp and Slew do not: at `dt <= 0` each sets its state to its target and zeroes its velocity (`crates/node-graph/vizij-graph-core/src/eval/eval_node.rs:885-888,920-921,940-941`), so a paused face jumps every smoothed value to its target on each change.                                                                                                                                        | vizij-graph-core: at `dt = 0` a stateful node takes its new target and keeps its position and velocity                                                            | PR 6                 |
| G7  | **The run does not report the current word.** `say`'s run reports the current viseme and its intensity as its feedback, and the utterance as the face's speech state; the text-to-speech provider's marks (`SpeechMark`, `npm/@vizij/runtime/src/audio.ts:43-48`) are visemes only. Where the word goes is bound to the open question of `say`'s feedback extending ROS4HRI's `Say` type.                                                                                                                                                                                                                                                                               | vizij-rs: the provider asks for word marks, and the run reports the current word on a key of its own                                                              | PR 7                 |
| G8  | **A direct edit of a key the composition writes is overwritten at the next step.** The rig's inputs carry an override stage (pipeline v1: `rig/<face>/override/<inputId>/{enabled,value}`, last in each input's pipeline; all 226 of Quori's rig inputs have it), but pose weights — which Quori's adaptation writes (19 of its 20 outputs) — have none, and a client write to any key the graph writes is replaced by the graph's next write.                                                                                                                                                                                                                          | decision G8 (section 5)                                                                                                                                           | PR 5                 |
| G9  | **To verify: authored channels resolve on the device as on the published 0.4 line.** `moduleAnimation` keys a track through the face's rig (vizij-rs `crates/interop/vizij-arora-host/src/lib.rs:413-450`): the channel as an input path, under the rig prefix, or as an input node's id, else under the rig prefix regardless. The bake resolves a track's input id first (`bakeAuthoredClips.ts:182-184`). Every track of Quori's shipped animations resolves under the prefix; an authored track on an input whose pipeline has no direct path resolves only by its id, so the timeline passes the track's input id as its channel where its channel names no input. | the timeline (PR 4)                                                                                                                                               | PR 4, if it fails    |
| G10 | **A face's channel resolution needs a loaded Vizij.** `ChannelKeys` reaches JavaScript only through `Runtime.moduleAnimation` of a Vizij on the canvas; a bake device (`startRuntime`) has none, and the published runtime-react 0.4's JavaScript resolver goes with it in PR 4.                                                                                                                                                                                                                                                                                                                                                                                        | vizij-rs: the resolution as a function of the face's glTF document (its rig), beside `composeVizij`                                                               | PR 4                 |

Not gaps, for the record: the plot's per-frame sampling (one value per output
per frame); the memory measure (`memoryBytes()` replaces the published
runtime-react 0.4's "Render loads" and "Runtime instances" counters); program
input ranges ([VIZ-198](https://linear.app/semio-ai/issue/VIZ-198), which can
land before or with this); `composeVizij` before any GLB exists (it reads
`VIZIJ_bundle` from the document's root extension).

## 4. Pull requests

A declared GitHub stack of pull requests into `integration/bevy-view`
(`gh stack link`), each building, typechecking and passing CI on its own; the
staging branch then lands on `main` in one pull request.

**The main face is one port.** The face the viewport draws is the one device
the inspector, the panels, the motion-graph editor and the timeline drive, so
the viewport cannot move onto the Bevy view without everything that drives
it. Moving part of the app first would mean two lines on one page — the
published runtime-react 0.4.1 for the main face (its `@vizij/runtime` 2.4
device and an r3f WebGL canvas) and the workspace line for the reference face
or the demo (the 25 MB `@vizij/runtime` 6 module and the Bevy canvas): two
WebGL contexts and two face runtimes, the Bevy canvas taking presses over the
main pane where the r3f canvas needs them, the document store read through two
copies of `@vizij/render` behind an npm alias
(`npm:@vizij/runtime-react@0.4.1`, `npm:@vizij/render@1.0.0`), and the memory
checkpoints measuring that mix. All of it would be deleted by the next pull
request, so the stack carries no alias.

**The port keeps today's behavior; the decided behavior follows.** PR 4 moves
the app onto the Bevy view with the published line's semantics, so it removes
nothing an author has now: the viewport composes the rig, pose driver and pose
graph, with no program from load; the device runs whether the viewer is
playing or paused, the viewer's pause acting on the active program or
animation; the speech panel's Polly timeline writes the face's viseme and
emotion pose weights through the `Runtime`. PRs 5–7 then bring decision C,
each once what it needs exists upstream.

| PR  | Title                                                                                 | Scope                                                                                                                                                                                                                                                                                                       | Proof                                                                                                                                                                                                                                                                                                                                        | Needs                                |
| --- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1   | vizij-authoring: the shared barrel exports what demo-graph-studio uses                | `src/shared/index.ts` keeps the dialog queue, file IO and the standard input paths; authoring imports `useVizijExport`, `useBundleAudit`, `usePoseGraphImport`, `useGraphPlaybackControls` by path (1.12)                                                                                                   | both apps typecheck and build; demo-graph-studio's module graph holds no `@vizij/render`, `@vizij/runtime` or `three`; `standalone-demos-smoke` boots `demo-graph-studio`; authoring smoke                                                                                                                                                   | —                                    |
| 2   | @vizij/render: Fit to Geometry measures ellipses and rectangles                       | `deriveRootBounds` measures a RobotData `ellipse`/`rectangle` node as its unit shape under its scale (G2), with a changeset                                                                                                                                                                                 | a render test: the bounds of a world of an ellipse and a rectangle, through `buildSceneGraph`, are the shapes' extents; render's tests and build                                                                                                                                                                                             | —                                    |
| 3   | vizij-authoring: profiles and skills on @vizij/runtime 6                              | `@vizij/runtime ^6.2.0`, the copy the workspace line peers on; `mapping`/`mappings` in place of the deprecated aliases; `useMotionGraphNamespace.ts`, which nothing imports, deleted. The bake keeps its composer and resolver until PR 4 (G10); the viewport stays on the published 0.4.1                  | `pnpm --filter vizij-authoring test` (the bake's device tests on runtime 6), `typecheck`, `lint`; the authoring smoke suite; the `profile-edition`, `profile-editor`, `standard-profile` and `skills` workflows                                                                                                                              | —                                    |
| 4   | vizij-authoring: the faces on the Bevy view                                           | `@vizij/render` and `@vizij/runtime-react` from the workspace; sections 1.2–1.13 and 2.1–2.7 with the published line's semantics above, the bake on `composeVizij` and the face's channel resolution included; reloads re-make the bytes on any world change, as the published line does                    | `pnpm --filter vizij-authoring test`, `typecheck`, `build`; `test:e2e:smoke` and `test:e2e` (memory thresholds excepted), with #158's picking, pixel and round-trip specs, the round trip comparing node transforms; root `e2e/tests/authoring-smoke.spec.ts`, `authoring-journey.spec.ts`; `standalone-demos-smoke` for `demo-graph-studio` | G3, G4 and G9 verified; G10 released |
| 5   | vizij-authoring: the face runs through its standard adaptation and its active program | the default composition with the active program (2.1); the program under edit takes its place while it plays; edits hold the keys they change while made (G8); the speech panel speaks through `say` with its live viseme timeline, the Polly timeline deleted (2.5); the speech config's group ids dropped | workflow specs: with the program and adaptation running, dragging a pose weight the adaptation writes shows the dragged value, and the adaptation's value returns on release; `say` from the panel fills the timeline with the run's visemes (stubbed text-to-speech deployment) and moves the mouth (pixels)                                | decision G8 and its fix              |
| 6   | vizij-authoring: a paused face shows each change without time passing                 | paused, the device is stopped and each change is followed by `rt.step(0)` (2.1)                                                                                                                                                                                                                             | a workflow spec: paused, an input change shows on the face, and a spring-smoothed output stays where it was apart from the input's effect                                                                                                                                                                                                    | G6 released                          |
| 7   | vizij-authoring: the speech timeline shows each word as the face says it              | the panel reads the run's current word (2.5)                                                                                                                                                                                                                                                                | a workflow spec over a stubbed text-to-speech deployment: the words of the utterance appear in order                                                                                                                                                                                                                                         | G7 released                          |
| 8   | vizij-authoring: reloads keyed on world structure; values apply in place              | the structural key; `setStaticFeature` for static values and animatable defaults; the load time of a structural edit (export, then `loadVizij` to ready) recorded in `docs/perf/`                                                                                                                           | a workflow spec: a colour scrub does not reload (the slot's `data-vizij-ready` never drops) and shows; a structural edit reloads; the recorded load time, accepted by Victor                                                                                                                                                                 | —                                    |
| 9   | vizij-authoring: the memory checkpoints run in StrictMode                             | `test:e2e:memory:dev`, where StrictMode's double effects run, records `memoryBytes()` beside the JS heap at each checkpoint                                                                                                                                                                                 | `preset-churn` and `reference-face-churn` grow by less than 1 MB                                                                                                                                                                                                                                                                             | —                                    |

PRs 1–3 need nothing from the others and land in any order; PR 4 follows
them; PRs 5–9 follow PR 4 in the order their needs are met. PR 4 is the
largest: everything that drives the main face moves with it. Its commits
follow section 1's order — the provider and the slot, the panels, the editor,
the timeline, the reference face and the demo, the speech panel, export — so a
reviewer can read it by commit; it is green as a whole.

## 5. Decisions

Decided with Victor on 2026-10-13 and 2026-10-17.

| #   | Question                                 | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Where the e2e gate is proven             | On the published three.js line, before the port: [#158](https://github.com/vizij-ai/vizij-web/pull/158) (picking, viewport pixels, export round trip).                                                                                                                                                                                                                                                                                                |
| B   | Where the main face's provider sits      | Around the workspace in `App.tsx`. Panels use `useOptionalVizijRuntime()` and `useAnimateValue()` directly; `graphRuntimeStore`'s bridge fields, the Viewer's bridges and the animation transport adapter are deleted.                                                                                                                                                                                                                                |
| C   | How the main viewport composes and plays | On play, the face runs through its standard adaptation and its active program, as any app drives it; only animations driving rig inputs, or an animation's parameters, bypass the adaptation. Paused, each change steps the whole behavior with no time passing (`step(0)`, G6). The speech panel speaks through `say` and builds its viseme timeline live from the run (2.5); Polly-driven pose writes go. A direct edit wins while it is made (G8). |
| D   | Cubic tangents (G1)                      | A tracked vizij-rs ticket, not blocking: authoring's timeline plays as on the published 0.4 line; the difference is with the baked glTF.                                                                                                                                                                                                                                                                                                              |
| E   | The `@vizij/authoring-shared` barrel     | It exports what both apps use (PR 1).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| —   | The speech config's group ids            | `visemeGroupId` and `emotionGroupId` go; `voice` stays (2.5).                                                                                                                                                                                                                                                                                                                                                                                         |

**Open: G8, how a direct edit wins over the composition's writes.**

- (a) **A device-side hold on store keys.** A client holds a key; while held,
  the device's own graphs and modules do not write it, and client writes do;
  releasing it returns the key to them. It lives in Arora's store and
  interpreter, reaches pages through arora-web and `@vizij/runtime`, and
  serves any client that drives a face by hand while its program runs —
  Semio Studio's sliders as much as authoring's. Nothing changes in the face.
- (b) **A write layer in the face.** Every key an author edits gets the rig's
  override stage: rig inputs have it already; pose weights gain it in the
  pose-driver graph the rig compiler emits (`@vizij/node-graph-authoring`).
  Authoring writes `override/<id>/{enabled,value}`. Every face carries two
  more inputs and a select per pose, and a key outside the rig and the pose
  driver — a program's input — has no layer.

Recommendation: (a). The precedence of a hand on a control over the face's
own behavior is a property of the device, not of one face's graph, and every
client of the device needs it.
