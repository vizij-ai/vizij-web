---
"@vizij/render": major
"@vizij/runtime-react": patch
---

`@vizij/render` loads and exports faces without a renderer, in Node as well as in a browser.

- `exportScene(root, { bundle, animations })` resolves to the GLB bytes as an `ArrayBuffer` and no longer downloads anything. Its `fileName`, `binary`, `onBinary`, `onComplete` and `onError` options are removed, and so is `downloadGlbBuffer`: the caller saves or uploads the bytes.
- `buildSceneGraph(world, animatables, rootId)` builds the three.js graph of a world element for `exportScene`. The exported node translation, rotation and scale, morph weights and material factors are the authored defaults, the same numbers as the `RobotData` beside them.
- World entries no longer carry `refs`. The store keeps each mounted three.js object in `refs`, by element id and then namespace, and `<Vizij>` renders every element under its own `namespace`.
- The loaders take no `namespaces` argument: `loadGLTF(url, aggressiveImport?, rootBounds?)`, and likewise `loadGLTFFromBlob`, `loadGLTFWithBundle` and `loadGLTFFromBlobWithBundle`. A blob is parsed in memory, with nothing fetched.
- `loadGltfFromBlob` is removed; `loadGLTFFromBlob` covers it.
- `lodash` is no longer a dependency.

`@vizij/runtime-react` loads faces through the new loader signatures.
