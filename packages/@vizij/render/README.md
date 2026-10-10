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
  for the cost of one App.
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

Peer requirements: `@vizij/runtime ^6`, `react >= 18`, `three ^0.170` (the
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

### `<Vizij vizijId className? style? toneMapping? fit? zoom? bounds? showSafeArea? selection? onPick? />`

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

The slot carries `data-vizij-id` and `data-vizij-ready`, `"true"` once the
face's scene shows its device's pose — what an e2e test waits on. When a slot
unmounts, its face is placed on an empty rectangle, where it draws nothing.
One slot shows a face at a time.

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
trip of the shipped faces and of an ellipse and a rectangle, and the canvas's
frame loop. `size-limit` guards the bundle size.

---

## Publishing

A change carries a changeset (`pnpm changeset`). Merging to `main` updates the
Version Packages PR, and merging that publishes through
[`.github/workflows/publish-npm.yml`](../../../.github/workflows/publish-npm.yml).
See the root [README → Publishing & Versioning](../../../README.md#publishing--versioning).

---

## Related Packages

- [`@vizij/runtime`](https://www.npmjs.com/package/@vizij/runtime) – the Bevy
  view and each face's Arora device, in one wasm module.
- [`@vizij/runtime-react`](../runtime-react/README.md) – one face's lifecycle
  in React and the fan-out of its store changes.
