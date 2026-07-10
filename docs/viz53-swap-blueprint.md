# VIZ-53 Execution Blueprint — swap runtime-react from orchestrator-react to a single AroraDevice

Worktree: `/private/tmp/claude-501/-Users-victor-paleologue-Code-Semio-semio-studio/ac49f782-47ec-4083-9ae1-ecd760efb9ec/scratchpad/vizij-web-swap`, branch `feat/runtime-react-arora-device`. All refs relative to that root. Provider = `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx` (3429 lines; verified refs below against the file).

---

## 1. Contract to preserve

### 1a. MUST KEEP — runtime-react context members actually consumed by apps (`src/index.ts`, 59 lines, unchanged)

| Member | External consumers (representative) |
|---|---|
| `ready`, `loading`, `error`, `errors` | every app (e.g. vizij-standalone App.tsx:328,654; tutorial FaceApp.tsx:77) |
| `setInput(path, ValueJSON, shape?)` | all apps (demo-player FaceControlsPanel.tsx:150; showcase useMouseGaze.ts:22; authoring Viewer.tsx:185) |
| `animateValue` | showcase VoicePanel.tsx:50; tutorial hooks (usePoseHotkeys, useVisemeMouth, …) |
| `inputConstraints`, `assetBundle`, `faceId`, `namespace`, `rootId`, `outputPaths` | broadly used (authoring Viewer.tsx:322,401; standalone useWebSocketSync.ts:31) |
| `stagePoseNeutral` | RuntimeFaceFrame in authoring:28, showcase:32; demo-player PosePanel.tsx:18 |
| `step(dt, {forceRuntime})`, `stepHz` | showcase ShowcaseRuntime.tsx:76-84 (`step(1/hz,{forceRuntime:true})`), RigControlPanel.tsx:26; authoring RuntimeFaceControlsOverlay.tsx:46 |
| animation transport: `playAnimation/pauseAnimation/stopAnimation/seekAnimation/setAnimationLoop/setAnimationActive/getAnimationState` | authoring useAnimationTransport.ts:87-314; demo-player AnimationPanel.tsx:11-45; standalone App.tsx:399-536 |
| program transport: `playProgram/pauseProgram/stopProgram/getProgramState` | standalone App.tsx:346-572; demo-player ProgramsPanel.tsx:11-35; tutorials FaceApp.tsx:86 |
| `setGraphBundle` | authoring Viewer.tsx:356, useAnimationTransport.ts:91 |
| `controllers: {graphs: string[], anims: string[]}` — KEEP SHAPE, synthesize locally | demo-player App.tsx:58 + DiagnosticsPanel.tsx:13,61-64; standalone App.tsx:458 (dep-array signal); authoring Viewer.tsx:401 + MotionGraphDriverBridge.tsx:42 (resync signal) |
| Provider props: `assetBundle`, `namespace`, `autostart`, `initialInputs`, `onRegisterControllers` (Viewer.tsx:684), `transformOutputWrite` (Viewer.tsx:685), `driveOrchestrator` (standalone App.tsx:254; showcase ShowcaseRuntime.tsx:52; authoring ReferenceFaceRuntime.tsx:306) | keep `driveOrchestrator` name (or alias `driveRuntime`), semantics = gate on stepRuntime (Provider:3242) |
| All util/type exports: posePaths, faceControls, `resolveRuntimeUpdatePlan`, `VizijAssetBundle`, `PoseDefinition`, … | zero engine coupling in util layer — untouched |
| `useVizijRuntime`, `useOptionalVizijRuntime` (authoring useAnimationTransport.ts:451), `VizijRuntimeFace` | unchanged |

### 1b. Orchestrator-only — can drop or stub
- `orchestratorScope` prop (Provider:1266-1283): passed by showcase ShowcaseRuntime.tsx:53 (`"shared"`), authoring ReferenceFaceRuntime.tsx:307 (`"shared"`), demo-player App.tsx:254 (`"isolated"`). Keep the prop as an accepted no-op (every provider gets its own device; namespacing already isolates keys). Do NOT remove from prop types in this PR.
- `createOptions`/`autoCreate` props (Provider:1258-1259): no `CreateOrchOptions` equivalent; keep props, ignore `createOptions.schedule`, `autoCreate` maps to "auto init+startDevice on mount".
- `ShapeJSON` third arg on setInput (Provider:1544, 2469, 3228): only threaded through, never constructed — keep in signature, drop at device boundary.
- `useOrchFrame`/frames/conflicts/epochs: never exposed through runtime-react's surface — internal only, fully replaceable.
- Engine-side `registerAnimation` (Provider:2156-2187): drop; JS clip pipeline is the real playback path (see §4).

### 1c. Direct orchestrator-react imports in apps (NOT part of runtime-react surface, but 4 break when the internal `OrchestratorProvider` wrapper disappears)
1. **BREAKS**: apps/vizij-authoring `motiongraph/hooks/useMotionGraphDriver.ts:31` (`registerGraph/removeGraph`), `motiongraph/components/MotionGraphValueSampler.tsx:24` (`subscribeToFrame/getFrameSnapshot`), `motiongraph/components/InputValueBridge.tsx:32` (orchestrator `setInput/ready`) — these resolve `OrchestratorContext` from runtime-react's *internal* wrapper (Provider:1312-1318). After swap `useOrchestrator` throws.
2. **BREAKS**: apps/vizij-standalone `hooks/useWebSocketSync.ts:40` (`getPathSnapshot`) — same reason.
3. Harmless-dead: showcase `main.tsx:8` app-root `OrchestratorProvider`; authoring `ReferenceFacePanel.tsx:86` wrapper — runtime-react will ignore the parent context; wrappers become inert (remove in VIZ-54).
4. Untouched: apps/minimal-demo-orchestrator — wholly orchestrator, leave on orchestrator-react (delete in VIZ-54 or keep as orchestrator demo).

Minimal same-PR fixes: (a) `useWebSocketSync.ts` → replace `getPathSnapshot` with new runtime-react context member `getValueSnapshot(path)` (§2 table); (b) authoring motiongraph → wrap the motiongraph subtree in its OWN `<OrchestratorProvider>` inside vizij-authoring (keeps orchestrator-react as an app dep, isolates it from runtime-react; migration to device API deferred). MotionGraphDriverBridge's `controllers` resync signal keeps working via synthesized controllers.

---

## 2. New arora backend design

### 2a. Wiring
- New dep `@vizij/arora-web-wasm` in `packages/@vizij/runtime-react/package.json`, replacing `@vizij/orchestrator-react`. (Package does not exist in this worktree yet — it is the ARORA-52/VIZ-52 deliverable; blueprint assumes surface: `init(); startDevice(graphSpec?) -> AroraDevice { step(dtMs):boolean, setValue(path, ValueInput), writeValues(record), readValues(paths):Record<string,ValueJSON|null>, snapshot():Record<string,ValueJSON>, drainChanges():Record<string,ValueJSON|null> }`.)
- New internal module `packages/@vizij/runtime-react/src/engine/aroraEngine.ts` (~200 lines): module-global memoized `init()` promise (mirrors orchestrator-wasm index.ts:130-143 — one wasm module per realm, StrictMode-safe), `ensureDevice(composedSpec)` with create-promise dedupe (mirrors OrchestratorProvider.tsx:153-174), device ref never freed on unmount (leak-by-design parity, OrchestratorProvider.tsx:92-99).
- Delete the `OrchestratorProvider` JSX wrapper + parent-context detection (Provider:1273-1319); `runtimeTree` renders bare.

### 2b. Member-by-member replacement (useOrchestrator destructure, Provider:1434-1447 — verified)

| Old member (call sites) | Arora replacement |
|---|---|
| `ready` (1963, 2238, 2933, 3127) | `deviceRef.current !== null` state; same gating |
| `createOrchestrator(createOptions)` (1964) | `await init(); deviceRef.current = startDevice(composedSpec)` in the same effect (1962-1973). NOTE ordering change: device creation now needs the composed graph, so boot happens in/after `registerControllers` (1975-2235) rather than before it — restructure: effect computes composed spec → `ensureDevice(spec)` → seed `initialInputs` (2191-2204) via `device.writeValues` |
| `registerGraph` single-graph (2138) | fold into composed-spec build + `startDevice` |
| `registerGraph` program-play (3002) / `removeGraph` (1791, 2949, 2975, 3081) | recompose spec (rig+pose+active programs) and restart device (§3); keep `registeredGraphsRef` (1484) / `programControllerIdsRef` (1537) as the id bookkeeping |
| `registerMergedGraph` (2124-2135, verified) | JS graph composition, §3 |
| `registerAnimation` (2171) / `removeAnimation` (1803) | DELETE both call sites; JS clip pipeline unchanged (§4) |
| `removeInput` (2483 in clearAnimationInput, verified; 2519-2521 drives it) | **no device equivalent** — replace with: write default value from `inputConstraints` (extractInputConstraints Provider:224-277) if known, else write `{float:0}`; keep `stagedInputsRef.delete`. Decision D3 for Victor |
| `listControllers` (1788, 2206, 2859) | synthesize from local refs: `{graphs:[...registeredGraphsRef], anims:[]}` (or anims = JS clip ids so DiagnosticsPanel/Viewer keep showing them — Decision D4). Keeps `onRegisterControllers` (2220) + MotionGraphDriverBridge resync working |
| `setInput` → `orchestratorSetInput` (2469, 2473, 3228) | `flushStagedInputs` (3223-3231, verified) becomes ONE `device.writeValues(Object.fromEntries(staged → path:value))`; immediate-mode single writes (2469/2473) → `device.setValue(path, value)`. Shape arg dropped at boundary. Value vocab: staged values are legacy `{float:n}` ValueJSON (1721, 2372, 2425, 3098) — device takes `ValueInput` which per VIZ-52 surface accepts ValueJSON; conversion to AroraValue lives inside arora-web-wasm, NOT here (verify — Risk R1) |
| `getPathSnapshot` (2710 animateValue-from; 944 program seeding) | `device.readValues([p])[p]`, mapping `null → undefined` (944 checks `!== undefined`). Semantics check: orchestrator echoed local setInput into its cache synchronously (load-bearing for read-your-own-write); arora `setValue` writes the store directly so `readValues` sees it immediately — same behavior, no JS cache needed (verify — Risk R2) |
| `step: stepRuntime` (3243, verified) | `device.step(dt * 1000)` — **s→ms conversion at exactly this one line**; boolean return ignored (or used to skip the drain when false). rAF/idle loops (3249-3274, 3276-3307) and loopMode machine (1671-1691) unchanged — runtime-react already owns the loop (`autostart={false}` always, Provider:1315); `driveOrchestratorRef` gate (3242) unchanged |
| `useOrchFrame` (1448) + frame effect (2259-2356, verified) | replace push-model with pull: inside `step()` immediately after `device.step()`, call `device.drainChanges()` and run the same body: filter golden keys `arora/dt`/`arora/time` FIRST (prefix check `path.startsWith("arora/")`), then `normalisePath`/`stripNamespace` (188/298), tracked-output filter via `namespacedOutputPathsRef`/`baseOutputPathsRef` (2274-2295), pose-control re-stage bridge (2300-2332 — keep initially, see §3), `valueJSONToRaw` (utils/valueConversion.ts:48-134), `transformOutputWrite` (2337-2348), batch `store.getState().setValues` (2353-2355). `null` entries in drainChanges: skip for render store (today's merged_writes never delete). Extract the effect body into `applyEngineChanges(changes: Record<string, ValueJSON|null>)` called from `step()` — no React state/effect for frames anymore (removes one render per tick; useOrchFrame re-rendered the provider every step) |
| `stepHz` EMA (3235-3239, verified) | keep local EMA on JS dt; ignore golden `arora/dt` (simpler, no unit juggling with u64 ns) |
| new: `getValueSnapshot(path)` context member | thin wrapper over `readValues` — replacement target for standalone useWebSocketSync.ts:40 |

### 2c. Type import surgery (Provider:20-36)
- `ValueJSON`, `ShapeJSON`, `valueAsNumber` → import from `@vizij/value-json` (already a transitive dep; valueAsNumber already from there at :36).
- `WriteOp` → delete (drainChanges is a Record).
- `GraphRegistrationConfig`/`GraphSubscriptions`/`MergeStrategyOptions`/`ControllerId` → local type defs in `types.ts` (subs kept only as metadata feeding the tracked-output sets — device has no subscription filtering; JS-side filtering at 2274-2295 already does the job).
- `AnimationRegistrationConfig`/`AnimationSetup` (types.ts:119-124, :122 references orchestrator-wasm) → define locally (`{player?:{loop_mode,speed}, instance?:{weight,…}}`) so `VizijAnimationAsset.setup` keeps compiling; consumed only by JS transport now.
- `hooks/useRigInput.ts:9` → value-json import.
- `compileIrGraph` (Provider:35,495) unchanged — emits vizij-graph-core GraphSpec (node-graph-authoring/src/ir/compiler.ts:18-54), which is what `startDevice(graphSpec)` consumes; `namespaceGraphSpec` (357-401) carries over verbatim since device input nodes read store key = `params.path`.

---

## 3. Graph composition — yes, multiple graphs are real

Today's registrations per provider (verified Provider:2120-2141): (a) rig graph (2005-2059) + (b) pose graph (2061-2087) merged via `registerMergedGraph` with `DEFAULT_MERGE {outputs:"add", intermediate:"add"}` (130-133) whenever both exist; (c) program graphs registered/removed DYNAMICALLY on play/stop (syncProgramPlaybackControllers 2932-3024); (d) animation controllers (going away).

**Minimal composition strategy — new `src/utils/composeGraph.ts` (~120 lines):**
1. `composeGraphSpecs(specs: {sourceId, spec}[]): GraphSpec` — union nodes/edges with node-id prefixing `${sourceId}::${nodeId}` (edge `from.node_id`/`to.node_id` rewritten; EdgeSpec shape per node-graph-wasm types.d.ts:203-222). `params.path` NOT prefixed (path identity is the cross-graph contract).
2. Output-path collision policy: detect `output` nodes sharing a `params.path` across sources; phase 1 = warn + last-writer-wins (rig∩pose output sets don't collide in current bundles — verify per bundle, Risk R5). Implement an `add` combiner node only if a real bundle collides.
3. Cross-graph feedback (pose→rig): on the shared store this is NATIVE — pose graph outputs `rig/<f>/pose/control/<id>` land in the store, rig input nodes with the same `params.path` read them next tick. Keep the JS pose-control bridge (2300-2332) in phase 1 (its epsilon cache makes it idempotent/harmless), delete once verified — the comment at 2307-2310 documents it exists only because orchestrator merged graphs don't recycle outputs.
4. **Dynamic programs**: `playProgram` → recompose `[rig, pose, ...activePrograms]` → `startDevice(newSpec)` replaces the device; `stopProgram`/`pauseProgram` → recompose without it. Before restart: `const snap = device.snapshot()` (minus `arora/*`), after restart: `newDevice.writeValues(snap)` to preserve store state (inputs, mid-animation values). Program seeding (deriveProgramInputSeedValues, 944, 3038) works on top via readValues. If `startDevice` on arora-web's shared store already preserves the namespace store across devices, the snapshot/restore is skippable — verify (Risk R3).

---

## 4. What stays on old wrappers temporarily + the isolating seam

- **Animation**: nothing stays on orchestrator. Engine-side `registerAnimation` is deleted; the ONLY functional playback path is already pure JS: `clipPlayback.ts` (sampling :216-278, transport :169-200), `animationBridge.ts` (fanout :15-77, weighted sums :105-137, aggregate diff :139-177), tween system (Provider:2410-2434, 2662-2744), clip transport (2746-2860). These need only 4 engine primitives — write-by-path, read-by-path, step, change feed — all covered by the device. Known behavior loss: orchestrator animation controllers AUTO-PLAYED LOOPING from registration (vizij-rs animation engine defaults speed=1/Loop) and their `rig/...` writes passed the output filter — any app relying on that ambient idle motion loses it (Risk R6). `anim.setup.player/instance` passthrough becomes dead metadata (map `setup.player.loop_mode/speed` onto initial `ClipPlaybackState` for parity — 5 lines).
- **orchestrator-react/orchestrator-wasm packages**: untouched in this repo; remain deps of apps that direct-import (vizij-authoring for motiongraph via its own new wrapper §1c, minimal-demo-orchestrator, showcase/ReferenceFacePanel wrappers until VIZ-54). **The seam** = runtime-react's public context; after this PR, runtime-react has zero orchestrator imports, and every remaining orchestrator use is an explicit app-level `OrchestratorProvider` that VIZ-54 deletes.
- vite configs keep `optimizeDeps.exclude` for orchestrator-wasm where apps still depend on it; add `@vizij/arora-web-wasm` to exclude lists + fs.allow everywhere runtime-react is used (7 app vite.configs).

---

## 5. File-by-file edit plan (est. diff scope)

| File | Change | Est. |
|---|---|---|
| `packages/@vizij/runtime-react/package.json` | swap dep orchestrator-react → arora-web-wasm | ~4 |
| `packages/@vizij/runtime-react/src/engine/aroraEngine.ts` | NEW: init memoization, ensureDevice dedupe, restart-with-snapshot helper | ~200 new |
| `packages/@vizij/runtime-react/src/utils/composeGraph.ts` | NEW: composeGraphSpecs + collision warn | ~120 new |
| `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx` | imports (20-36); delete OrchestratorProvider wrapper/scope plumbing (1273-1319, keep props as no-ops); replace useOrchestrator/useOrchFrame (1434-1448) with device manager; boot effect (1962-1973); registerControllers → compose+startDevice (1975-2235, delete registerAnimation 2156-2187); frame effect → `applyEngineChanges` called from step (2259-2356 + golden-key filter); clearAnimationInput→default-write (2478-2485); flushStagedInputs→writeValues (3223-3231); step s→ms (3243); getPathSnapshot→readValues (2710, 944); program sync→recompose+restart (2875-3024, 3081); clearControllers sweep (1787-1823); controllers synthesis (2206, 2859) | ~450-600 delta |
| `packages/@vizij/runtime-react/src/types.ts` | local AnimationSetup/GraphSubscriptions/controller types (:122 etc.) | ~40 |
| `packages/@vizij/runtime-react/src/hooks/useRigInput.ts` | :9 import swap | ~2 |
| `packages/@vizij/runtime-react/src/index.ts` | export `getValueSnapshot` type only if surfaced; otherwise none | ~0-4 |
| runtime-react tests (`clipPlayback`, `animationBridge` untouched; provider tests re-mock device) | mock AroraDevice instead of orchestrator ctx | ~150 |
| `apps/vizij-standalone/src/hooks/useWebSocketSync.ts` | :5,40 → runtime.getValueSnapshot | ~10 |
| `apps/vizij-authoring` motiongraph (`MotionGraphDriverBridge.tsx` or parent) | wrap motiongraph subtree in own `OrchestratorProvider` | ~15 |
| 7× app `vite.config.ts` (+tsconfig paths) | add arora-web-wasm alias/exclude | ~5 each |
| `apps/*` everything else | **zero source changes** (tutorials, speech-react, demo-player, showcase components are surface-only) | 0 |

Untouched: `utils/{posePaths,faceControls,poseRuntime,clipPlayback,animationBridge,graph,valueConversion}.ts`, `updatePolicy.ts`, `VizijRuntimeFace.tsx`, hooks except useRigInput import.

---

## 6. Risks / decisions for Victor

- **R1 — value vocab at the wasm boundary**: blueprint assumes `ValueInput`/`ValueJSON` on the device surface means arora-web-wasm internally maps ValueJSON↔AroraValue (`{f32}`/`{f64}` externally-tagged serde, arora-types/src/value.ts:11-43) including vizij composites (vec3/quat/color/transform/record) that have no native AroraValue equivalent. `valueJSONToRaw` (valueConversion.ts:48-134) needs the normalized `{type,data}` or legacy keyed form back out. If VIZ-52 doesn't round-trip composites, rig transforms break. Verify against the actual VIZ-52 package before starting.
- **R2 — read-your-own-write**: orchestrator's setInput synchronously echoed into its path cache (OrchestratorProvider.tsx:244-265, load-bearing for UI controls and animateValue-from). Confirm `device.setValue` → `device.readValues` reflects immediately, pre-step.
- **R3 — device restart on program play/stop**: does `startDevice` on the shared store preserve the namespace's keys, or does each device get a fresh store? Determines whether snapshot/restore (§3.4) is needed, and whether a `device.replaceGraph`-style API is worth adding to VIZ-52 instead (recommended if programs are used heavily — restart is O(store) per play/stop).
- **D3 — removeInput semantics**: clearAnimationInput today removes the blackboard override so graph defaults resume. Proposed: write default from inputConstraints (fallback `{float:0}`). Alternative: add `removeValue(path)` to the device surface. Wrong choice = faces stuck in last animation pose after clip stop.
- **D4 — `controllers.anims` synthesis**: `[]` vs JS clip ids. DiagnosticsPanel (demo-player) renders the list; Viewer.test.tsx:80 mocks `{graphs:[]}`. Cosmetic but user-visible.
- **R5 — output-path collisions rig∩pose**: "add" merge is currently declared but believed unused; phase-1 last-writer-wins must be validated against real asset bundles (authoring + standalone bundles).
- **R6 — loss of ambient engine-side animation looping** (§4): audit whether any app's idle motion comes from auto-looping registered clips rather than JS playAnimation.
- **D7 — orchestratorScope="shared"**: two providers sharing one orchestrator (showcase sections, authoring reference face) become independent devices. arora-web's per-device namespaced Runtime on a shared store is the intended replacement — confirm two `startDevice` calls in one realm share the store (so cross-provider paths still interact) or accept full isolation.
- **D8 — motiongraph endgame**: app-level OrchestratorProvider wrapper is a stopgap; real fix is either a runtime-react "aux graph" device API or recomposing the motion graph into the main device spec. Scope decision (this PR vs VIZ-54).