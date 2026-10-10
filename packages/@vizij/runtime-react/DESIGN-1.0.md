# `@vizij/runtime-react` 1.0 and `@vizij/render` 1.0: design

**Status: decided** (decisions in section 10). `@vizij/render` 1.0 and
`@vizij/runtime-react` 1.0 implement sections 3 and 5. Tickets:
[VIZ-147](https://linear.app/semio-ai/issue/VIZ-147) (the packages and every app
except authoring) and [VIZ-148](https://linear.app/semio-ai/issue/VIZ-148) (the
authoring app). Umbrella: [VIZ-158](https://linear.app/semio-ai/issue/VIZ-158).
The apps' line references are to vizij-web `8f9ea296`; the runtime's are to
`@vizij/runtime` 5.0.0 (npm `latest`) and vizij-rs `origin/main` at `a7f7570`.

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

The same rule decides how apps drive a face (section 4): through its Arora
API — the methods it declares and its data store — rather than through JS
behaviors that duplicate what the device already does.

## 2. Packages

| Package                     | Version  | Role                                                                                                                |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `@vizij/runtime` (vizij-rs) | `^5.0.0` | The view and the device: everything an app calls on a face. npm `latest`.                                           |
| `@vizij/render`             | 1.0      | The page's canvas and the face slot (`<VizijCanvas>`, `<Vizij>`); the GLB loader, the exporter and the world types. |
| `@vizij/runtime-react`      | 1.0      | One face's lifecycle in React and the fan-out of its store changes.                                                 |
| `@vizij/speech-react`       | deleted  | No app uses it: `apps/vizij-standalone`, its only code consumer, dropped it.                                        |

`@vizij/runtime` is a **peer dependency** of both `@vizij/render` and
`@vizij/runtime-react`, so a page resolves one copy of it and therefore one
wasm module: two copies would each `init()` a module of their own. For the
same reason `@vizij/render` is a peer dependency of `@vizij/runtime-react`:
the page's canvas is module state of `@vizij/render`, and the provider awaits
the copy the page renders `<VizijCanvas>` from. `runtime-react` has no other
dependency (`ValueJSON` and `ValueInput` come from `@vizij/runtime`).

## 3. `@vizij/render` 1.0

### 3.1 The page's canvas: `<VizijCanvas>`

```tsx
<VizijCanvas options?: MountOptions className? style? />
```

Renders the page's one `<canvas>` inside a `<div>` it fills and, on first
mount, `mount(canvas, options)`. The canvas element and the mount are
module-level singletons: a second `<VizijCanvas>`, a remount or React
StrictMode's second effect shows the same canvas and App rather than mounting
again, and the options of the first mount stand. `canvasMounted():
Promise<HTMLCanvasElement>` is exported for the provider to await before
`loadVizij`, and for the slot's view calls, which need the module.

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
gives it pointer events — `className` and `style` replace the default
(decision D2). The loop runs while a `<VizijCanvas>` is shown.

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
which every app's e2e uses as its ready signal. Its view props reach
`setView` and `setSelection` once the canvas is mounted, compared by value. An
absent `selection` leaves the face's selection alone. On unmount the face is
placed on an empty rectangle, where it draws nothing (from `@vizij/runtime`
5.1; under 5.0 an empty rectangle is 1×1). One slot shows a face at a time.

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
the feature hooks (`src/hooks/use-features.ts`) and the helpers only they used,
the canvas render counters, `resolveToneMapping`, and the
`@react-three/fiber`, `@react-three/drei`, `react-error-boundary`, `clsx`,
`deep-equal` and `tailwindcss` dependencies. The store loses what only a mounted
renderer wrote or read: `refs`, `setReference`, `getExportableBodies`,
`onElementClick` (the three.js hit selection), `hoveredElement`,
`setHoveredElement`, `renderHit`, `slotConfig`, `setSlot`, `setSlots`,
`clearSlot`. `three` is imported at run time only by the loader
(`src/functions/load-gltf*`, `src/functions/gltf-loading/`) and the exporter
(`src/functions/build-scene-graph.ts`, `export.ts`, `vizij-bundle.ts`); the
world and store types import its types.

### 3.4 Kept

The loader (`load-gltf*`, `gltf-loading/*`, `deriveRootBounds`, morph keys)
and the headless exporter (`build-scene-graph.ts`, `export.ts`,
`vizij-bundle.ts`), both running in Node
([VIZ-140](https://linear.app/semio-ai/issue/VIZ-140)), the world and bundle
types, the tone-mapping modes (`ToneMappingMode` is `@vizij/runtime`'s
`ToneMapping`), and the zustand store with its hooks, which remains the
authoring app's document model.

### 3.5 What the exporter must keep: ellipse and rectangle RobotData

The Bevy view converts a RobotData `ellipse` or `rectangle` into a shape
itself: where the element's node carries no mesh, a unit circle or square in
the XY plane, its node scaled by `width` and `height`, filled from `fillColor`
and `fillOpacity`, stroke dropped (vizij-rs `crates/vizij/src/view/meta.rs`,
`Primitive`; `view/mod.rs`, the `(None, Some(primitive))` arm). A GLB node
carrying that RobotData is enough.

So **every headless export path** writes each ellipse and rectangle element's
RobotData with `type`, `width`, `height`, `fillColor` and `fillOpacity`,
static or animated. `buildSceneGraph` does: it exports either kind as a node
with no mesh carrying its RobotData, its translation and rotation, and the
width and height as its scale on X and Y. No shipped face carries either kind
([VIZ-149](https://linear.app/semio-ai/issue/VIZ-149)), so the headless
round-trip test (`tests/headless-round-trip.node-test.mjs`) carries one fixture
of each — an ellipse with static features, a rectangle with animated ones —
and checks the RobotData, the node transform and the reload.

## 4. How apps drive a face

A face is an Arora device. An app drives it through its Arora API — the
methods it declares (`invoke`) and its data store (`setValue`, `writeValues`)
— addressing the keys of a standard profile. The app chooses the profile; **a
Vizij app uses the Vizij face standard by default**: the `vizij-face`
profile's keys, `standard/vizij/…` under the face's rig prefix
(`runtime.path("standard/vizij/…")`). ROS4HRI is a special profile, consumed
by the ROS4HRI mapping for ROS clients; apps do not write `standard/ros4hri/*`.

The shipped faces carry their standard adaptation and declare the
`vizij-face` profile ([VIZ-171](https://linear.app/semio-ai/issue/VIZ-171),
vizij-web [#135](https://github.com/vizij-ai/vizij-web/pull/135)): the
adaptation maps the standard's keys onto each face's rig. `loadVizij` composes
the rig, pose-driver, pose and standard-adaptation graphs and, in
`@vizij/runtime` 5.0, the built-in ROS4HRI mapping by default
(`ComposeVizijOptions.ros4hri`).

**A key a composed graph or a running program writes every step cannot be
commanded beside it**: the writer overwrites the client's write at the next
step. Two writers bear on apps:

- The ROS4HRI mapping writes 65 of the standard's keys from its own — every
  expression weight ROS4HRI names, the eye positions, lids and blink, the
  muscle tier (vizij-rs `docs/ros4hri.md`). An app that writes those keys
  loads its face with `ros4hri: false`. The mapping becomes opt-in in vizij-rs
  (pending), after which leaving it out is the default and the option goes.
- A face's programs. Quori's active program
  (`authoring.motiongraph.program.1`, which `program: "auto"` runs from load)
  writes the standard's eye positions, top and bottom lids, brows and
  `mouth/morph/jaw_open`. An app that commands those keys on Quori halts that
  run, or loads with `program: "none"`, and the face's idle motion goes with
  it.

| Intent                          | 1.0                                                                                                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| an expression at an intensity   | `P("standard/vizij/expression/<name>")`, `[0, 1]`; showing one writes the previous one's weight 0 in the same `writeValues`; a fade is `useAnimateValue` |
| gaze                            | `P("standard/vizij/{left,right}_eye/pos/{x,y}")`, `[-1, 1]`                                                                                              |
| a gaze target, a glance         | `invoke("look_at", { policy, target, frame })`, policy `""` (track) or `glance`: needs the ROS4HRI mapping (gap G4)                                      |
| idle gaze                       | the face's own program where it has one; `look_at` has no idle policy (`random`, `social`, `auto` abort)                                                 |
| top lids                        | `P("standard/vizij/{left,right}_eye_top_eyelid/pos/y")`, `[0, 1]`                                                                                        |
| a blink                         | `P("standard/vizij/blink")`, `[0, 1]`: a tween up and back                                                                                               |
| idle blink                      | none without the ROS4HRI mapping (gap G5)                                                                                                                |
| a viseme from a phoneme aligner | `invoke("play_viseme", { shape, weight })`, once per viseme                                                                                              |
| speech from text                | `invoke("say", { text, voice })`: its audio, and its visemes on the standard's viseme keys                                                               |
| jaw from audio volume           | `P("standard/vizij/mouth/morph/jaw_open")` (D6)                                                                                                          |
| conversation state              | `P("standard/vizij/conversation/{speaking,user_speaking,thinking}")`                                                                                     |
| back to rest                    | `invoke("reset")`, or `invoke("reset_keys", { keys: { strs } })`                                                                                         |
| a program                       | `invoke("run_behavior", { name, behavior })`, `halt(run)`                                                                                                |
| an animation                    | the animation module's functions by name (`play`, `set_weight`, `seek`, …)                                                                               |

`P(x)` is `runtime.path(x)`: `rig/<faceId>/` + `x`. Each write is of the type
the profile declares — `{ f32: v }` for every number key of `vizij-face` — as
the device requires of a client; `useAnimateValue` writes in the numeric kind
the key holds, or rests at before anything writes it. `say` and `play_viseme`
write the standard's viseme keys themselves, so they need no mapping.

A page that inspects a face's own rig rather than the standard
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
  options?: VizijOptions; // loadVizij's options, unchanged, read at each load
  run?: boolean; // default true
  children?: ReactNode;
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
    options?: AnimateValueOptions, // duration (s, default 0.35), easing
  ): Promise<void>;
  cancelAnimation(path: string): void;
};
function VizijRuntimeFace(props: Omit<VizijProps, "vizijId">): ReactNode;
```

The types of these signatures are exported with them (`VizijSource`,
`VizijRuntimeProviderProps`, `VizijRuntimeContextValue`, `VizijRuntimeStatus`,
`VizijChanges`, `AnimateValueOptions`, `Easing`, `VizijRuntimeFaceProps`).

| Export                                       | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VizijRuntimeProvider`                       | A face's lifecycle in React: fetch the bytes, `describe`, `loadVizij` once `canvasMounted()` resolves, `whenReady`, `run()` or `stop()` as `run` says. A new `glb` reloads through `loadVizij` on the same `vizijId` (the previous scene draws until the new one is ready) and the previous `Runtime` is stopped and disposed once the new one exists; on unmount `stop`, `unloadVizij`, `dispose`. Loads and teardowns run one at a time, in order, so StrictMode's double effects load once. |
| — its change drain                           | `drainChanges()` has one cursor per `Runtime`, so the provider is its only caller: once per animation frame, from the moment a (re)loaded `Runtime` exists, whose first drain is the whole state. It fans each batch out to the subscribers below.                                                                                                                                                                                                                                             |
| `useVizijRuntime`, `useOptionalVizijRuntime` | Read the context. `runtime` is `@vizij/runtime`'s `Runtime` as is: every device operation is called on it.                                                                                                                                                                                                                                                                                                                                                                                     |
| `status`, `error`, `behaviorError`           | Load state as React state; `behaviorError` follows `runtime.behaviorErrorChanged()`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `description`                                | `describe(glb)` as React state, for the controls a page builds (poses, rig inputs, programs, animations, metadata, `rootBounds`).                                                                                                                                                                                                                                                                                                                                                              |
| `useVizijValues(paths)`                      | Re-renders a component when one of these keys changes: seeded from `runtime.readValues`, then from the provider's batches.                                                                                                                                                                                                                                                                                                                                                                     |
| `useVizijChanges(listener)`                  | The raw batches, for consumers that must not re-render per change (scrubbers, samplers, bridges).                                                                                                                                                                                                                                                                                                                                                                                              |
| `useAnimateValue()`                          | A JS tween over `runtime.readValues` / `runtime.setValue`, per animation frame, eased, in the numeric kind the key holds — or, for a key nothing has written yet, starting from the value `listKeys` lists it resting at (`__meta.default`). Cancelled on unmount, on a reload, or by a newer tween on the same path. No device call shapes a client write over time.                                                                                                                          |
| `VizijRuntimeFace`                           | `<Vizij>` bound to the provider's `vizijId`: the one mount site every app has today stays one line.                                                                                                                                                                                                                                                                                                                                                                                            |

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

| Site                             | 0.4                                                                               | 1.0                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `FaceApp.tsx:17-27`              | `VizijAssetBundle` `{ namespace, glb: url aggressive, pose.stageNeutralFilter }`  | `glb={faceAssetUrl}`                                                                                                                 |
| `FaceApp.tsx:150`                | `<VizijRuntimeProvider assetBundle autostart>`                                    | `<VizijRuntimeProvider glb options={{ program: autoplay ? "auto" : "none" }}>`                                                       |
| `FaceApp.tsx:30,43,98-114`       | `loading`, `error`, `ready`                                                       | `status`, `error`                                                                                                                    |
| `FaceApp.tsx:43,54-57`           | `stagePoseNeutral()` on ready                                                     | deleted: `stageNeutral` at load                                                                                                      |
| `FaceApp.tsx:60-85`              | `?autoplay` → find `activeMotionGraphId` → `playProgram`                          | `options.program` (`"auto"` runs the bundle's active program as a run)                                                               |
| `FaceApp.tsx:125`                | `<VizijRuntimeFace className showSafeArea={false}>`                               | `<VizijRuntimeFace className>`, `<VizijCanvas>` at the page root                                                                     |
| `hooks/useMouseGaze.ts:17-25`    | `setInput`, `faceId`, `assetBundle`, `inputConstraints`, `resolveFaceControls`    | `rt.writeValues` of the standard's eye keys from the pointer (no `program` run writes them)                                          |
| `hooks/useMouseGaze.ts:42-43`    | `setInput(eye, mapNormalizedControlValue(…))`                                     | `P("standard/vizij/{left,right}_eye/pos/{x,y}")` as `{ f32 }` in `[-1, 1]`                                                           |
| `hooks/usePoseHotkeys.ts:64-73`  | `filterPosesBySemanticKind`, `getPoseSemanticKey`, `EXPRESSIVE_EMOTION_POSE_KEYS` | the profile's `expression` and `viseme` tiers                                                                                        |
| `hooks/usePoseHotkeys.ts:98-104` | `faceId`, `animateValue`, `buildPoseWeightPathMap`                                | `useAnimateValue`                                                                                                                    |
| `hooks/usePoseHotkeys.ts:148`    | `animateValue(poseWeight, w, { duration: 2 })`                                    | expression: `animateValue(P("standard/vizij/expression/<name>"), w)`, the previous one tweened to 0; viseme: `invoke("play_viseme")` |

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
| `PoseButtonPanel.tsx:26-45,89-124`         | `usePoseHotkeys`, `EXPRESSIVE_EMOTION_POSE_KEYS`, weight 0.75 pulses, `broadcastPoseTrigger`                                 | expression weight tween on the face's own provider                                  |
| `hooks/usePoseHotkeys.ts:72-111`           | `buildPoseWeightPathMap`, `buildPoseWeightRelativePath`, `rig/${face}${rel}` (`:90`), `resolvePoseSemantics`, `animateValue` | expression keys, `useAnimateValue`                                                  |
| `PoseRigMirrorBridge.tsx:21-86`            | listens for pose triggers, re-applies them                                                                                   | deleted                                                                             |
| `GazeInteractiveFace.tsx:11-18,51-79`      | `usePoseHotkeys`, random pose on click                                                                                       | a random expression's weight                                                        |
| `hooks/useMouseGaze.ts:22-33,75-77`        | `resolveFaceControls`, `setInput(eye, mapNormalized…)`                                                                       | the standard's eye keys from the pointer                                            |
| `hooks/useIdleGazeBehavior.ts:21-28,65-87` | `animateValue` on eyes, lids, blink on timers                                                                                | the face's own program; the blink a `P("standard/vizij/blink")` tween (G5)          |
| `HeroPassiveBehavior.tsx:16-32,50-234`     | scripted emotion and viseme pose weights, warm-up flash                                                                      | expression weights; `play_viseme`; the warm-up flash deleted                        |
| `VoicePanel.tsx:49-105,131-141,191-203`    | Polly marks from the app's API (`services/pollyApi.ts`), JS viseme timeline over `animateValue` on viseme pose weights       | `invoke("say", { text, voice })`; `standard/vizij/speech` for the overlay text (D5) |

### 6.4 tutorial-agent-face

| Site                                                                                | 0.4                                                                                              | 1.0                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FaceApp.tsx:35-45`                                                                 | bundle `{ namespace, glb url aggressive, pose.stageNeutralFilter }`                              | `glb` URL                                                                                                                                                   |
| `FaceApp.tsx:553`                                                                   | `<VizijRuntimeProvider assetBundle autostart>`                                                   | `<VizijRuntimeProvider glb options={{ ros4hri: false }}>`; whether Quori's active program runs beside the app's gaze and jaw writes is D9                   |
| `FaceApp.tsx:77-106`                                                                | `faceId`, `assetBundle.pose.config`, `bundle.metadata.speechConfig`, `programs`, `bundle.graphs` | `rt.rigPrefix`, `d.metadata`                                                                                                                                |
| `FaceApp.tsx:139-143`                                                               | `stagePoseNeutral()`                                                                             | deleted: `stageNeutral` at load                                                                                                                             |
| `FaceApp.tsx:149-179`                                                               | `playProgram(activeMotionGraphId)`                                                               | deleted: `options.program` runs it from load (D9)                                                                                                           |
| `FaceApp.tsx:273-279`, `hooks/useVolumeChin.ts:45-53,65-77`                         | `setInput("rig/<face>/outerface001/chin/value", volume)` per frame                               | `rt.setValue(P("standard/vizij/mouth/morph/jaw_open"), { f32: volume })` (D6)                                                                               |
| `FaceApp.tsx:298-320`                                                               | `loading`, `error`, `ready`                                                                      | `status`, `error`                                                                                                                                           |
| `FaceApp.tsx:325`                                                                   | `<VizijRuntimeFace className showSafeArea={false}>`                                              | `<VizijRuntimeFace className>`, `<VizijCanvas>` at the root                                                                                                 |
| `hooks/useAgentFaceTools.ts:162-174`                                                | `animateValue`, `faceId`, `assetBundle`, `inputConstraints`, `resolveFaceControls`               | `rt`, `useAnimateValue`                                                                                                                                     |
| `useAgentFaceTools.ts:263-332` tool `set_gaze(x, y, hold, duration, blink, offset)` | tweens the four eye inputs, eyelids and blink                                                    | the standard's eye keys tweened to the point from `x`, `y` (`offset` as distance), held for `hold` then back; `blink` → a `P("standard/vizij/blink")` tween |
| `useAgentFaceTools.ts:377-454` tool `express_emotion(emotion, percent, length)`     | tweens `rig/<face>/poses/<poseId>.weight`                                                        | expression weight tween; the enum becomes the profile's 27 expression names                                                                                 |
| `useAgentFaceTools.ts:493-502`                                                      | standing neutral weight 0.7                                                                      | deleted: rest is neutral                                                                                                                                    |
| `hooks/useIdleGazeBehavior.ts:21-30,106-152`                                        | timer-driven eye and blink tweens                                                                | the face's own program; the blink a `P("standard/vizij/blink")` tween (G5)                                                                                  |
| `hooks/useMouseGaze.ts:21-60`                                                       | `setInput(eye, mapNormalized…)`                                                                  | the standard's eye keys from the pointer                                                                                                                    |
| `hooks/usePoseHotkeys.ts:70-188`                                                    | pose bindings, hotkeys at 0.7                                                                    | expression keys, `useAnimateValue`                                                                                                                          |
| `hooks/usePoseWarmup.ts:11-32`                                                      | primes every pose weight once                                                                    | deleted: it primed the three.js materials; the e2e asserts the first expression draws                                                                       |
| `hooks/useSpeechAnticipation.ts:4-11,14-56`                                         | `rig/<face>/standard/left_eye/pos/*`, `rig/<face>/blink` by hand                                 | the standard's eye keys tweened down-left; a `P("standard/vizij/blink")` tween                                                                              |
| `hooks/useSpeechGraphTopics.ts:18-67`, `utils/speechRuntime.ts:3-7,116-187`         | `buildRigInputPath(face, "/speech/<state>")`, `hasGraphSpeechControl`                            | `rt.setValue(P("standard/vizij/conversation/<state>"))`; the check is deleted (the adaptation maps them)                                                    |
| `hooks/useVisemeMouth.ts:36-62,144-157,70-73`                                       | `buildSemanticPoseWeightPathMap`, JS crossfade over viseme pose weights                          | `invoke("play_viseme", { shape, weight })` per aligned viseme, segments mapped onto the standard's 15 shapes                                                |
| `components/EmotionButtons.tsx:26-55`                                               | `animateValue(weightPath, 0.7)`                                                                  | expression weight tween                                                                                                                                     |

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
| `@vizij/runtime` direct (`profile`, `profiles`, `standardProfile*`, `skills`, `skillSource`, `startRuntime`, `composeVizij`)                                                                | stays; `^5.0.0`; `standardProfile*` → `mapping*`                                                                                                          |
| `three` in `scene/sceneEditing.ts`, `animationBake/*`                                                                                                                                       | stays (maths and clip building, not rendering)                                                                                                            |

Noted for VIZ-148: `useVizijExport.ts:627,736` and `utils/rigRoundtripAudit.ts:118`
look values up under `getLookup(faceId, id)`, while scene editing writes them
under `getLookup(DEFAULT_NAMESPACE, id)`; the headless export reads one of
them.

## 7. Gaps: upstream items

Each is a capability an app depends on that `@vizij/runtime` 5.0.0 does not
provide. Each lands upstream and is published before the app that needs it
moves; no app works around one.

| #   | Gap                                                                                                                                                                                                                                                                                               | Needed by                                                                                 | Where the fix belongs, and its state                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **A slot partly or wholly outside the canvas.** Under 5.0 `placeVizij` moves a slot scrolled past the top or left edge, refits one past the bottom or right edge, and draws an empty rectangle as 1×1.                                                                                            | vizij-showcase (five slots on a scrolling page); any slot that scrolls; a slot unmounting | vizij-rs view: fixed in vizij-rs [#172](https://github.com/vizij-ai/vizij-rs/pull/172) (0db97cd): any rectangle, cropped to the canvas; an empty one draws nothing. Ships in `@vizij/runtime` 5.1.0, not yet published. |
| G2  | **A program's output keys.** Returning a halted program's outputs to rest is the client's `reset_keys` of the keys its graph's output nodes write, and nothing lists them.                                                                                                                        | demo-vizij-player `ProgramsPanel.tsx:139`; authoring `Viewer.tsx:543-569`                 | `outputKeys(graph)`, vizij-rs #172. Ships in 5.1.0, not yet published.                                                                                                                                                  |
| G3  | **Graph ids in `describe()`.** `graphs` carries `{ kind }` only.                                                                                                                                                                                                                                  | demo-vizij-player `lib/bundleSummary.ts:65-68`                                            | `describe().graphs` as `[{ id, kind }]`, vizij-rs #172. Ships in 5.1.0, not yet published.                                                                                                                              |
| G4  | **`look_at` drives the vizij standard.** The skill's fragment writes `standard/ros4hri/gaze/{target,frame}` only (vizij-rs `crates/interop/vizij-arora-host/skills/look_at.json`): without the ROS4HRI mapping it moves nothing, and with it composed the mapping writes every expression weight. | any app that wants a gaze target or a glance rather than writing the eye keys             | vizij-rs: the skill writes the vizij standard's gaze (the eye keys, or a gaze target key the `vizij-face` profile declares), with the ROS4HRI mapping relaying `standard/ros4hri/gaze/*` onto it. Open.                 |
| G5  | **Idle blink without the ROS4HRI mapping.** The mapping's blink generator is the device's only one.                                                                                                                                                                                               | every app that showed an idle blink in 0.4 (showcase, tutorial-agent-face)                | vizij-rs: an idle blink of the vizij standard (a skill run, or a generator in the adaptation's composition) that does not need the ROS4HRI mapping. Open.                                                               |

Not gaps, checked: placing a face before it loads works (the placement is
stored by id); `setView` before load is documented; the animation transport
the apps use exists (`play`, `pause`, `stop`, `seek`, `set_loop`,
`set_speed`, `set_weight`); a headless face composition for the bake is
`composeVizij` + `startRuntime`; `say` and `play_viseme` write the standard's
viseme keys themselves; the pixel sample runs headless in CI
(`e2e/tests/vizij-standalone-face.spec.ts` is green in the `e2e` job).

Seen while building 1.0, to check upstream: `listKeys` lists a `vizij-face`
key that nothing has written with `__meta.ty` `"f64"` and range `[0, 1]` while
its `default` is `{ f32: 0 }` and the profile declares `f32` (and `[-1, 1]` for
the eye positions).

## 8. The standalone and the shipped faces

- `apps/vizij-standalone` is on `@vizij/runtime` 5 directly
  ([#141](https://github.com/vizij-ai/vizij-web/pull/141)), with no
  `runtime-react` dependency. It writes expressions as the vizij standard's
  weights and loads its face with `ros4hri: false`
  ([#142](https://github.com/vizij-ai/vizij-web/pull/142)).
- The shipped faces carry their standard adaptation and the `vizij-face`
  profile ([#135](https://github.com/vizij-ai/vizij-web/pull/135)). Quori's
  `faceId` is `quori_latest`; its rig reads the standard's eye keys and
  `standard/vizij/mouth/morph/jaw_open` itself, and the adaptation maps
  expressions, visemes, blink and the conversation state onto its poses and
  inputs. Hugo's adaptation maps no jaw key.
- `pose.stageNeutralFilter` goes from every app (tutorial-fullscreen-face
  `FaceApp.tsx:25`, tutorial-agent-face `FaceApp.tsx:43`,
  `data/samples.ts:74`, `lib/faceAssets.ts:24`, authoring's
  `ReferenceFaceRuntime.tsx:228-239` and `EmptyStateDemo.tsx:11-21`): authored
  defaults keep the colours under `stageNeutral`.
- The adaptation writes the face's pose weights every step, which is why the
  rig-inspecting pages load without it (section 4).

## 9. Landing

### 9.1 The integration branch

`integration/bevy-view` holds vizij-web `main` as of `1fb1eadf` (the headless
exporter, the faces' adaptations and the standalone on runtime 5 are in). One
pull request per package or app goes into it, in this order:

1. **`@vizij/render` 1.0** (section 3): changeset `major`.
2. **`@vizij/runtime-react` 1.0** (section 5), with this document: changeset
   `major`.
3. **`@vizij/speech-react` deleted**: the package directory, its
   `.changeset/config.json` `ignore` entry, the README and AGENTS tables.
4. **tutorial-fullscreen-face** (6.1).
5. **demo-vizij-player** (6.2; after G2, G3).
6. **tutorial-agent-face** (6.4; after D9), with the vizij-docs pull request
   of 9.3.
7. **vizij-showcase** (6.3; after G1).
8. **vizij-authoring**: VIZ-148's sequence (gate, exporter in `ExportDialog`,
   viewport, programs and timeline, reloads, StrictMode memory, load time).

Between PR 1 and the last app PR the workspace typecheck of the branch is red
(D4); each PR is green on its own scope. The branch is rebase-merged onto
`main` once every PR is in and the whole workspace is green. Done when the
lockfile holds no `@vizij/runtime-react@0.4` and no `@vizij/runtime@2`.

### 9.2 e2e evidence per app

Each spec waits for `[data-vizij-ready="true"]` on the app's slot, then samples
the slot's pixels from a screenshot (more than eight distinct colours: the
canvas is not uniform), then changes something and asserts the sample's digest
changed against the face's idle change over the same interval, as
`e2e/tests/vizij-standalone-face.spec.ts` does. The sampler moves from that
spec to a shared `e2e/pixels.ts`.

| App                                                 | Spec                                                                                         | Port | Change asserted                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| tutorial-fullscreen-face (filter `fullscreen-face`) | new `e2e/tests/fullscreen-face.spec.ts`                                                      | 5204 | expression hotkey                                                                                                    |
| demo-vizij-player                                   | `demo-vizij-player-load-sample.spec.ts` extended                                             | 5200 | load sample, then a rig slider; an animation plays (player state `playing`)                                          |
| tutorial-agent-face                                 | new `e2e/tests/tutorial-agent-face.spec.ts` (no Gemini key: the face and the debug controls) | 5206 | emotion button                                                                                                       |
| vizij-showcase                                      | new `e2e/tests/vizij-showcase.spec.ts`                                                       | 5205 | one `<canvas>` on the page; each of the five slots ready and sampled after scrolling to it; `memoryBytes()` recorded |
| vizij-authoring                                     | VIZ-148's gates                                                                              | 4175 | picking, export round trip, StrictMode memory                                                                        |

Port 5203 is `vizij-standalone`'s.

### 9.3 Guidebook (vizij-docs)

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

### 9.4 npm

- `@vizij/render` 1.0.0 and `@vizij/runtime-react` 1.0.0: from their
  changesets, published by `publish-npm.yml` when the Version Packages PR
  merges.
- `@vizij/speech-react`: `npm deprecate @vizij/speech-react "<message>"` (a
  manual step for Victor); no further version.
- `@vizij/runtime`: `latest` at 5.0.0; G1–G3 ship in 5.1.0, whose Version
  Packages PR (vizij-rs [#189](https://github.com/vizij-ai/vizij-rs/pull/189))
  is open. The peer ranges move to `^5.1.0` with it.
- `@vizij/render` has a pending `major` changeset on `main` already (the
  headless exporter, [#134](https://github.com/vizij-ai/vizij-web/pull/134)).
  Released before the integration branch merges, it publishes as 1.0.0 and the
  faces-as-slots release becomes 2.0.0; released together, both are 1.0.0.

## 10. Decisions

Decided with Victor on 2026-10-10.

| #   | Question                                                      | Decision                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | How apps command a face                                       | Through its Arora API: the methods it declares and its data store. An app uses the standard profile it chooses; a Vizij app uses the vizij standard (`standard/vizij/…`) by default. ROS4HRI is a special profile that apps do not use directly (section 4). |
| D2  | The shared canvas's place                                     | One canvas fixed over the page, pointer events off, the page's UI above it by z-index; the authoring viewport positions its canvas itself with pointer events on.                                                                                            |
| D3  | Pausing a program (demo-vizij-player `ProgramsPanel.tsx:133`) | Pause is a halt; resume is a new spawn.                                                                                                                                                                                                                      |
| D4  | The integration branch between PRs                            | One PR per package or app into the integration branch, each green on its own scope; the branch's workspace typecheck is red until the last app PR.                                                                                                           |
| D5  | The showcase's Voice section                                  | The device's `say`, which needs no credentials. The Polly timeline and the slider that scrubs through visemes go.                                                                                                                                            |
| D6  | tutorial-agent-face's volume-driven mouth                     | A vizij-standard key: the one the shipped faces' adaptations map. Quori's rig reads `standard/vizij/mouth/morph/jaw_open` (AU 26 under the name current faces implement); no shipped face maps `standard/vizij/face/jaw_open`, and Hugo maps neither.        |
| D8  | The showcase's hidden-section stepping at 1 Hz                | Deleted: an offscreen face stops (`run={visible}`).                                                                                                                                                                                                          |

Open:

| #   | Question                                                                                        | Options                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D9  | Quori's active program writes the standard's eye, lid, brow and jaw keys every step (section 4) | (a) an app commanding those keys loads Quori with `program: "none"` and loses the program's idle motion; (b) the app halts the program run while it commands them and starts a new one after; (c) the program writes rig paths rather than the standard's keys (the face asset). |
