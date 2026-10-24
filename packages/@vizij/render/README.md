# @vizij/render

> Vizij faces on a page — the page's canvas and the face slots over
> [`@vizij/runtime`](https://www.npmjs.com/package/@vizij/runtime)'s Bevy view —
> and the GLB loader, exporter and world model the authoring app edits.

---

## Overview

- **The page's canvas, `<VizijCanvas>`.** `@vizij/runtime` runs one Bevy App
  per page, on one canvas. `<VizijCanvas>` renders it and mounts it once;
  while it is shown, one animation-frame loop places each face over its slot
  and hands each pointer pick to the slot it names.
- **A face slot, `<Vizij>`.** A `<div>` marking where one face draws on that
  canvas. It renders no canvas of its own, so a page shows any number of faces
  for the cost of one App. Until its face is drawn, it shows a loading view:
  the runtime's download and start, then the face's own stages.
- **The loader and the exporter.** `loadGLTF`, `loadGLTFFromBlob` and their
  `WithBundle` forms turn a rigged GLB into the world model; `buildSceneGraph`
  and `exportScene` turn the world model back into GLB bytes. Both run in Node
  as well as in a browser.
- **The world model and its store.** `useVizijStore` and its hooks hold the
  world, its animatables and the element selection: the document the authoring
  app edits.

A face's device — loading it, writing its keys, calling its methods — is
`@vizij/runtime`'s `Runtime`; [`@vizij/runtime-react`](../runtime-react/README.md)
binds one to a React tree.

---

## Installation

```bash
pnpm add @vizij/render @vizij/runtime three zustand @vizij/utils
```

Peer requirements: `@vizij/runtime ^8` (its `onInitProgress` feeds the
loading view), `react >= 18`, `three ^0.170` (the
loader and the exporter), `zustand ^5` (the store). `@vizij/runtime` is a peer
so that a page resolves one copy of it, and therefore one wasm module.

---

## Usage

```tsx
import { VizijCanvas, Vizij } from "@vizij/render";

export function Page() {
  return (
    <>
      <VizijCanvas />
      <section>
        <Vizij vizijId="quori" style={{ width: 480, height: 360 }} />
      </section>
    </>
  );
}
```

The face itself is loaded under the same id, once the canvas is mounted:

```ts
import { canvasMounted } from "@vizij/render";
import { loadVizij } from "@vizij/runtime";

await canvasMounted();
const quori = await loadVizij("quori", glbBytes);
void quori.run();
```

`@vizij/runtime-react`'s `VizijRuntimeProvider` does this for a React tree.

### `<VizijCanvas options? className? style? />`

- Its first mount calls `@vizij/runtime`'s `mount` with `options` (every
  face's defaults: `fit`, `zoom`, `background`, `ambient`, `unlit`). A second
  `<VizijCanvas>`, a remount or React StrictMode's second effect shows the same
  canvas and App; the options of the first mount stand for the page's
  lifetime.
- `canvasMounted()` resolves with the canvas once it is mounted, which
  `loadVizij` requires, and rejects if mounting failed.
- Default style: `position: fixed; inset: 0; pointer-events: none`, over the
  page content. Faces then draw wherever their slots lie, whatever the
  backgrounds of the sections between, and the page's own UI keeps the
  pointer. Content that must draw over a face stacks above the canvas.
- `className` or `style` replace the default. A page that takes picks (an
  authoring viewport) places the canvas itself and gives it pointer events.

The canvas's loop reads every slot's rectangle each frame and calls
`placeVizij` when it moved, which follows scrolling, resizes and layout shifts
alike. `placeVizij` and `drainPicks` act on the whole page, which is why they
have one caller.

### `<Vizij vizijId className? style? toneMapping? fit? zoom? bounds? showSafeArea? selection? onPick? loadingImage? loading? />`

| Prop                 | Effect                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| `vizijId`            | The face the slot shows: the id it is loaded under.                                                          |
| `className`, `style` | Size and place the slot; the face draws over its border box.                                                 |
| `toneMapping`        | The face's tone-mapping curve (`none`, `agx`, `aces`, `neutral`): `setView`.                                 |
| `fit`, `zoom`        | How the framed bounds fit the slot, and the magnification after the fit; the canvas's options when absent.   |
| `bounds`             | The world rectangle the face's camera frames, in place of the GLB's authored `rootBounds`.                   |
| `showSafeArea`       | Outlines the framed bounds (`safeArea(vizijId)`) over the face, as a DOM overlay.                            |
| `selection`          | The element ids whose outlines glow (`setSelection`). Absent, the slot leaves the face's selection as it is. |
| `onPick`             | A press on the face: `{ vizijId, elementId }`, `elementId` `null` for a press that hit no element.           |
| `loadingImage`       | The default loading view's image, in place of Vizij's logo, which it ships; `null` for none.                 |
| `loading`            | The slot's own loading view, `(loading: VizijLoading) => ReactNode`; `null` for none.                        |

The slot carries `data-vizij-id` and `data-vizij-ready`, `"true"` once the
face's scene shows its device's pose — what an e2e test waits on. When a slot
unmounts, its face is placed on an empty rectangle, where it draws nothing.
One slot shows a face at a time.

### The loading view

Until its face is first drawn, a slot shows a loading view over its border
box, centred: an image, Vizij's logo by default, then a progress bar and a
short label of the stage in the slot's text colour. The stages, in order:

| Stage      | Label                                  | Bar           | Reported by                                  |
| ---------- | -------------------------------------- | ------------- | -------------------------------------------- |
| `download` | Downloading the runtime: 3.1 of 9.8 MB | the bytes     | `<VizijCanvas>`, from `onInitProgress`       |
| `compile`  | Compiling the runtime                  | indeterminate | `<VizijCanvas>`, from `onInitProgress`       |
| `start`    | Starting the runtime                   | indeterminate | `<VizijCanvas>`, from `onInitProgress`       |
| `mount`    | Starting the view                      | indeterminate | `<VizijCanvas>`, until `mount` resolves      |
| `fetch`    | Loading the face: 1.2 of 4.0 MB        | the bytes     | the face's loader, `setVizijProgress`        |
| `load`     | Loading the face                       | indeterminate | the face's loader; the default after `mount` |
| `draw`     | Drawing the face                       | indeterminate | the face's loader                            |
| `failed`   | Loading failed                         | none          | `<VizijCanvas>` or the face's loader         |

Without a known total, a byte count reads "3.1 MB" and its bar is
indeterminate; before any byte, the label has no count. A failure shows first;
the runtime's stages show before the face's, which wait on them. The view
hides once the canvas's loop reads the face ready (`data-vizij-ready="true"`),
and stays hidden through a reload, whose previous scene draws until the new
one is ready.

- **The face's stages** are reported by whoever loads the face, keyed by its
  id: `setVizijProgress(vizijId, progress)`, with `progress` a
  `VizijProgress` — `{ stage: "fetch", loaded, total }` (`total` `null` when
  unknown), `{ stage: "load" }`, `{ stage: "draw" }` or
  `{ stage: "failed", error }`. `@vizij/runtime-react`'s provider reports its
  face. A page that calls `loadVizij` itself reports the same way, or leaves
  its slot at "Loading the face" until the face is drawn. `null` says no face
  is loaded under the id any more, and its slot shows the loading view again.
- **Its image:** `loadingImage` replaces Vizij's logo, which the view ships (a
  small inline SVG in the logo's own colours); `null` leaves the image out.
- **Its whole element:** `loading` is called with a `VizijLoading` —
  `{ stage, label, fraction }`, `fraction` from 0 to 1 for a byte count with
  a known total and `null` otherwise — and its result is shown over the slot
  in place of the default view. `loading={null}` shows none.

```tsx
<Vizij vizijId="quori" loadingImage={<img src="/logo.svg" alt="" />} />
<Vizij
  vizijId="quori"
  loading={({ label, fraction }) => (
    <Spinner label={label} value={fraction ?? undefined} />
  )}
/>
```

The default bar is a `role="progressbar"` named "Loading the face", its
`aria-valuetext` the label, and its `aria-valuenow` the percentage when the
stage has a fraction (indeterminate otherwise); a failure is a
`role="status"`. The view is a DOM overlay inside the slot, with pointer
events off, so it shows wherever the canvas draws nothing — the whole slot
until its face draws. `<VizijCanvas>` shows no loading view of its own: by default it
covers the whole page, and every slot already shows the runtime's stages.

### Loading and exporting

- `loadGLTF(url, aggressiveImport?, rootBounds?)`, `loadGLTFFromBlob` and
  their `WithBundle` forms return the world, its animatables, the
  `VIZIJ_bundle` and the GLB's animations. A blob is parsed in memory, with
  nothing fetched.
- `buildSceneGraph(world, animatables, rootId)` builds the three.js graph of a
  world element with no renderer; `exportScene(root, { bundle, animations })`
  encodes it as GLB bytes. Every node carries its element's `RobotData`, and
  its transform, morph weights and material factors are the element's
  authored defaults.
- `createExportAnimation({ name, duration, tracks, root })` turns baked
  tracks — plain data, `ExportAnimationTrack`: a node's name, a
  `position`, `quaternion`, `scale` or `morphTargetInfluences` property, key
  times in seconds and flattened values — into one of the `animations`
  `exportScene` writes. Each track is bound against `root` by node name first,
  and one that would not bind (no such node, no such morph target, a value
  count that is not `times × stride`) is left out and returned in `issues`,
  since the exporter otherwise drops the whole animation or throws.
  `animation` is `null` when no track binds.
- An ellipse or a rectangle exports as a node with no mesh, carrying its
  `RobotData` — `type`, `width`, `height`, `fillColor`, `fillOpacity` — from
  which the Bevy view draws it: a unit circle or square scaled by the width
  and height, filled with the colour and opacity. Its stroke is not drawn.
- `extractVizijBundle(scene)` and `applyVizijBundle(scene, bundle)` read and
  write the bundle on a three.js graph.

The `VIZIJ_bundle` extension follows the schema in
[`src/types/vizij-bundle.ts`](./src/types/vizij-bundle.ts): rig graphs, pose
configs, programs, stored clips and provenance hashes, beside glTF animations
that viewers which do not understand Vizij still play.

### The store

- `useVizijStore(selector)` reads the store of the nearest
  `VizijContext.Provider`; `useVizijStoreGetter`, `useVizijStoreSetter` and
  `useVizijStoreSubscription` are its fine-grained forms.
- `createVizijStore()` and `useDefaultVizijStore` create and hold one.
- It holds the world, its animatables, values keyed by namespace, the element
  selection, and the edits the authoring app makes to them (`setVizij`,
  `addWorldElements`, `setStaticFeature`, `createAnimatable`, …). Its types are
  `VizijData` and `VizijActions`.

---

## Development & Testing

```bash
pnpm --filter "@vizij/render" build
pnpm --filter "@vizij/render" test
pnpm --filter "@vizij/render" typecheck
pnpm --filter "@vizij/render" lint
pnpm --filter "@vizij/render" size
```

The tests run on Node (`node --test`): the loader, the headless export round
trip of the shipped faces and of an ellipse and a rectangle, the binding and
export of baked animations, the canvas's frame
loop, and the loading view's stages, labels and overrides, against a stand-in of
`@vizij/runtime` (`tests/runtime-stand-in.mjs`). `size-limit` guards the bundle
size.

Faces are drawn by `@vizij/runtime`'s Bevy view, a peer dependency. `three` is
imported only by the loader (`src/functions/load-gltf.ts`,
`src/functions/gltf-loading/`) and the exporter
(`src/functions/build-scene-graph.ts`, `src/functions/export.ts`,
`src/functions/export-animation.ts`, `src/functions/vizij-bundle.ts`); the
rest imports its types at most. An API
change updates the apps that use the package and `@vizij/runtime-react` in the
same change.

---

## Publishing

A change carries a changeset (`pnpm changeset`). Merging to `main` updates the
Version Packages PR, and merging that publishes through
[`.github/workflows/publish-npm.yml`](../../../.github/workflows/publish-npm.yml).
See [`CONTRIBUTING.md` › Releasing](../../../CONTRIBUTING.md#releasing).

---

## Related Packages

- [`@vizij/runtime`](https://www.npmjs.com/package/@vizij/runtime) – the Bevy
  view and each face's Arora device, in one wasm module.
- [`@vizij/runtime-react`](../runtime-react/README.md) – one face's lifecycle
  in React and the fan-out of its store changes.
