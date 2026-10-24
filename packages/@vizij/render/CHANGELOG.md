# @vizij/render

## 3.0.1

### Patch Changes

- d31d15e: The `@vizij/runtime` peer range is `^8.0.0 || ^9.0.0`. The package uses the runtime's page functions and types, which runtime 9 keeps as they are; 9's breaking change concerns only WebAssembly guest modules, which the package does not load. It is built and tested against `@vizij/runtime` 9.0.2.

## 3.0.0

### Major Changes

- 452ad89: The loader and the exporter read and write Semio Studio's faces, with their features per axis, and export baked animations without `three` in the caller.
  - Breaking: `translation` and `rotation` are optional in the `Group`, `Shape`, `Ellipse` and `Rectangle` features, since a per-axis face has neither whole; each type gains its per-axis keys (`PerAxisFeatures`, `PerAxisTransformFeatures`, `VectorAxis`, `RotationAxis`, `ColorAxis`). A loaded element still carries each of translation and rotation, whole or by at least one axis, and the loader names the features an element lacks.
  - An element's compound features — translation, rotation, scale, `color`, `emissive`, `specular`, `fillColor`, `strokeColor` — may be carried whole, per axis (`translation.x`, `rotation.r`, `color.g`), each axis a number feature on an animatable of its own or on a component `<id>.<axis>` of a compound one, or both, a component given per axis standing over the whole value's. Such a face loads, `buildSceneGraph` applies its per-axis features to the node's transform and the material, and `exportScene` writes its `RobotData` back unchanged.
  - A rotation given as `{ r, p, y }` (roll, pitch, yaw) applies as the euler `{ x, y, z }`, in ZYX order.
  - `createExportAnimation({ name, duration, tracks, root })` builds an animation for `exportScene({ animations })` from baked tracks given as plain data (`ExportAnimationTrack`: the node's name, a `position`, `quaternion`, `scale` or `morphTargetInfluences` property, key times in seconds and flattened values). Each track is bound against `root` by node name first; one that would not bind — no such node, no such morph target, or a value count other than `times × stride` — is left out and returned in `issues`, since `GLTFExporter` would otherwise drop the whole animation or throw. `animation` is `null` when no track binds.
  - An aggressive import of a GLB that has no `RobotData` and no mesh, ellipse or rectangle fails with `EmptyModelError` ("The GLB has no RobotData and no mesh, ellipse or rectangle to import"), not with an error asking for root bounds: the file holds no face to frame.
  - The store's `setValue(id, namespace, updater)` calls the updater with the value held, or with the animatable's default when none is, and stores what it returns, `0` and `false` included; an updater that returns `undefined` leaves the value as it was.

## 2.0.0

### Major Changes

- 8eb2bfd: Faces draw on `@vizij/runtime`'s Bevy view, on the page's one canvas: the runtime runs one view per page, and every face on the page draws on it. `three` serves only the loader and the exporter. The peer dependencies are `@vizij/runtime` `^8.0.0`, the version the package is built and tested against, `react` `>=18`, `three` `^0.170.0` and `zustand` `^5.0.2`. `@vizij/runtime` is a peer so that a page resolves one copy of it, and so one wasm module.
  - `<VizijCanvas options? className? style? />` renders the page's canvas and mounts the view on it once (`mount(canvas, options)`); a second `<VizijCanvas>`, a remount or React StrictMode's second effect shows the same canvas. By default it is fixed over the page with pointer events off. While it is shown, one animation-frame loop places each face over its slot (`placeVizij`) and hands each pick to the slot it names (`drainPicks`). `canvasMounted()` resolves with the canvas once it is mounted, and rejects if mounting failed.
  - `<Vizij vizijId />` is a face slot: a `<div>` where the face loaded under `vizijId` draws, with `data-vizij-id` and `data-vizij-ready`. `vizijId` replaces `rootId` and `namespace`; `toneMapping`, `fit`, `zoom` and `bounds` set the face's view (`setView`); `showSafeArea` outlines `safeArea(vizijId)` as a DOM overlay; `selection` sets the glowing elements (`setSelection`) in place of `showSelectionGlow`; `onPick` receives each press, a miss as `elementId: null`, in place of `onPointerMissed`.
  - Until its face is first drawn, a slot shows a loading view: an image, a progress bar and the stage's label. The stages are the runtime's download (in MB), compile and start (`@vizij/runtime`'s `onInitProgress`), the view starting (`mount`), then the face's GLB, its load and its first frame. The view hides once the face is drawn and stays hidden through reloads, whose previous scene draws meanwhile.
    - `<Vizij loadingImage>` replaces the image, Vizij's logo shipped as inline SVG in its own colours; `null` leaves it out. `<Vizij loading>` replaces the whole view with what it returns for `{ stage, label, fraction }`; `loading={null}` shows none.
    - `setVizijProgress(vizijId, progress)` reports a face's own stages for its slot — `fetch` with its bytes, `load`, `draw`, `failed` — and `null` says no face is loaded under the id. `@vizij/runtime-react`'s provider reports its face's; a page that calls `loadVizij` itself reports them the same way.
    - The bar is a `role="progressbar"` with `aria-valuetext`, and `aria-valuenow` when the stage counts bytes against a known total; indeterminate otherwise. A failure shows its label without the bar.
    - `<VizijCanvas>` gives the browser a frame to paint the slots' stage before `mount` and before `canvasMounted()` resolves, since `mount` and `loadVizij` hold the main thread.
  - `buildSceneGraph` exports an ellipse or a rectangle as a node with no mesh carrying its `RobotData` (`type`, `width`, `height`, `fillColor`, `fillOpacity`, …), which the Bevy view draws as a circle of radius 1 or a 1 × 1 square scaled by the width and height; the node holds the translation and rotation, and the width and height as its scale. `deriveRootBounds` measures such a node as that shape under its world matrix, and takes any `Object3D`, such as the root `buildSceneGraph` returns.
  - The react-three-fiber renderer is removed with `InnerVizij`, `useFeatures` and the memory-investigation counters `canvasMountCount`, `mountedCanvasCount` and `rootReplacementCount`. So are the `@react-three/fiber`, `@react-three/drei`, `react-dom` and `tailwindcss` peer dependencies and the `react-error-boundary`, `clsx` and `deep-equal` dependencies.
  - The store no longer holds what only a mounted renderer wrote or read: `refs`, `setReference`, `getExportableBodies`, `onElementClick`, `hoveredElement`, `setHoveredElement`, `renderHit`, `slotConfig`, `setSlot`, `setSlots` and `clearSlot` are removed. Exporting builds the scene from the world with `buildSceneGraph`.
  - `ToneMappingMode` is `@vizij/runtime`'s `ToneMapping`; `resolveToneMapping`, which returned three.js constants, is removed.

## 1.0.1

### Patch Changes

- c6db7b4: Licensed under Apache-2.0, where the package said MIT or declared no licence. Releases already published keep the licence they were published under.
- Updated dependencies [c6db7b4]
  - @vizij/utils@0.2.1

## 1.0.0

### Major Changes

- 9dd663f: `@vizij/render` loads and exports faces without a renderer, in Node as well as in a browser.
  - `exportScene(root, { bundle, animations })` resolves to the GLB bytes as an `ArrayBuffer` and no longer downloads anything. Its `fileName`, `binary`, `onBinary`, `onComplete` and `onError` options are removed, and so is `downloadGlbBuffer`: the caller saves or uploads the bytes.
  - `buildSceneGraph(world, animatables, rootId)` builds the three.js graph of a world element for `exportScene`. The exported node translation, rotation and scale, morph weights and material factors are the authored defaults, the same numbers as the `RobotData` beside them.
  - World entries no longer carry `refs`. The store keeps each mounted three.js object in `refs`, by element id and then namespace, and `<Vizij>` renders every element under its own `namespace`.
  - The loaders take no `namespaces` argument: `loadGLTF(url, aggressiveImport?, rootBounds?)`, and likewise `loadGLTFFromBlob`, `loadGLTFWithBundle` and `loadGLTFFromBlobWithBundle`. A blob is parsed in memory, with nothing fetched.
  - `loadGltfFromBlob` is removed; `loadGLTFFromBlob` covers it.
  - `lodash` is no longer a dependency.

  `@vizij/runtime-react` loads faces through the new loader signatures.

## 0.1.2

### Patch Changes

- f63fde7: `applyVizijBundle` strips stale `VIZIJ_bundle` copies from descendant nodes for the export window (restoring them on detach). A face loaded from a GLB kept its load-time bundle in the cloned scene's `userData`, so every re-export carried two bundles — and first-match readers (the authoring app itself, the native runtime) saw the stale one, shadowing any edit made since load.
- Updated dependencies [1eaa5bf]
  - @vizij/utils@0.2.0

## 0.1.1

### Patch Changes

- 6e7a15e: Publish the speech-enabled authoring and standalone package surfaces, including
  the shared speech React hooks package and the renderer bundle typing updates
  that support those flows.

## 0.1.0

### Minor Changes

- a53152b: React 19 support and dependency refresh
  - React 19 compatibility across Vizij React packages.
  - Update wasm wrapper dependencies to the latest published `@vizij/*-wasm` versions.
  - CI/release workflow updates (Node 24; npm publish via OIDC).

### Patch Changes

- Updated dependencies [a53152b]
  - @vizij/utils@0.1.0

## 0.0.7

### Patch Changes

- ed31344: Updated to latest vizij-rs dependencies
- Updated dependencies [ed31344]
  - @vizij/utils@0.0.3

## 0.0.6

### Patch Changes

- Fix workspace dep bug

## 0.0.5

### Patch Changes

- a9b5118: Patch color display in canvas

## 0.0.4

### Patch Changes

- Align published dependencies for npm consumption and expose Vitest config helpers for the animation package to fix JSDOM test runs.

## 0.0.3

### Patch Changes

- Update for single glb import/export

## 0.0.2

### Patch Changes

- Update import and export process to save and consistently handle names
- Updated dependencies
  - @vizij/utils@0.0.2

## 0.0.1

### Patch Changes

- Add changlog in preparation for publishing packages
- Updated dependencies
  - @vizij/utils@0.0.1

Release notes are generated via [Changesets](../../.changeset/README.md). Run `pnpm changeset` after changing the public renderer API or bundle surface.
