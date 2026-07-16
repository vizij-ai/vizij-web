# `tutorial-fullscreen-face` Runtime Walkthrough

`tutorial-fullscreen-face` is the smallest maintained reference app for the current `@vizij/runtime-react` stack. It shows the default bundle-first path without layering on live speech, diagnostics panels, or shared runtime coordination.

If you want to understand the baseline runtime flow, start here.

## 1. Runtime Shape

The app uses one `VizijAssetBundle` and one `VizijRuntimeProvider`.

Current flow:

1. load a bundled GLB
2. let runtime-react extract the embedded `VIZIJ_bundle`
3. stage the face back to neutral once the runtime is ready
4. render with `VizijRuntimeFace`
5. drive gaze and pose weights through `useVizijRuntime()`

The code lives primarily in [`src/FaceApp.tsx`](./src/FaceApp.tsx).

## 2. The Bundle

The app points directly at the current Quori reference asset from `vizij-authoring`:

```tsx
const faceAssetUrl = new URL(
  "../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
  import.meta.url,
).href;

const assetBundle: VizijAssetBundle = {
  namespace: "fullscreen-face",
  glb: {
    kind: "url",
    src: faceAssetUrl,
    aggressiveImport: true,
  },
  pose: {
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};
```

Important details:

- `namespace` gives this runtime a stable identity.
- `aggressiveImport: true` keeps Vite/asset handling simple for local tutorial use.
- `stageNeutralFilter` prevents neutral staging from zeroing color channels baked into the GLB.

This app does not manually provide `rig`, `pose.graph`, `animations`, or `programs`. It relies on the embedded bundle, which is the current recommended default.

## 3. Provider Wiring

The runtime bootstrap is intentionally small:

```tsx
export function FaceApp() {
  return (
    <VizijRuntimeProvider assetBundle={assetBundle} autostart>
      <VizijRuntimeHud />
      <FaceRuntime />
    </VizijRuntimeProvider>
  );
}
```

What this gives the app:

- asset loading
- engine initialisation
- graph/clip/program registration
- merged runtime status
- renderer-store bridging

Each `VizijRuntimeProvider` owns its engine device, so there is no shared runtime topology to configure.

## 4. Ready / Loading / Error Handling

`FaceRuntime()` reads the runtime state from `useVizijRuntime()`:

```tsx
const { ready, loading, error, stagePoseNeutral, assetBundle } =
  useVizijRuntime();
```

This app uses the resolved `assetBundle` from context, not the original input object, so embedded pose config becomes available once the bundle has loaded.

Once `ready` flips true, the app calls:

```tsx
stagePoseNeutral();
```

That resets authored pose channels to their neutral values before the user starts interacting with the face.

## 5. Rendering The Face

Rendering is handled by `VizijRuntimeFace`:

```tsx
<VizijRuntimeFace className="face-canvas" showSafeArea={false} />
```

The component already knows:

- which `namespace` to read from
- which `rootId` was resolved from the GLB/world

So this tutorial does not need a custom renderer wrapper.

## 6. Mouse Gaze

[`src/hooks/useMouseGaze.ts`](./src/hooks/useMouseGaze.ts) is the simplest example of writing runtime inputs directly.

Pattern:

1. read `setInput()` and `faceId` from `useVizijRuntime()`
2. normalize pointer movement to `[-1, 1]`
3. write full rig paths like `rig/{faceId}/standard/...`

This tutorial still uses direct eye paths because it is intentionally minimal. Larger apps such as `tutorial-agent-face` and `vizij-showcase` also use runtime-react’s face-control helpers when they need more adaptive control discovery.

## 7. Pose Hotkeys

[`src/hooks/usePoseHotkeys.ts`](./src/hooks/usePoseHotkeys.ts) is more representative of the current runtime-react API shape.

It does not build pose paths from pose names manually. Instead it uses:

- `buildPoseWeightPathMap()`
- `filterPosesBySemanticKind()`
- `getPoseSemanticKey()`
- `EXPRESSIVE_EMOTION_POSE_KEYS`

That means the app can:

- derive canonical pose-weight paths from the loaded pose config
- prefer expressive emotion poses first
- fill the remaining hotkeys with other emotion, viseme, and fallback poses

The hotkey hook then animates pose weights through:

```tsx
animateValue(binding.path, { float: weight }, { duration: 2 });
```

This is the current recommended pattern for short-lived pose gestures.

## 8. What This Tutorial Deliberately Does Not Cover

This app is intentionally narrower than the other runtime-react examples in the repo.

It does not cover:

- uploaded GLB sources
- diagnostics panels
- clip/program transport UIs
- shared runtime mode
- runtime graph hot-swapping with `setGraphBundle()`
- live speech, visemes, or tool-driven emotions

For those patterns, continue with:

- [`apps/tutorial-agent-face/tutorial.md`](../tutorial-agent-face/tutorial.md)
- [`apps/demo-vizij-player/docs/runtime-react-walkthrough.md`](../demo-vizij-player/docs/runtime-react-walkthrough.md)
- [`packages/@vizij/runtime-react/README.md`](../../packages/@vizij/runtime-react/README.md)
