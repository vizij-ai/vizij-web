# `@vizij/runtime-react` 1.0 and `@vizij/render` 1.0: design

**Status: proposal**, for review before implementation. Tickets:
[VIZ-147](https://linear.app/semio-ai/issue/VIZ-147) (the packages and every app
except authoring) and [VIZ-148](https://linear.app/semio-ai/issue/VIZ-148) (the
authoring app). Umbrella: [VIZ-158](https://linear.app/semio-ai/issue/VIZ-158).
Line references are to vizij-web `origin/main` at `8f9ea296` and vizij-rs
`origin/main` at `cc0b2fe` (`@vizij/runtime` 4.1.0, npm `latest`).

Every Vizij face in the browser is drawn by the Bevy view of the vizij-rs
`vizij` crate, shipped as [`@vizij/runtime`](https://github.com/vizij-ai/vizij-rs/blob/main/npm/@vizij/runtime/README.md).
One wasm module serves the page: `mount` the canvas once, `loadVizij` each face
into a slot of it. Each face is a device, and its `Runtime` hands out that
device's Arora surface: `call`, `invoke`, `spawn`, `halt`, `listKeys`,
`describeMethods`, the store (`readValues`, `writeValues`, `setValue`,
`snapshot`, `drainChanges`) and `loadGraph` / `applyGraphEdits`. The rest is the
view (`placeVizij`, `setView`, `safeArea`, `drainPicks`, `setSelection`,
`hold` / `release`, `setStaticFeature`), `describe()`, and a few codecs.

## 1. The rule this design follows

**`@vizij/runtime-react` adds a function only where React needs one.** A
provider that owns a face's lifecycle and its one change cursor, hooks that
subscribe a component to keys, and `animateValue` as a JS tween are React
plumbing. A device call wrapped under a new name is not: apps call the
`Runtime` and the `@vizij/runtime` functions directly. Each export below
carries its justification against this rule.

The same rule decides how apps drive a face (section 4): through the device's
own surface — its standard keys and the skills and module functions it
declares — rather than through JS behaviors that duplicate what the device
already does.

## 2. Packages

| Package                     | Version  | Role                                                                                                                          |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `@vizij/runtime` (vizij-rs) | `^4.1.0` | The view and the device: everything an app calls on a face. Already npm `latest`.                                             |
| `@vizij/render`             | 1.0      | The page's canvas and the face slot (`<VizijCanvas>`, `<Vizij>`); the GLB loader, the exporter and the world types.           |
| `@vizij/runtime-react`      | 1.0      | One face's lifecycle in React and the fan-out of its store changes.                                                           |
| `@vizij/speech-react`       | deleted  | Its only code consumer, `apps/vizij-standalone`, drops it in [vizij-web#128](https://github.com/vizij-ai/vizij-web/pull/128). |

`@vizij/runtime` is a **peer dependency** of both `@vizij/render` and
`@vizij/runtime-react`, so a page resolves one copy of it and therefore one
wasm module: two copies would each `init()` a module of their own.
`runtime-react` drops its dependencies on `@vizij/animation-module`,
`@vizij/node-graph-authoring`, `@vizij/utils` and `@vizij/value-json`
(`ValueJSON` and `ValueInput` come from `@vizij/runtime`).

## 3. `@vizij/render` 1.0

### 3.1 The page's canvas: `<VizijCanvas>`

```tsx
<VizijCanvas options?: MountOptions className? style? />
```

Renders the page's one `<canvas>` and, on first mount, `init()` and
`mount(canvas, options)`. The mount is a module-level singleton, so a second
`<VizijCanvas>` or React StrictMode's second effect joins the first rather than
mounting again (the shape of `mountCanvas` in vizij-web#128's
`apps/vizij-standalone/src/face.ts`). `canvasMounted(): Promise<HTMLCanvasElement>`
is exported for the provider to await before `loadVizij`.

It owns two per-page loops, one animation frame each:

- **Placement.** For each mounted `<Vizij>` slot it reads the slot's rectangle
  relative to the canvas and calls `placeVizij` when it changed. Reading every
  frame follows scrolling, resizes and layout shifts alike; a `ResizeObserver`
  sees only resizes.
- **Picks.** `drainPicks()` has one cursor per page, so the canvas drains it
  and hands each pick to the slot whose `vizijId` it names.

Justification: one wasm App per page and one pick cursor per page each need
exactly one owner.

Default style: `position: fixed; inset: 0; pointer-events: none`, over the page
content. Faces then draw wherever their slots lie, whatever backgrounds the
sections between have, and the page's own UI keeps its pointer events. A page
that needs picks (the authoring viewport) positions the canvas itself and
gives it pointer events — `className` and `style` replace the default. See
decision D2.

### 3.2 The face slot: `<Vizij>`

```tsx
<Vizij
  vizijId: string
  className? style?
  toneMapping?: ToneMapping
  fit?: Fit  zoom?: number | [number, number]  bounds?: Bounds
  showSafeArea?: boolean
  selection?: string[]
  onPick?: (pick: Pick) => void
/>
```

A `<div>` marking where face `vizijId` draws. It renders no canvas. It carries
`data-vizij-id` and `data-vizij-ready` (the canvas loop reads `ready(vizijId)`),
which every app's e2e uses as its ready signal.

| 0.x prop              | 1.0                                        | Why                                                                                                  |
| --------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `style`, `className`  | kept                                       | they now size and place the slot                                                                     |
| `rootId`, `namespace` | `vizijId`                                  | a slot is named by its face; the render-store namespace has no role in the view                      |
| `toneMapping`         | kept → `setView(vizijId, { toneMapping })` | per-face tone mapping is the view's ([VIZ-169](https://linear.app/semio-ai/issue/VIZ-169))           |
| —                     | `fit`, `zoom`, `bounds` → `setView`        | the framing a page set by writing `world[rootId].rootBounds` (showcase, authoring)                   |
| `showSafeArea`        | kept → an outline at `safeArea(vizijId)`   | a DOM overlay over the framed bounds                                                                 |
| `showSelectionGlow`   | `selection` → `setSelection(vizijId, ids)` | the glow is the view's; the selection was read from the render store, which no longer feeds the view |
| `onPointerMissed`     | `onPick`                                   | a miss is a pick with `elementId: null`; one callback covers presses on and off elements             |

### 3.3 Deleted

The r3f `Canvas` and `InnerVizij` (`src/vizij.tsx`), the renderables
(`src/renderables/*`), the selection glow (`src/effects/selection-glow-effect.tsx`),
the feature hooks (`src/hooks/use-features.ts`), the store's three.js hit
selection (`src/store.ts:75-79`), the canvas render counters, and the `three`,
`@react-three/fiber`, `@react-three/drei` dependencies outside the loader and
exporter. Done when `three` is imported only under `src/functions/load-gltf*`,
`src/functions/gltf-loading/`, `src/functions/export.ts` and
`src/functions/vizij-bundle.ts`.

### 3.4 Kept

The loader (`load-gltf*`, `gltf-loading/*`, `deriveRootBounds`, morph keys),
the exporter (`export.ts`, `vizij-bundle.ts`), the world and bundle types, and
the zustand store with its hooks, which remains the authoring app's document
model. [VIZ-140](https://linear.app/semio-ai/issue/VIZ-140) is changing the
loader and exporter in parallel (branch `feat/viz-140-render-export-bytes`:
bytes out, buffer-first parse, no React refs in the world types); this design
does not touch those files.

### 3.5 What the exporter must keep: ellipse and rectangle RobotData

The Bevy view converts a RobotData `ellipse` or `rectangle` into a shape
itself: a unit circle or plane scaled by `width` and `height`, filled from
`fillColor` and `fillOpacity`, stroke dropped (vizij-rs
`crates/vizij/src/view/meta.rs:180-230,394-408`; `@vizij/runtime` 4.1.0
changelog, 9dc784c). A GLB node carrying that RobotData is enough: the view
generates the mesh and its material.

So **every headless export path** — VIZ-140's scene builder, authoring's world
→ GLB in `ExportDialog` (VIZ-148) — **writes each ellipse and rectangle
element's RobotData with `type`, `width`, `height`, `fillColor` and
`fillOpacity`**, static or animated. No JS-side conversion to a mesh is needed.
Today that RobotData is attached by the mounted renderables
(`renderables/ellipse.tsx:72-78`, `renderables/rectangle.tsx:72-78`, through
`createStoredRenderable`, `functions/create-stored-data.ts:8-18`), which 1.0
deletes; the headless builder emits it from the world entry instead. No shipped
face carries either kind ([VIZ-149](https://linear.app/semio-ai/issue/VIZ-149)),
so VIZ-140's round-trip test adds an ellipse and a rectangle fixture.

## 4. How apps drive a face

The shipped faces carry their `standard-adaptation` graph and declare the
`vizij-face` profile ([VIZ-171](https://linear.app/semio-ai/issue/VIZ-171)).
`loadVizij` composes the rig, pose and adaptation graphs and, by default, the
built-in ROS4HRI mapping (`ComposeVizijOptions`, `@vizij/runtime`
`src/index.ts:1172-1185`). A key a composed graph writes every step cannot be
commanded beside it: the graph overwrites the write at the next step. The
ROS4HRI mapping writes 65 of the profile's 88 keys — the expressions ROS4HRI
names, the eye positions, the muscle tier including
`standard/vizij/mouth/morph/jaw_open` (vizij-rs `docs/ros4hri.md:419-423`) — and
the adaptation writes the face's own pose weights.

**Proposal (decision D1):** apps command a face through the device surface a
ROS client or Studio uses, and write a profile key directly only where no
composed graph writes it:

| Intent                          | 1.0                                                                                 |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| an expression at an intensity   | `standard/ros4hri/expression/name` + `…/arousal` (the intensity, 0..1, since 4.1.0) |
| `concerned`, `sleepy`           | `rig/<faceId>/standard/vizij/expression/<name>` (no ROS4HRI name)                   |
| idle gaze                       | `invoke("look_at", { policy: "idle", … })`, one run                                 |
| pointer gaze, a held gaze       | a `look_at` run (policy `""`), its target steered through the run's `update` keys   |
| a glance                        | `look_at` with policy `glance`                                                      |
| idle blink                      | the ROS4HRI mapping's blink generator; nothing to do                                |
| a blink                         | `rig/<faceId>/standard/vizij/blink`                                                 |
| a viseme from a phoneme aligner | `invoke("play_viseme", { shape, weight })`, once per viseme                         |
| speech from text                | `invoke("say", { text, voice })`                                                    |
| jaw from audio volume           | `standard/ros4hri/au/26` (see D6)                                                   |
| conversation state              | `rig/<faceId>/standard/vizij/conversation/{speaking,user_speaking,thinking}`        |
| back to rest                    | `invoke("reset")`, or `invoke("reset_keys", { keys: { strs } })`                    |
| a program                       | `invoke("run_behavior", { name, behavior })`, `halt(run)`                           |
| an animation                    | the animation module's functions by name (`play`, `set_weight`, `seek`, …)          |

`rig/<faceId>/` is `runtime.rigPrefix`; `runtime.path(relative)` builds those
keys. A page that inspects a face's own rig rather than the standard
(demo-vizij-player's rig and pose panels, the showcase's rig sliders, the
authoring viewport) loads it without the adaptation and the mapping —
`options: { graphs: ["rig", "pose-driver", "pose"], ros4hri: false }` — and
writes rig inputs and `poses/<id>.weight` directly.

## 5. `@vizij/runtime-react` 1.0

### 5.1 Surface

```ts
type VizijSource = string | URL | Blob | ArrayBuffer | Uint8Array;

interface VizijRuntimeProviderProps {
  glb: VizijSource;
  vizijId?: string; // default: derived from React's useId()
  options?: VizijOptions; // loadVizij's options, passed through unchanged
  run?: boolean; // default true
  children: ReactNode;
}

interface VizijRuntimeContextValue {
  vizijId: string;
  status: "loading" | "ready" | "error";
  error: Error | null;
  behaviorError: string | undefined;
  runtime: Runtime | null; // @vizij/runtime's, unwrapped
  description: VizijDescription | null; // describe(glb)
}

function useVizijRuntime(): VizijRuntimeContextValue;
function useOptionalVizijRuntime(): VizijRuntimeContextValue | null;
function useVizijValues(paths: string[]): Record<string, ValueJSON | null>;
function useVizijChanges(
  listener: (changes: Record<string, ValueJSON | null>) => void,
): void;
function useAnimateValue(): {
  animateValue(
    path: string,
    target: number,
    options?: AnimateValueOptions,
  ): Promise<void>;
  cancelAnimation(path: string): void;
};
function VizijRuntimeFace(props: Omit<VizijProps, "vizijId">): ReactNode;
```

| Export                                       | Justification                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VizijRuntimeProvider`                       | A face's lifecycle in React: fetch the bytes, `describe`, place-then-`loadVizij` once `canvasMounted()` resolves, `whenReady`, `run()` or `stop()` as `run` says, and on a new `glb` reload through `loadVizij` on the same `vizijId` (the previous scene draws until the new one is ready), then dispose the old `Runtime`; on unmount `stop`, `unloadVizij`, `dispose`. |
| — its change drain                           | `drainChanges()` has one cursor per `Runtime`, so the provider is its only caller: once per animation frame, and once after each (re)load, whose first drain is the whole state. It fans each batch out to the subscribers below.                                                                                                                                         |
| `useVizijRuntime`, `useOptionalVizijRuntime` | Read the context. `runtime` is `@vizij/runtime`'s `Runtime` as is: every device operation is called on it.                                                                                                                                                                                                                                                                |
| `status`, `error`, `behaviorError`           | Load state as React state; `behaviorError` follows `runtime.behaviorErrorChanged()`.                                                                                                                                                                                                                                                                                      |
| `description`                                | `describe(glb)` as React state, for the controls a page builds (poses, rig inputs, programs, animations, metadata, `rootBounds`).                                                                                                                                                                                                                                         |
| `useVizijValues(paths)`                      | Re-renders a component when one of these keys changes: seeded from `runtime.readValues`, then from the provider's batches.                                                                                                                                                                                                                                                |
| `useVizijChanges(listener)`                  | The raw batches, for consumers that must not re-render per change (scrubbers, samplers, bridges).                                                                                                                                                                                                                                                                         |
| `useAnimateValue()`                          | A JS tween over `runtime.readValues` / `runtime.setValue`, per animation frame, eased, cancelled on unmount or by a newer tween on the same path. No device call shapes a client write over time.                                                                                                                                                                         |
| `VizijRuntimeFace`                           | `<Vizij>` bound to the provider's `vizijId`: the one mount site every app has today stays one line.                                                                                                                                                                                                                                                                       |

`run`: `true` hands the device to `runtime.run()`; `false` calls
`runtime.stop()` and the page paces it with `runtime.step(dtMs)` (milliseconds).
The drain is per frame either way, so a page stepping faster than its frame
rate sees the last value of each key per frame.

### 5.2 Deleted from 0.4

| 0.4                                                                                                                                                                       | Replaced by                                                                                      | Why it goes                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| the value mirror (`applyEngineChangesRef` → render store `setValues`, `VizijRuntimeProvider.tsx:1930,2805`)                                                               | `useVizijValues`, `useVizijChanges`                                                              | the view reads the device's store itself                                                                      |
| the JS graph composer (`utils/composeGraph.ts`, `composeGraphSpecs`)                                                                                                      | `loadVizij` / `composeVizij`                                                                     | composition is the device's (`vizij::face`), one implementation                                               |
| the three.js bundle extraction and `mergeAssetBundle` (`:1457-1465`)                                                                                                      | `describe(glb)`                                                                                  | [VIZ-166](https://linear.app/semio-ai/issue/VIZ-166)                                                          |
| JS neutral staging (`stagePoseNeutral`, `stageNeutralFilter`)                                                                                                             | `loadVizij`'s `stageNeutral` (default true), `invoke("reset")`                                   | the rest module; authored defaults keep colours (VIZ-171)                                                     |
| the `namespace/` prefix (`:360-420`), `namespace`                                                                                                                         | `runtime.rigPrefix`, `runtime.path()`                                                            | a face's paths are its own                                                                                    |
| the guest-module loader (`engine/animationModule*.ts`)                                                                                                                    | `VizijOptions.modules`                                                                           | the device links the animation module                                                                         |
| the JS clip pipeline (`utils/clipPlayback.ts`, `utils/animationBridge.ts`) and the animation calls                                                                        | the animation module's functions, `decodePlayerStates`                                           | [VIZ-168](https://linear.app/semio-ai/issue/VIZ-168)                                                          |
| program play / pause / stop / state                                                                                                                                       | `run_behavior`, `halt`, `BEHAVIOR_RUNS`, `runStatus`                                             | [VIZ-167](https://linear.app/semio-ai/issue/VIZ-167); pause: D3                                               |
| `setInput`, `setValue(id, namespace)`                                                                                                                                     | `runtime.setValue` / `writeValues`                                                               | the store's own writes                                                                                        |
| `getValueSnapshot`, `getStoreSnapshot`                                                                                                                                    | `runtime.readValues`, `runtime.snapshot`                                                         | the store's own reads                                                                                         |
| `subscribeToStoreChanges`, `subscribeToStep`                                                                                                                              | `useVizijChanges`                                                                                | per frame, from the one drain                                                                                 |
| `setGraphBundle`, `updateTier`, `resolveRuntimeUpdatePlan`, `mergeStrategy`, `onRegisterControllers`                                                                      | a new `glb` (reload), `runtime.loadGraph`, runs                                                  | there is no JS registration                                                                                   |
| `transformOutputWrite`, `RuntimeOutputWrite`                                                                                                                              | `runtime.hold` / `release`                                                                       | [VIZ-170](https://linear.app/semio-ai/issue/VIZ-170)                                                          |
| `registerInputDriver`                                                                                                                                                     | a component writing through `runtime`                                                            | no consumer                                                                                                   |
| `setAnimationActive`, `isAnimationActive`, `autoCreate`, `autostart`, `driveRuntime`, `stepHz`                                                                            | `run`                                                                                            | the device paces itself                                                                                       |
| `inputConstraints`                                                                                                                                                        | `description.rigInputs`, `profile("vizij-face", rigPrefix)`                                      | ranges come from the bundle and the profile                                                                   |
| `outputPaths`, `controllers`, `errors`                                                                                                                                    | `listKeys`, `description.graphs`, `listKeys(BEHAVIOR_RUNS)`, `error` / `behaviorError`           | the device lists itself                                                                                       |
| `resolveFaceControls`, `mapNormalizedControlValue`, `mapUnitControlValue`                                                                                                 | profile keys                                                                                     | the profile's gaze keys are `[-1, 1]` and its lids and blink `[0, 1]`; the adaptation maps them onto each rig |
| the pose helpers (`buildPoseWeightPathMap`, `filterPosesBySemanticKind`, `resolvePoseSemantics`, `buildSemanticPoseWeightPathMap`, `*_POSE_KEYS`, `buildRigInputPath`, …) | expression and viseme profile keys; `description.poses` with `runtime.path("poses/<id>.weight")` | emotion and viseme semantics are the profile's tiers                                                          |
| `collectInputPathMap`, `resolveAnimationBridgeOutputPaths`                                                                                                                | `runtime.moduleAnimation`, `composeVizij`                                                        | the device resolves a channel to its key                                                                      |
| the `VizijAssetBundle` family of types                                                                                                                                    | `VizijSource`, `VizijOptions`, `VizijDescription`                                                |                                                                                                               |
| `memoryInvestigation.ts`                                                                                                                                                  | `memoryBytes()`                                                                                  | the module's memory is the measure                                                                            |

## 6. Mapping: every call the apps make

Inventory by grep over `apps/<app>/src` for `@vizij/runtime-react`,
`@vizij/render`, `useVizijRuntime` and each context member. In the 1.0 column,
`rt` is the context's `runtime`, `d` its `description`, and `P(x)` is
`rt.path(x)`.

### 6.1 tutorial-fullscreen-face

| Site                             | 0.4                                                                               | 1.0                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `FaceApp.tsx:17-27`              | `VizijAssetBundle` `{ namespace, glb: url aggressive, pose.stageNeutralFilter }`  | `glb={faceAssetUrl}`                                                                                         |
| `FaceApp.tsx:150`                | `<VizijRuntimeProvider assetBundle autostart>`                                    | `<VizijRuntimeProvider glb options={{ program: autoplay ? "auto" : "none" }}>`                               |
| `FaceApp.tsx:30,43,98-114`       | `loading`, `error`, `ready`                                                       | `status`, `error`                                                                                            |
| `FaceApp.tsx:43,54-57`           | `stagePoseNeutral()` on ready                                                     | deleted: `stageNeutral` at load                                                                              |
| `FaceApp.tsx:60-85`              | `?autoplay` → find `activeMotionGraphId` → `playProgram`                          | `options.program` (`"auto"` runs the bundle's active program as a run)                                       |
| `FaceApp.tsx:125`                | `<VizijRuntimeFace className showSafeArea={false}>`                               | `<VizijRuntimeFace className>`, `<VizijCanvas>` at the page root                                             |
| `hooks/useMouseGaze.ts:17-25`    | `setInput`, `faceId`, `assetBundle`, `inputConstraints`, `resolveFaceControls`    | a `look_at` run, target from the pointer                                                                     |
| `hooks/useMouseGaze.ts:42-43`    | `setInput(eye, mapNormalizedControlValue(…))`                                     | `rt.setValue(handle.update[target], point)`                                                                  |
| `hooks/usePoseHotkeys.ts:64-73`  | `filterPosesBySemanticKind`, `getPoseSemanticKey`, `EXPRESSIVE_EMOTION_POSE_KEYS` | the profile's `expression` and `viseme` tiers                                                                |
| `hooks/usePoseHotkeys.ts:98-104` | `faceId`, `animateValue`, `buildPoseWeightPathMap`                                | `useAnimateValue`                                                                                            |
| `hooks/usePoseHotkeys.ts:148`    | `animateValue(poseWeight, w, { duration: 2 })`                                    | expression: name + `animateValue("standard/ros4hri/expression/arousal", w)`; viseme: `invoke("play_viseme")` |

### 6.2 demo-vizij-player

The demo inspects a bundle's own rig: its provider loads with
`{ graphs: ["rig", "pose-driver", "pose"], ros4hri: false }` (section 4).

| Site                                                         | 0.4                                                                                                                                    | 1.0                                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `data/samples.ts:64-108`                                     | bundle `{ namespace, glb url/blob aggressive, pose.stageNeutralFilter, metadata }`                                                     | `glb` = sample URL or uploaded `File`; `metadata` stays app state                                                                      |
| `App.tsx:250-254`                                            | `<VizijRuntimeProvider key assetBundle autostart>`                                                                                     | `<VizijRuntimeProvider key glb options>`                                                                                               |
| `App.tsx:20,36-43`                                           | `loading`, `ready`, `error`                                                                                                            | `status`, `error`                                                                                                                      |
| `App.tsx:35`                                                 | `<VizijRuntimeFace className>`                                                                                                         | same; `<VizijCanvas>` at the root                                                                                                      |
| `App.tsx:58,66-102`                                          | merged `assetBundle`: `animations`, `programs`                                                                                         | `d.animations`, `d.programs`                                                                                                           |
| `App.tsx:144`, `AssetOverviewPanel.tsx:8-25,112-118,197-198` | `loading/ready/error/controllers`                                                                                                      | `status`, `d.graphs`, `d.animations.length`                                                                                            |
| `lib/bundleSummary.ts:38-123`                                | `bundle.graphs[].kind/.id`, `bundle.metadata`, `pose.config.poses/poseGroups`, `animations`, `programs`, `faceId`, `rig.inputMetadata` | `d.graphs` (ids: gap G3), `d.metadata`, `d.poses`, `d.poseGroups`, `d.animations`, `d.programs`, `d.faceId`, `d.rigInputs`             |
| `FaceControlsPanel.tsx:89,184,189`                           | `buildRigInputPath(faceId, rig.inputMetadata[].path)`                                                                                  | `P(input.path)` over `d.rigInputs`                                                                                                     |
| `FaceControlsPanel.tsx:40-55,150-159`                        | `inputConstraints`, `resolveFaceControls`                                                                                              | `d.rigInputs[].min/max/defaultValue`                                                                                                   |
| `FaceControlsPanel.tsx:243-262,420,454`                      | `setInput(path, { float })`                                                                                                            | `rt.setValue(P(path), { float })`                                                                                                      |
| `PosePanel.tsx:18,27-36`                                     | `assetBundle.pose.config`, `buildPoseWeightPathMap`                                                                                    | `d.poses`, `d.poseGroups`, `P("poses/<id>.weight")`                                                                                    |
| `PosePanel.tsx:138,155-171`                                  | `setInput(poseWeight, …)`                                                                                                              | `rt.setValue(P("poses/<id>.weight"), …)`                                                                                               |
| `PosePanel.tsx:147,165`                                      | `stagePoseNeutral(true)`                                                                                                               | `rt.invoke("reset")`                                                                                                                   |
| `PosePanel.tsx:208`                                          | `getPoseSemanticKey` badge                                                                                                             | `d.poses[].groupIds` → group name                                                                                                      |
| `AnimationPanel.tsx:11,26-36`                                | `getAnimationState(id)` per frame: `time, duration, playing, loop`                                                                     | `decodePlayerStates(useVizijValues([ANIMATION_PLAYERS_PATH]))`, player by name = animation id: `time`, `duration`, `state`, `loopMode` |
| `AnimationPanel.tsx:179`                                     | `playAnimation(id, { reset: true })`                                                                                                   | `seek` 0, `set_weight` 1, `play`                                                                                                       |
| `AnimationPanel.tsx:185`                                     | `pauseAnimation`                                                                                                                       | `invoke("pause")`                                                                                                                      |
| `AnimationPanel.tsx:191-193`                                 | `stopAnimation(id, { clearOutputs: true })`                                                                                            | `stop`, `set_weight` 0, `reset_keys` of `animation.tracks.map(t => P(t.channel))`                                                      |
| `AnimationPanel.tsx:201-204`                                 | `setAnimationLoop(id, bool)`                                                                                                           | `invoke("set_loop", { mode: "loop" \| "once" })`                                                                                       |
| `AnimationPanel.tsx:224-227`                                 | `seekAnimation(id, s)`                                                                                                                 | `invoke("seek", { time_ns })`                                                                                                          |
| `ProgramsPanel.tsx:11,26-31`                                 | `getProgramState` polled                                                                                                               | run status keys under `BEHAVIOR_RUNS` via `useVizijChanges`, `runStatus`                                                               |
| `ProgramsPanel.tsx:128`                                      | `playProgram(id)`                                                                                                                      | `invoke("run_behavior", { name: id, behavior: await behaviorValue(graph) })`                                                           |
| `ProgramsPanel.tsx:133`                                      | `pauseProgram(id)`                                                                                                                     | D3                                                                                                                                     |
| `ProgramsPanel.tsx:139`                                      | `stopProgram(id, { resetOutputs: true })`                                                                                              | `halt(run)`, `reset_keys` of the program's outputs (gap G2)                                                                            |
| `DiagnosticsPanel.tsx:7-13,60-65,89-93`                      | `outputPaths`, `controllers`                                                                                                           | `rt.listKeys(rt.rigPrefix)`, `d.graphs`, runs                                                                                          |
| `DiagnosticsPanel.tsx:114`                                   | `assetBundle.initialInputs` count                                                                                                      | deleted: no initial inputs in 1.0                                                                                                      |
| `DiagnosticsPanel.tsx:125-136`                               | `errors[].phase/.message`                                                                                                              | `error`, `behaviorError`                                                                                                               |

### 6.3 vizij-showcase

Six providers and five canvases today (`ShowcaseRuntime.tsx:49-53`; sections
Hero, Controls, Expressions ×2, Gaze, Voice), all on
`vizij-authoring/public/assets/Quori_Current_Extended.glb`. In 1.0: five
providers, five slots on one `<VizijCanvas>`. The Expressions panel's own
canvas-less provider is deleted: the panel writes to the face's provider, so
the window-event relay (`lib/poseRigBroadcast.ts`, `PoseRigMirrorBridge.tsx`)
goes with it.

| Site                                       | 0.4                                                                                                                          | 1.0                                                                                 |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `lib/faceAssets.ts:12-44`                  | bundle `{ namespace, glb url aggressive, pose.stageNeutralFilter }`                                                          | `glb` URL                                                                           |
| `components/ShowcaseRuntime.tsx:49-53`     | `<VizijRuntimeProvider assetBundle autostart driveRuntime>`                                                                  | `<VizijRuntimeProvider glb run={visible}>`                                          |
| `ShowcaseRuntime.tsx:75-84`                | hidden stepper `step(1/hz, { forceRuntime })`                                                                                | deleted (D8)                                                                        |
| `ShowcaseRuntime.tsx:100-112`              | `stepHz` debug beacon                                                                                                        | deleted                                                                             |
| `components/RuntimeFaceFrame.tsx:32-38`    | `stagePoseNeutral()` on ready                                                                                                | deleted: `stageNeutral` at load                                                     |
| `RuntimeFaceFrame.tsx:58`                  | `<VizijRuntimeFace className showSafeArea={false}>`                                                                          | `<VizijRuntimeFace className bounds={FACE_ROOT_BOUNDS}>`                            |
| `RuntimeFaceFrame.tsx:96-138`              | `useVizijStore(world[rootId].rootBounds)`, `useVizijStoreSetter` → writes `FACE_ROOT_BOUNDS`                                 | the `bounds` prop → `setView`                                                       |
| `RuntimeFaceFrame.tsx:75-94`               | `ready`, `loading`, `error`                                                                                                  | `status`, `error`                                                                   |
| `RigControlPanel.tsx:15-17,347-431`        | `assetBundle.rig.spec` input nodes for sliders                                                                               | `d.rigInputs` (provider loads the rig without adaptation and mapping, section 4)    |
| `RigControlPanel.tsx:55-61,391-402`        | `namespaceTypedPath`, `rig/<face>/` stripping, `inputConstraints`                                                            | `P(input.path)`, `input.min/max/defaultValue`                                       |
| `RigControlPanel.tsx:24-26`                | `setInput` + `step(1/30, { forceRuntime })`                                                                                  | `rt.setValue` (the device runs)                                                     |
| `PoseButtonPanel.tsx:26-45,89-124`         | `usePoseHotkeys`, `EXPRESSIVE_EMOTION_POSE_KEYS`, weight 0.75 pulses, `broadcastPoseTrigger`                                 | expression name + arousal tween on the face's own provider                          |
| `hooks/usePoseHotkeys.ts:72-111`           | `buildPoseWeightPathMap`, `buildPoseWeightRelativePath`, `rig/${face}${rel}` (`:90`), `resolvePoseSemantics`, `animateValue` | expression keys, `useAnimateValue`                                                  |
| `PoseRigMirrorBridge.tsx:21-86`            | listens for pose triggers, re-applies them                                                                                   | deleted                                                                             |
| `GazeInteractiveFace.tsx:11-18,51-79`      | `usePoseHotkeys`, random pose on click                                                                                       | random expression name + arousal                                                    |
| `hooks/useMouseGaze.ts:22-33,75-77`        | `resolveFaceControls`, `setInput(eye, mapNormalized…)`                                                                       | `look_at` run, target via `update` keys                                             |
| `hooks/useIdleGazeBehavior.ts:21-28,65-87` | `animateValue` on eyes, lids, blink on timers                                                                                | `look_at` policy `idle`; the mapping's idle blink                                   |
| `HeroPassiveBehavior.tsx:16-32,50-234`     | scripted emotion and viseme pose weights, warm-up flash                                                                      | expression name + arousal; `play_viseme`; the warm-up flash deleted                 |
| `VoicePanel.tsx:49-105,131-141,191-203`    | Polly marks from the app's API (`services/pollyApi.ts`), JS viseme timeline over `animateValue` on viseme pose weights       | `invoke("say", { text, voice })`; `standard/vizij/speech` for the overlay text (D5) |

### 6.4 tutorial-agent-face

| Site                                                                                | 0.4                                                                                              | 1.0                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FaceApp.tsx:35-45`                                                                 | bundle `{ namespace, glb url aggressive, pose.stageNeutralFilter }`                              | `glb` URL                                                                                                                                                                |
| `FaceApp.tsx:553`                                                                   | `<VizijRuntimeProvider assetBundle autostart>`                                                   | `<VizijRuntimeProvider glb>` (the default `program: "auto"` runs `activeMotionGraphId`)                                                                                  |
| `FaceApp.tsx:77-106`                                                                | `faceId`, `assetBundle.pose.config`, `bundle.metadata.speechConfig`, `programs`, `bundle.graphs` | `rt.rigPrefix`, `d.metadata`                                                                                                                                             |
| `FaceApp.tsx:139-143`                                                               | `stagePoseNeutral()`                                                                             | deleted: `stageNeutral` at load                                                                                                                                          |
| `FaceApp.tsx:149-179`                                                               | `playProgram(activeMotionGraphId)`                                                               | deleted: the program runs from load                                                                                                                                      |
| `FaceApp.tsx:273-279`, `hooks/useVolumeChin.ts:45-53,65-77`                         | `setInput("rig/<face>/outerface001/chin/value", volume)` per frame                               | `rt.setValue("standard/ros4hri/au/26", volume)` (D6)                                                                                                                     |
| `FaceApp.tsx:298-320`                                                               | `loading`, `error`, `ready`                                                                      | `status`, `error`                                                                                                                                                        |
| `FaceApp.tsx:325`                                                                   | `<VizijRuntimeFace className showSafeArea={false}>`                                              | `<VizijRuntimeFace className>`, `<VizijCanvas>` at the root                                                                                                              |
| `hooks/useAgentFaceTools.ts:162-174`                                                | `animateValue`, `faceId`, `assetBundle`, `inputConstraints`, `resolveFaceControls`               | `rt`, `useAnimateValue`                                                                                                                                                  |
| `useAgentFaceTools.ts:263-332` tool `set_gaze(x, y, hold, duration, blink, offset)` | tweens the four eye inputs, eyelids and blink                                                    | a `look_at` `glance` (or a held `""` run halted after `holdSeconds`) at a point from `x`, `y`, `offset` as distance; `blink` → `animateValue(P("standard/vizij/blink"))` |
| `useAgentFaceTools.ts:377-454` tool `express_emotion(emotion, percent, length)`     | tweens `rig/<face>/poses/<poseId>.weight`                                                        | expression name + arousal tween (`concerned`, `sleepy`: their vizij keys); the enum becomes the profile's expression names                                               |
| `useAgentFaceTools.ts:493-502`                                                      | standing neutral weight 0.7                                                                      | deleted: rest is neutral                                                                                                                                                 |
| `hooks/useIdleGazeBehavior.ts:21-30,106-152`                                        | timer-driven eye and blink tweens                                                                | `look_at` policy `idle`; the mapping's idle blink                                                                                                                        |
| `hooks/useMouseGaze.ts:21-60`                                                       | `setInput(eye, mapNormalized…)`                                                                  | `look_at` run, target via `update` keys                                                                                                                                  |
| `hooks/usePoseHotkeys.ts:70-188`                                                    | pose bindings, hotkeys at 0.7                                                                    | expression keys, `useAnimateValue`                                                                                                                                       |
| `hooks/usePoseWarmup.ts:11-32`                                                      | primes every pose weight once                                                                    | deleted: it primed the three.js materials; the e2e asserts the first expression draws                                                                                    |
| `hooks/useSpeechAnticipation.ts:4-11,14-56`                                         | `rig/<face>/standard/left_eye/pos/*`, `rig/<face>/blink` by hand                                 | `look_at` `glance` down-left; `animateValue(P("standard/vizij/blink"))`                                                                                                  |
| `hooks/useSpeechGraphTopics.ts:18-67`, `utils/speechRuntime.ts:3-7,116-187`         | `buildRigInputPath(face, "/speech/<state>")`, `hasGraphSpeechControl`                            | `rt.setValue(P("standard/vizij/conversation/<state>"))`; the check is deleted (the adaptation maps them)                                                                 |
| `hooks/useVisemeMouth.ts:36-62,144-157,70-73`                                       | `buildSemanticPoseWeightPathMap`, JS crossfade over viseme pose weights                          | `invoke("play_viseme", { shape, weight })` per aligned viseme, segments mapped onto the standard's 15 shapes                                                             |
| `components/EmotionButtons.tsx:26-55`                                               | `animateValue(weightPath, 0.7)`                                                                  | expression name + arousal                                                                                                                                                |

Gemini Live stays the agent and the voice (`hooks/useGeminiLive.ts`); the
app's phoneme alignment stays the producer of visemes, and the device's viseme
players own their envelope and smoothing.

### 6.5 vizij-authoring (VIZ-148)

| Symbol, sites                                                                                                                                                                               | 1.0                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VizijRuntimeProvider` main face, `components/app/Viewer.tsx:779-784`, bundle from `utils/runtimeBundle.ts:38-47` (`glb.kind: "world"`)                                                     | `glb` = the bytes the headless exporter makes from the world; a structural edit is a new `glb` (reload)                                                   |
| `VizijRuntimeProvider` reference face, `ReferenceFaceRuntime.tsx:303-307`; empty-state demo, `emptyStateDemo/EmptyStateDemo.tsx:11-25`                                                      | `glb` = the file / URL                                                                                                                                    |
| `VizijRuntimeFace`, `Viewer.tsx:833-841`: `showSafeArea`, `showSelectionGlow`, `toneMapping`, `onPointerMissed`                                                                             | `showSafeArea`, `selection`, `toneMapping`, `onPick`                                                                                                      |
| `VizijRuntimeFace`, `RuntimeFaceFrame.tsx:68`                                                                                                                                               | same, `className`                                                                                                                                         |
| `onRegisterControllers`, `Viewer.tsx:749-756`                                                                                                                                               | `d.graphs`                                                                                                                                                |
| `transformOutputWrite`, `Viewer.tsx:678-703`, `runtimeOutputLocks.ts:75-213`                                                                                                                | `rt.hold(["<animatableId>", "<id>:x", …])` / `rt.release`                                                                                                 |
| `setGraphBundle({ rig, pose }, { tier: "graphs" })`, `Viewer.tsx:446-484`                                                                                                                   | reload from exported bytes                                                                                                                                |
| `setGraphBundle({ programs })`, `playProgram`, `stopProgram`, `getProgramState`, `motiongraph/hooks/useMotionGraphDriver.ts:37-269`                                                         | `run_behavior`, `runEdits` + `applyGraphEdits` for live edits, `halt`, run status keys                                                                    |
| `setInput` on program stop, `Viewer.tsx:543-569`                                                                                                                                            | `reset_keys` of the program's outputs (G2)                                                                                                                |
| animation transport, `hooks/useAnimationTransport.ts:133-529,589-763` (`setGraphBundle({ animations })`, play/pause/seek/stop/loop/state, `setAnimationActive`, `setInput` clearing at 401) | `load_animation` / `reload_animation` with `rt.moduleAnimation`, the module's transport, `decodePlayerStates`; `useOptionalVizijRuntime` stays for `:589` |
| `setInput`, `animateValue` published through graphRuntimeStore, `Viewer.tsx:192-205`                                                                                                        | `rt.setValue`, `useAnimateValue`                                                                                                                          |
| `inputConstraints`, `namespace` → input catalogue, `Viewer.tsx:412-418`, `runtimeInputsFromConstraints.ts:23-99`, `ReferenceFaceRuntime.tsx:75-176,354-541`                                 | `d.rigInputs`, `P()`; the namespace strippers are deleted                                                                                                 |
| `motiongraph/utils/buildGraphSpec.ts:168,179` `${namespace}/` paths                                                                                                                         | the face's own paths                                                                                                                                      |
| `subscribeToStep`, `getValueSnapshot`, `MotionGraphValueSampler.tsx:24-55`                                                                                                                  | `useVizijChanges`, `rt.readValues`                                                                                                                        |
| `InputValueBridge.tsx:33-80` `setInput` bool/float                                                                                                                                          | `rt.setValue`                                                                                                                                             |
| `stepHz`, `RuntimeFaceControlsOverlay.tsx:46`                                                                                                                                               | deleted                                                                                                                                                   |
| `stagePoseNeutral`, `RuntimeFaceFrame.tsx:28-32`                                                                                                                                            | deleted: `stageNeutral` at load                                                                                                                           |
| demo gaze, voice, emotions (`emptyStateDemo/useDemoMouseGaze.ts`, `useDemoIdleGaze.ts`, `DemoVoicePanel.tsx`, `DemoEmotionRow.tsx`)                                                         | as the showcase (6.3)                                                                                                                                     |
| `composeGraphSpecs`, `collectInputPathMap`, `useVizijExport.ts:1131,1151`; `resolveAnimationBridgeOutputPaths`, `animationBake/bakeAuthoredClips.ts:188`                                    | `composeVizij(gltf)` for the bake's spec on `startRuntime`, `rigPrefix + channel` as `moduleAnimation` keys them; the bake round-trip tests check it      |
| render store inside the provider: `elementSelection` both ways, `Viewer.tsx:101-189`                                                                                                        | `onPick` → the app's selection; the app's selection → `selection`                                                                                         |
| `world[rootId].rootBounds` push, `measureFaceGeometryBounds` with `deriveRootBounds` over mounted refs, `Viewer.tsx:255-321`                                                                | `bounds` → `setView`; Fit to Geometry runs `deriveRootBounds` over the exporter's scene                                                                   |
| `getExportableBodies` snapshot of mounted groups, `Viewer.tsx:334-400`, `ExportDialog.tsx:137-167`, `useVizijExport.ts:751-842`                                                             | deleted: export is headless from the world (VIZ-140), section 3.5                                                                                         |
| render store as the document model (`main.tsx:21-26`, `useRigController.ts`, `scene/*`, `useVizijAssetLoader.ts`, `FaceBoundsSection.tsx`, …)                                               | stays                                                                                                                                                     |
| `@vizij/runtime` direct (`profile`, `profiles`, `standardProfile*`, `skills`, `skillSource`, `startRuntime`, `composeVizij`)                                                                | stays; `^4.1.0`; `standardProfile*` → `mapping*`                                                                                                          |
| `three` in `scene/sceneEditing.ts`, `animationBake/*`                                                                                                                                       | stays (maths and clip building, not rendering)                                                                                                            |

Noted for VIZ-148: `useVizijExport.ts:627,736` and `utils/rigRoundtripAudit.ts:118`
look values up under `getLookup(faceId, id)`, while scene editing writes them
under `getLookup(DEFAULT_NAMESPACE, id)`; the headless export reads one of
them.

## 7. Gaps: upstream items

Each is a capability an app depends on that `@vizij/runtime` 4.1 does not
provide. Each lands upstream and is published before the app that needs it
moves; no app works around one.

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Needed by                                                                                             | Where the fix belongs                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | **A slot partly or wholly outside the canvas.** `placeVizij` clamps a negative offset to 0 (`crates/vizij/src/web.rs:304`), so a slot scrolled past the canvas's top or left edge is moved, not cropped; past the right or bottom edge Bevy's `Viewport::clamp_to_size` cuts the viewport and the projection re-fits the face into what is left (bevy_render 0.19.1 `camera.rs:418-423`). A face also cannot be hidden: a zero rectangle becomes 1×1 (`view/mod.rs:777-780`), and an unplaced face fills the canvas. | vizij-showcase (five slots on a scrolling page); any slot that scrolls or mounts after its face loads | vizij-rs view: a placement is any rectangle; the camera draws the slot's whole framing cropped to the canvas (a sub-camera view of the full projection), and an empty rectangle or one outside the canvas draws nothing. `@vizij/runtime` minor. |
| G2  | **A program's output keys.** Returning a halted program's outputs to rest is the client's `reset_keys` of "the keys its graph's output nodes write" (README, Programs), and nothing lists them: a page would re-derive the device's path resolution from the graph spec.                                                                                                                                                                                                                                             | demo-vizij-player `ProgramsPanel.tsx:139`; authoring `Viewer.tsx:543-569`                             | vizij-rs `describe()`: `Program.outputs`, the store keys its output nodes write, resolved as the device resolves them. `@vizij/runtime` minor.                                                                                                   |
| G3  | **Graph ids in `describe()`.** `graphs` carries `{ kind }` only (`src/index.ts`, `VizijDescription.graphs`).                                                                                                                                                                                                                                                                                                                                                                                                         | demo-vizij-player `lib/bundleSummary.ts:65-68`                                                        | vizij-rs `describe()`: `{ id, kind }`. Same minor as G2.                                                                                                                                                                                         |

Not gaps, checked: placing a face before it loads works (`view/mod.rs:730-731`
stores the placement by id); `setView` before load is documented; the
animation transport the apps use exists (`play`, `pause`, `stop`, `seek`,
`set_loop`, `set_speed`, `set_weight`); a headless face composition for the
bake is `composeVizij` + `startRuntime`; the pixel sample runs headless in CI
(vizij-web#128's `e2e/tests/vizij-standalone-face.spec.ts` is green in the `e2e`
job).

## 8. vizij-web#128 and VIZ-171

### 8.1 What #128 needs for `@vizij/runtime` 4.1

[vizij-web#128](https://github.com/vizij-ai/vizij-web/pull/128) moves
`apps/vizij-standalone` onto `@vizij/runtime` 3.0.0 (dist-tag `next` when it
was written). For 4.1.0:

- `apps/vizij-standalone/package.json`: `"@vizij/runtime": "^4.1.0"`, and the
  lockfile.
- `src/face.ts:74`: `runtime.spawnSkill("say", { text, voice })` →
  `runtime.invoke("say", { text, voice })`, which resolves to a `RunHandle`.
- `TaskHandle` → `RunHandle` (`face.ts:17,30-34`,
  `agent/conversation.ts:7,24`); `halt(run)` → `halt(run.run)` (`face.ts:75`,
  `conversation.ts:115`). `ended` keeps reading `run.status`.
- `face.ts:80`: since 4.1.0 the ROS4HRI mapping shows a named expression at
  `standard/ros4hri/expression/arousal` as its intensity, and an arousal of 0
  shows nothing (4.1.0 changelog, d838ba2). `express` writes the arousal with
  the name; without it, the spec's "an expression changes the face" fails.
- The conversation state has standard keys since 4.0.0
  (`standard/vizij/conversation/{speaking,user_speaking,thinking}`, b0994fd):
  the page writes them, and the PR's "page state, not keys" note goes.
- `loadVizij` loads the face's animations by default since 4.0.0, and runs
  the bundle's active program as a run (`program: "auto"`); the page passes
  `program: "none"` or `animations: false` where it should not.
- Its `public/faces/Quori_Current_Extended.glb` duplicates the face VIZ-171
  re-exports; the page loads the shared file.
- Its README edits to `@vizij/runtime-react` and `@vizij/speech-react` are
  superseded by this design's deletions.

### 8.2 What VIZ-171 changes for the apps

Branch `feat/viz-171-face-adaptations` (commit 17122620) re-exports every
bundled face with a `standard-adaptation` graph and the `vizij-face` profile
declared:

- Apps address `rig/<faceId>/standard/vizij/…` (`P(...)`) and ROS4HRI keys
  instead of rig paths. Quori's `faceId` is `quori_latest`; its rig reads the
  profile's eye keys and `standard/vizij/mouth/morph/jaw_open` itself, and the
  adaptation maps expressions, visemes, blink and the conversation state onto
  its poses and inputs.
- `pose.stageNeutralFilter` goes from every app (tutorial-fullscreen-face
  `FaceApp.tsx:25`, tutorial-agent-face `FaceApp.tsx:43`,
  `data/samples.ts:74`, `lib/faceAssets.ts:24`,
  authoring's `ReferenceFaceRuntime.tsx:228-239` and `EmptyStateDemo.tsx:11-21`):
  authored defaults keep the colours under `stageNeutral`.
- `apps/tutorial-fullscreen-face/public/assets/hugo_rigged.glb`, which no code
  loads, is removed; the apps keep loading
  `vizij-authoring/public/assets/Quori_Current_Extended.glb`.
- The adaptation writes the face's pose weights every step, which is why the
  rig-inspecting pages load without it (section 4).

## 9. Landing

### 9.1 Before the integration branch

On `main`, in this order: VIZ-140 (exporter, with the ellipse and rectangle
fixtures of 3.5), VIZ-171 (faces), vizij-web#128 moved to 4.1 (8.1). Then
`integration/bevy-view` is rebased onto `main`. G1–G3 are released in
`@vizij/runtime` before the showcase, demo-vizij-player and authoring PRs that
need them.

### 9.2 The integration branch

`integration/bevy-view` is cut from `origin/main` (`8f9ea296`). One pull request
per package or app goes into it, in this order:

1. **`@vizij/render` 1.0**: `<VizijCanvas>`, `<Vizij>` slot, the deletions of
   3.3; peer `@vizij/runtime ^4.1.0`; changeset `major`.
2. **`@vizij/runtime-react` 1.0**: section 5; changeset `major`; this
   document moves into its README.
3. **`@vizij/speech-react` deleted**: the package directory, its
   `.changeset/config.json` `ignore` entry (added by #128), the README and
   AGENTS tables.
4. **tutorial-fullscreen-face** (6.1).
5. **demo-vizij-player** (6.2; after G2, G3).
6. **tutorial-agent-face** (6.4), with the vizij-docs pull request of 9.4.
7. **vizij-showcase** (6.3; after G1).
8. **vizij-authoring**: VIZ-148's sequence (gate, exporter in `ExportDialog`,
   viewport, programs and timeline, reloads, StrictMode memory, load time).

Between PR 1 and the last app PR the workspace typecheck of the branch is red
(D4); each PR is green on its own scope. The branch is rebase-merged onto
`main` once every PR is in and the whole workspace is green. Done when the
lockfile holds no `@vizij/runtime-react@0.4` and no `@vizij/runtime@2`.

### 9.3 e2e evidence per app

Each spec waits for `[data-vizij-ready="true"]` on the app's slot, then samples
the slot's pixels from a screenshot (more than eight distinct colours: the
canvas is not uniform), then changes something and asserts the sample's digest
changed. The sampler moves from #128's spec to a shared `e2e/pixels.ts`.

| App                                                 | Spec                                                                                         | Port | Change asserted                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| tutorial-fullscreen-face (filter `fullscreen-face`) | new `e2e/tests/fullscreen-face.spec.ts`                                                      | 5204 | expression hotkey                                                                                                    |
| demo-vizij-player                                   | `demo-vizij-player-load-sample.spec.ts` extended                                             | 5200 | load sample, then a rig slider; an animation plays (player state `playing`)                                          |
| tutorial-agent-face                                 | new `e2e/tests/tutorial-agent-face.spec.ts` (no Gemini key: the face and the debug controls) | 5206 | emotion button                                                                                                       |
| vizij-showcase                                      | new `e2e/tests/vizij-showcase.spec.ts`                                                       | 5205 | one `<canvas>` on the page; each of the five slots ready and sampled after scrolling to it; `memoryBytes()` recorded |
| vizij-authoring                                     | VIZ-148's gates                                                                              | 4175 | picking, export round trip, StrictMode memory                                                                        |

Port 5203 is #128's.

### 9.4 Guidebook (vizij-docs)

A vizij-docs pull request rewrites, against the new code:

- `current_documentation/guidebook/integrate/api-backed-interactive-application.md`
  (the source of `/tutorials/agent-face`): the provider block (L147-155), the
  tools block (L163-178, which already differs from `FaceApp.tsx:123-127,243-251`),
  "runtime helpers such as `setInput(...)` and `animateValue(...)`" (L185), the
  anchors (L240-245), the screenshot (L114).
- `integrate/behind-the-face.md` (`/tutorials/behind-the-face`): the rig-path
  paragraphs (L106, L111, mermaid L53) become standard keys and the face's
  composition; the orchestration section (L283-322: staged writes, merged
  writes) becomes the device composing the face's graphs and runs.
- `experience/richer-interactive-example.md`: the runtime model rows (L51,
  L82, L101, L109).
- `public_projection_manifest.json`: entries `tutorials-agent-face` and
  `tutorials-behind-the-face` keep `publish: true`, their slugs, `sourcePath`s
  and hub stages; their `implementationAnchors` point at
  `apps/tutorial-agent-face`, `packages/@vizij/runtime-react` and
  `packages/@vizij/render`.

It merges when the integration branch merges (the anchors are `tree/main`
links); the website's guidebook sync (`vizij-ai.github.io`,
`npm run content:sync:guidebook`) then regenerates the two routes.

### 9.5 npm

- `@vizij/render` 1.0.0 and `@vizij/runtime-react` 1.0.0: from their
  changesets, published by `publish-npm.yml` when the Version Packages PR
  merges.
- `@vizij/speech-react`: `npm deprecate @vizij/speech-react "<message>"` (a
  manual step for Victor); no further version.
- `@vizij/runtime`: already `latest` at 4.1.0; G1–G3 add a minor.

## 10. Decisions

| #   | Question                                                      | Options                                                                                                                                                                                                        | Proposal                                                                                                  |
| --- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| D1  | How apps command a face                                       | (a) ROS4HRI keys + skills, profile keys only where no composed graph writes (section 4); (b) `ros4hri: false`, every app writes `standard/vizij/*` and keeps its JS gaze, blink and viseme behaviors as tweens | (a): the device's own surface, as a ROS client or Studio drives it, and four JS behaviors per app deleted |
| D2  | The shared canvas's place                                     | (a) fixed over the page, pointer events off, the page's UI above it by z-index; (b) behind the page, with every ancestor of a slot transparent                                                                 | (a) by default; the authoring viewport positions its canvas itself with pointer events on                 |
| D3  | Pausing a program (demo-vizij-player `ProgramsPanel.tsx:133`) | (a) delete: a run runs or is halted; (b) an upstream suspended run state in the interpreter                                                                                                                    | (a)                                                                                                       |
| D4  | The integration branch between PRs                            | (a) each PR green on its own scope, the branch's workspace typecheck red until the last app PR; (b) one PR with both packages and every app                                                                    | (a): per-package and per-app review                                                                       |
| D5  | The showcase's Voice section                                  | (a) the device's `say` (its TTS and viseme stream); the scrub-through-visemes slider deleted; (b) keep the app's Polly timeline driving `play_viseme`                                                          | (a)                                                                                                       |
| D6  | tutorial-agent-face's volume-driven mouth                     | (a) `standard/ros4hri/au/26` → the jaw (Quori's rig reads `mouth/morph/jaw_open`); (b) the adaptation also maps jaw-open onto `outerface001/chin` (VIZ-171), as 0.4 moved the chin                             | (a), compared against 0.4 in the app PR; (b) if the chin is what reads as speech                          |
| D7  | vizij-web#128                                                 | (a) moved to 4.1 and landed on `main` first; (b) folded into the integration branch                                                                                                                            | (a): it has no `runtime-react` dependency                                                                 |
| D8  | The showcase's hidden-section stepping at 1 Hz                | (a) delete: an offscreen face stops (`run={visible}`); (b) keep stepping it                                                                                                                                    | (a)                                                                                                       |
