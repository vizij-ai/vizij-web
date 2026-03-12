# `demo-vizij-player` Runtime Walkthrough

This document explains how `demo-vizij-player` is built on top of `@vizij/runtime-react`, what happens when you load a face bundle, and how the control surfaces in the demo map back to the runtime API.

If you want to build your own face player, this is the practical setup guide.

## 1. The Runtime Mental Model

The current runtime-react stack is bundle-first.

You hand `VizijRuntimeProvider` a single `VizijAssetBundle`. That bundle always contains a face GLB and can also contain or expose:

- a rig graph
- pose rig graph and pose configuration
- embedded timeline animations
- embedded procedural programs
- initial input values
- metadata

The runtime provider is responsible for:

1. loading the GLB or pre-built world
2. extracting the embedded `VIZIJ_bundle` extension when present
3. resolving a usable rig / pose / animation / program set
4. registering graphs and clips with the orchestrator
5. exposing a stable runtime API through `useVizijRuntime()`
6. rendering the face through `VizijRuntimeFace`

The demo player is deliberately thin on top of that. It mostly does three things:

- chooses a source
- constructs a `VizijAssetBundle`
- builds UI panels from the runtime context

One detail worth keeping explicit: runtime-react does not impose one global namespace scheme. Each app chooses its own namespace strategy. In this demo, every loaded source gets a per-source namespace such as `demo-vizij-player-quori-current-extended`, which keeps each loaded runtime isolated and predictable.

## 2. What `VizijRuntimeProvider` Expects

At minimum, runtime-react needs a `VizijAssetBundle` with a `glb` field.

The bundle type supports:

- `glb`
  - `{ kind: "url", src }`
  - `{ kind: "blob", blob }`
  - `{ kind: "world", world, animatables, bundle? }`
- `rig`
- `pose`
- `animations`
- `programs`
- `initialInputs`
- `metadata`
- `bundle`

In this demo, the app usually provides only:

- `namespace`
- `glb`
- a `pose.stageNeutralFilter`
- a small `metadata` object

Everything else is discovered from the loaded GLB when possible.

That is the key idea: runtime-react is designed so that a single exported face can carry most of what the player needs.

## 3. How The Demo Loads A Face

The demo supports two source types:

- curated samples
- uploaded GLB files

Those are represented in app state as `DemoFaceSource` values. The app stores the currently selected source, but only sample selections are persisted. Uploads are intentionally treated as transient local session state.

The curated samples are defined in `src/data/samples.ts`. Each sample includes:

- display metadata for the library card
- a bundled asset URL
- capability badges and counts for the curated overview

When the user selects a source, `buildAssetBundleForSource()` constructs the runtime bundle:

```ts
export function buildAssetBundleForSource(
  source: DemoFaceSource,
): VizijAssetBundle {
  const base = {
    namespace: `demo-vizij-player-${source.id}`,
    pose: {
      stageNeutralFilter: (_id: string, path: string) =>
        !path.includes("/color/"),
    },
  };

  if (source.kind === "sample") {
    return {
      ...base,
      glb: {
        kind: "url",
        src: sample.assetUrl,
        aggressiveImport: true,
      },
      metadata: {
        sampleId: sample.id,
        sampleLabel: sample.label,
      },
    };
  }

  return {
    ...base,
    glb: {
      kind: "blob",
      blob: source.file,
      aggressiveImport: true,
    },
    metadata: {
      uploadFileName: source.fileName,
      uploadLabel: source.label,
    },
  };
}
```

There are two important details here:

- `namespace` ensures this runtime instance gets a stable identity in the orchestrator and renderer layers.
- `stageNeutralFilter` tells `stagePoseNeutral()` to restore neutral pose channels without stomping color inputs.

The namespace here is intentionally app-specific. Other apps in this repo use different patterns:

- `tutorial-fullscreen-face` uses one fixed namespace
- `vizij-showcase` generates one namespace per surface in shared mode
- `vizij-authoring` can keep the face asset stable while swapping runtime graph payloads

## 4. How The App Boots The Runtime

Once a source exists, `App.tsx` creates an `assetBundle` and mounts the runtime:

```tsx
<VizijRuntimeProvider
  key={source.id}
  assetBundle={assetBundle}
  autostart
  orchestratorScope="isolated"
>
  <WorkspaceSurface sourceLabel={sourceLabel} sourceMeta={sourceMeta} />
</VizijRuntimeProvider>
```

The demo uses:

- `autostart`
  - the orchestrator starts stepping as soon as assets finish registering
- `orchestratorScope="isolated"`
  - each loaded face owns its own isolated runtime instance in this app

If you are building a multi-face app that should share one orchestrator, runtime-react also supports shared orchestration. The package README covers that setup.

## 5. What The Provider Actually Does With The GLB

When the provider receives a bundle, it:

1. loads the GLB or world payload
2. extracts the embedded Vizij bundle extension if one exists
3. finds the usable rig graph, pose graph, pose config, animations, and programs
4. merges explicit bundle fields with discovered embedded content
5. registers graphs and animation controllers with the orchestrator
6. stages initial inputs
7. exposes status, control functions, and diagnostic information through context

The most important runtime behavior for authors is this:

- if you provide explicit `rig`, `pose`, `animations`, or `programs`, those participate in the resolved runtime bundle
- if you omit them, runtime-react tries to discover them from the embedded bundle
- embedded animations and programs are merged and deduplicated by id

That means your app can be very small if your exported GLB already contains the authored content you need.

## 6. Rendering The Face Stage

The visual stage in the demo is intentionally minimal:

```tsx
function ViewerPanel() {
  const { loading, ready, error } = useVizijRuntime();

  return (
    <section className="panel viewer-panel">
      <div className="viewer-frame">
        <VizijRuntimeFace className="viewer-canvas" showSafeArea={false} />
        {loading ? <div className="viewer-overlay">Loading bundle…</div> : null}
        {!loading && !ready && !error ? (
          <div className="viewer-overlay">Preparing runtime…</div>
        ) : null}
        {error ? (
          <div className="viewer-overlay is-error">{error.message}</div>
        ) : null}
      </div>
    </section>
  );
}
```

`VizijRuntimeFace` is only concerned with rendering the resolved face once the runtime knows the `rootId` and namespace. It does not know about your control panels. Those are built entirely through `useVizijRuntime()`.

## 7. The Runtime API You Build Against

Everything in this demo is driven from `useVizijRuntime()`.

The most important fields and methods for bundle-driven faces are:

- status and identity
  - `loading`
  - `ready`
  - `error`
  - `errors`
  - `namespace`
  - `faceId`
  - `rootId`
- surfaced runtime data
  - `assetBundle`
  - `controllers`
  - `outputPaths`
  - `inputConstraints`
- direct control
  - `setInput(path, value)`
  - `setValue(id, namespace, value)`
  - `animateValue(path, target, options)`
  - `cancelAnimation(path)`
- pose helpers
  - `stagePoseNeutral(force?)`
- clip transport
  - `playAnimation(id, options?)`
  - `pauseAnimation(id)`
  - `seekAnimation(id, timeSeconds)`
  - `setAnimationLoop(id, enabled)`
  - `stopAnimation(id, options?)`
  - `getAnimationState(id)`
- procedural program transport
  - `playProgram(id)`
  - `pauseProgram(id)`
  - `stopProgram(id, options?)`
  - `getProgramState(id)`

If you remember only one runtime-react pattern, remember this:

1. get the resolved bundle and runtime API from `useVizijRuntime()`
2. derive your UI from the resolved bundle
3. call the runtime API with resolved ids and paths

## 8. How The Demo Derives The Pose Surface

The pose panel does not hard-code face-specific paths.

Instead, it reads `assetBundle.pose?.config`, groups the poses, and uses `buildPoseWeightPathMap()` to convert pose ids into canonical rig input paths.

That path map is the critical bridge between authored pose definitions and runtime control:

```ts
const posePathMap = buildPoseWeightPathMap(
  Array.isArray(poseConfig?.poses) ? poseConfig.poses : [],
  poseConfig?.faceId ?? assetBundle.faceId ?? null,
);
```

Once the path is known, the panel uses ordinary runtime input writes:

```ts
setInput(posePath, { float: 1 });
window.setTimeout(() => setInput(posePath, { float: 0 }), 450);
```

For held poses, the demo first restores neutral and then asserts the pose:

```ts
stagePoseNeutral(true);
setInput(posePath, { float: 1 });
```

This is why the demo can support pulse and hold behavior without special-case rig logic. The authored pose config and runtime pose-path helpers do the heavy lifting.

### Pose Takeaways

- use `assetBundle.pose?.config` as the source of truth for groups and labels
- use `buildPoseWeightPathMap()` to get runtime-safe paths
- use `stagePoseNeutral(true)` when changing held pose state
- keep pose UI stateless relative to the bundle when possible, because the active bundle can change

## 9. How The Demo Derives The Animation Surface

The animation panel reads `assetBundle.animations ?? []` and treats each entry as a transport target.

Each clip row is just runtime transport around a resolved animation id:

```ts
await playAnimation(animationId, { reset: true });
pauseAnimation(animationId);
seekAnimation(animationId, 0.75);
setAnimationLoop(animationId, true);
stopAnimation(animationId, { clearOutputs: true });
```

The UI also polls `getAnimationState(id)` so the panel can display:

- current time
- duration
- loop state
- whether the clip is actively playing

### Animation Takeaways

- always select by animation id, not by label
- use labels and durations for UI, but use ids for transport calls
- `reset: true` is the right default for operator-driven replay buttons
- `clearOutputs: true` is useful when you want a stop button to release authored output influence immediately

## 10. How The Demo Derives The Program Surface

Procedural programs are surfaced through `assetBundle.programs ?? []`.

The demo treats them as a separate transport surface because programs own authored graph behavior rather than timeline playback.

The program transport is intentionally simple:

```ts
playProgram(programId);
pauseProgram(programId);
stopProgram(programId, { resetOutputs: true });
```

The panel polls `getProgramState(id)` so it can show whether the selected program is:

- `playing`
- `paused`
- `stopped`

### Program Takeaways

- programs are graph-backed, not clip-backed
- `pauseProgram()` unregisters active stepping without forcing a reset
- `stopProgram(..., { resetOutputs: true })` is the safer operator-facing stop action when you want authored outputs cleaned up

## 11. How The Demo Builds Face Controls

The face controls panel is deliberately metadata-driven.

It resolves common control families with:

- `resolveFaceControls()`
- `inputConstraints`

This gives the panel a bundle-aware control model for things like:

- horizontal gaze
- vertical gaze
- blink
- other authored scalar controls

The panel then uses `setInput()` for the actual write and `mapNormalizedControlValue()` to transform normalized UI slider values into the authored input range:

```ts
setInput(control.path, {
  float: mapNormalizedControlValue(control, normalized),
});
```

For generic authored controls that are not part of the standard gaze/blink set, the panel builds a compact list from `assetBundle.rig?.inputMetadata` plus `inputConstraints`.

This is important because it means your operator UI does not need to hard-code every slider. If your bundle exports usable input metadata and constraints, the app can discover a control surface on its own.

### Face Control Takeaways

- prefer `resolveFaceControls()` for standard facial control families
- use `inputConstraints` to respect authored min, max, and default values
- fall back to `assetBundle.rig?.inputMetadata` for additional surfaced channels
- write through `setInput()` even for UI-driven controls so the orchestrator remains the single runtime source of truth

## 12. How The Demo Explains The Loaded Bundle

There are two summary layers in the app:

### Selected bundle

The selected bundle panel is a conceptual summary built from `summarizeAssetBundle()`.

It tells you, at a glance:

- how many graphs the bundle contains
- whether it has poses, clips, or programs
- which labels and groups were surfaced
- how many direct input channels were found

This is the “what did we load?” view.

### Diagnostics

The diagnostics panel is the “what did runtime do with it?” view.

It explains:

- bundle graph inventory
  - what the asset shipped with before runtime registration
- runtime controllers
  - which graph and animation controllers are actually surfaced by the runtime
- renderer outputs
  - which authored output channels can drive the renderer pipeline
- metadata
  - provenance and staged initial inputs
- errors
  - whether failures happened during asset load, registration, animation, bridge wiring, or driver logic

This distinction matters.

It is completely normal for:

- a face to render successfully
- while controller ids remain sparse or absent
- because renderer state, asset import, and controller registration are related but not identical layers

That is exactly why the diagnostics panel exists.

## 13. What The Embedded Runtime API Examples Are Showing You

Each control panel now includes a collapsible runtime API disclosure. These are not meant to be exhaustive references. They are there to show one concrete example of the runtime call that powers that panel.

### Face controls disclosure

Shows example `setInput()` calls for:

- gaze
- blink
- one discovered authored scalar control

This is the quickest way to see the real runtime path strings for the current face.

### Poses disclosure

Shows one concrete pose-weight path and the two operator patterns:

- pulse / bounce
- hold

This is useful when you want to understand the difference between a temporary pose trigger and a latched pose state.

### Animations disclosure

Shows transport calls for the selected clip:

- `playAnimation`
- `pauseAnimation`
- `seekAnimation`
- `setAnimationLoop`
- `stopAnimation`

### Programs disclosure

Shows transport calls for the selected procedural program:

- `playProgram`
- `pauseProgram`
- `stopProgram`

In practice, these disclosures answer the question:

"What exact runtime-react call do I need to make for this class of control?"

## 14. A Minimal Setup You Can Reuse

If you want the smallest useful runtime-react app patterned after this demo, start here:

```tsx
import {
  VizijRuntimeFace,
  VizijRuntimeProvider,
  buildPoseWeightPathMap,
  resolveFaceControls,
  useVizijRuntime,
} from "@vizij/runtime-react";

const assetBundle = {
  namespace: "my-face",
  glb: {
    kind: "url",
    src: new URL("./MyFace.glb", import.meta.url).href,
    aggressiveImport: true,
  },
  pose: {
    stageNeutralFilter: (_id: string, path: string) =>
      !path.includes("/color/"),
  },
};

export function App() {
  return (
    <VizijRuntimeProvider assetBundle={assetBundle} autostart>
      <RuntimeHud />
      <VizijRuntimeFace />
    </VizijRuntimeProvider>
  );
}

function RuntimeHud() {
  const {
    assetBundle,
    loading,
    ready,
    error,
    setInput,
    stagePoseNeutral,
    playAnimation,
    playProgram,
    inputConstraints,
  } = useVizijRuntime();

  if (loading) return <p>Loading…</p>;
  if (error) return <p>{error.message}</p>;
  if (!ready) return <p>Preparing runtime…</p>;

  const faceControls = resolveFaceControls(
    assetBundle,
    assetBundle.faceId ?? assetBundle.pose?.config?.faceId ?? null,
    inputConstraints,
  );

  const poseMap = buildPoseWeightPathMap(
    assetBundle.pose?.config?.poses ?? [],
    assetBundle.pose?.config?.faceId ?? assetBundle.faceId ?? null,
  );

  const firstPose = assetBundle.pose?.config?.poses?.[0];
  const firstPosePath = firstPose ? poseMap.get(firstPose.id) : null;
  const firstAnimation = assetBundle.animations?.[0];
  const firstProgram = assetBundle.programs?.[0];

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (faceControls.blink) {
            setInput(faceControls.blink.path, {
              float: faceControls.blink.max,
            });
          }
        }}
      >
        Blink
      </button>

      <button
        type="button"
        onClick={() => {
          if (firstPosePath) {
            stagePoseNeutral(true);
            setInput(firstPosePath, { float: 1 });
          }
        }}
      >
        Hold first pose
      </button>

      <button
        type="button"
        onClick={() => {
          if (firstAnimation) {
            void playAnimation(firstAnimation.id, { reset: true });
          }
        }}
      >
        Play first clip
      </button>

      <button
        type="button"
        onClick={() => {
          if (firstProgram) {
            playProgram(firstProgram.id);
          }
        }}
      >
        Play first program
      </button>
    </div>
  );
}
```

That example is intentionally simple, but it contains the real pattern:

- give the provider a bundle
- use the runtime hook
- discover what the bundle contains
- build your UI around the resolved ids and paths

## 15. Common Implementation Decisions

### When should you rely on embedded content?

Use embedded bundle content when:

- your GLB was exported from Vizij authoring with bundle metadata intact
- you want the fewest app-side assumptions
- you want your player to adapt automatically to different faces

Override bundle content manually when:

- you are building tooling or test harnesses
- you want to inject local graphs or programs during development
- you are validating content that is not fully embedded yet

### When should you use `setInput()` versus `animateValue()`?

Use `setInput()` when:

- you are driving authored rig or pose channels directly
- the UI is operator-controlled and should write immediately
- you are toggling a pose, blink, or scalar control

Use `animateValue()` when:

- you want a short ad hoc tween that is not already authored as a clip
- you need runtime-side easing for a direct value change

### When should you use clips versus programs?

Use clips when:

- the behavior is timeline-authored
- transport concepts like seek and loop matter

Use programs when:

- the behavior is graph-authored and procedural
- you want graph logic to own outputs while the program is active

## 16. Pitfalls And Caveats

- Uploaded GLBs are not persisted across reloads in this demo. Only curated sample selection is restored.
- Control surfacing is only as good as the authored metadata. If `inputMetadata` or `inputConstraints` are sparse, the generic control panel will also be sparse.
- Controller ids and renderer outputs tell you about runtime surfacing, not just static bundle structure. Use diagnostics to distinguish those two layers.
- If you switch bundles, re-resolve all ids and paths. Do not cache pose paths, animation ids, or program ids across bundle swaps.
- If your app is multi-face, revisit `orchestratorScope` and namespace strategy instead of blindly copying this demo’s isolated setup.

## 17. Recommended Build Order For Your Own App

If you are building your own runtime-react face surface from scratch, this is the safest order:

1. Get a single `VizijRuntimeProvider` + `VizijRuntimeFace` render working.
2. Confirm `loading`, `ready`, `error`, and `faceId` reporting.
3. Add an overview panel from `assetBundle`, not from assumptions about the file.
4. Add pose transport using `buildPoseWeightPathMap()` and `stagePoseNeutral()`.
5. Add clip transport using animation ids and `getAnimationState()`.
6. Add program transport using program ids and `getProgramState()`.
7. Add metadata-driven face controls using `resolveFaceControls()` and `inputConstraints`.
8. Add diagnostics for `controllers`, `outputPaths`, and `errors`.
9. Add runtime call examples only after the control model is stable, so your examples stay truthful.

That is effectively the order followed by `demo-vizij-player`.

## 18. Where To Look In This Repo

If you want to trace the real implementation:

- app shell and provider mounting
  - `apps/demo-vizij-player/src/App.tsx`
- sample source to bundle conversion
  - `apps/demo-vizij-player/src/data/samples.ts`
- bundle summary logic
  - `apps/demo-vizij-player/src/lib/bundleSummary.ts`
- poses panel
  - `apps/demo-vizij-player/src/components/PosePanel.tsx`
- animations panel
  - `apps/demo-vizij-player/src/components/AnimationPanel.tsx`
- programs panel
  - `apps/demo-vizij-player/src/components/ProgramsPanel.tsx`
- face controls panel
  - `apps/demo-vizij-player/src/components/FaceControlsPanel.tsx`
- diagnostics panel
  - `apps/demo-vizij-player/src/components/DiagnosticsPanel.tsx`
- runtime provider internals
  - `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`
- runtime public types
  - `packages/@vizij/runtime-react/src/types.ts`

## 19. Bottom Line

The shortest correct description of the current runtime-react workflow is:

- export a bundled face GLB
- pass it to `VizijRuntimeProvider`
- let runtime-react unpack the authored content
- render with `VizijRuntimeFace`
- build your UI from the resolved bundle and `useVizijRuntime()`

That is the core pattern this demo is meant to teach.
