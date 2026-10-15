# @vizij/render

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
