# `tutorial-fullscreen-face` Runtime Walkthrough

`tutorial-fullscreen-face` is the smallest reference app for driving a Vizij
face from React: one GLB, one provider, one face on the page's canvas, and the
keyboard showing its expressions and visemes. Everything it does to the face
goes through the face's Arora API, on the keys of the Vizij face standard.

## 1. The page: one canvas, one slot

```tsx
export function FaceApp() {
  return (
    <>
      <VizijCanvas style={CANVAS_STYLE} />
      <VizijRuntimeProvider
        glb={faceAssetUrl}
        options={{ program: autoplay ? "auto" : "none" }}
      >
        <FaceRuntime />
      </VizijRuntimeProvider>
    </>
  );
}
```

- `<VizijCanvas>` (`@vizij/render`) is the page's one canvas: the Bevy view of
  `@vizij/runtime` draws every face on it. Here it is fixed over the page's
  backdrop, its pointer events off, and the hints stack above it.
- `<VizijRuntimeProvider>` (`@vizij/runtime-react`) fetches the GLB, loads the
  face with `loadVizij` and runs its device. `options` are `loadVizij`'s: the
  face's active program runs from load only with `?autoplay`.
- `<VizijRuntimeFace>` is the slot where the face draws: a `<div>` the canvas
  places the face over. It carries `data-vizij-ready="true"` once the face
  shows.

The face is Quori, from
`apps/vizij-authoring/public/assets/Quori_Current_Extended.glb`: its bundle
carries its rig, its poses and its standard adaptation, which maps the face
standard's keys onto the rig.

## 2. Load state

`useVizijRuntime()` returns the face: `status` (`loading`, `ready`, `error`),
`error`, and `runtime`, the face's `Runtime` from `@vizij/runtime`. The slot
renders from the start; the page shows a loading overlay until `status` is
`ready`.

## 3. Expressions and visemes

[`src/hooks/useFaceHotkeys.ts`](./src/hooks/useFaceHotkeys.ts) reads the face
standard's profile (`profile("vizij-face")` from `@vizij/runtime`) and binds
its expressions, then its visemes, to the keys `1`–`0` and `Q`–`M`:

- holding an expression's key fades `standard/vizij/expression/<name>` to
  0.75 over two seconds with `useAnimateValue`, and releasing it fades it
  back to 0;
- a viseme's key calls the device's `play_viseme` method, which plays the
  shape through the face's lipsync envelope:

`runtime.path(key)` addresses a key of this face: `rig/<faceId>/` + `key`. A
number written to a `standard/vizij/*` key is the `f32` the profile declares.
With `?autoplay`, the face's active program runs beside these writes and moves
the face between them.

```ts
animateValue(runtime.path("standard/vizij/expression/happy"), 0.75, {
  duration: 2,
});
runtime.invoke("play_viseme", { shape: "aa", weight: 0.75 });
```

## 4. Going further

- [`apps/tutorial-agent-face/tutorial.md`](../tutorial-agent-face/tutorial.md):
  speech, the conversation state and an agent driving the face.
- [`packages/@vizij/runtime-react/README.md`](../../packages/@vizij/runtime-react/README.md)
  and its design document, which lists each intent's key or method.
