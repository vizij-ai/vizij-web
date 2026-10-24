# vizij-authoring

## 0.3.1

### Patch Changes

- fc1cdff: The authoring app no longer depends on `three`. Its baked animations are built by `@vizij/render`'s `createExportAnimation`, and its scene editing and bake compute transforms with their own euler, quaternion and matrix functions, in the ZYX order the Bevy view composes, with the same results.
- Updated dependencies [452ad89]
- Updated dependencies [452ad89]
  - @vizij/render@3.0.0
  - @vizij/runtime-react@1.0.1

## 0.3.0

### Minor Changes

- 8fe6672: Authoring shows its faces on the Bevy view, over `@vizij/render` 2 and `@vizij/runtime-react` 1 on `@vizij/runtime` 8: the main face, the reference face and the empty-state demo each load as a Vizij.
  - The timeline plays its animation on the face's animation module, Arora's, as the timeline draws it: each keyframe's tangents reach the module, which plays a `cubic` segment as glTF's `CUBICSPLINE` Hermite on them, on the chord slope where one is absent.
  - The motion-graph editor runs its graph as a run beside the face's own, and applies each edit to that run in place, so the nodes an edit keeps keep their state.
  - Export writes the scene built headless from the document. The bake steps the face's own composition and stages each track on the key the face plays it on.

### Patch Changes

- Updated dependencies [8eb2bfd]
- Updated dependencies [904af72]
  - @vizij/render@2.0.0
  - @vizij/runtime-react@1.0.0

## 0.2.2

### Patch Changes

- Updated dependencies [c6db7b4]
  - @vizij/node-graph-authoring@0.2.3
  - @vizij/node-graph-react@0.2.3
  - @vizij/render@1.0.1
  - @vizij/runtime-react@0.4.2
  - @vizij/utils@0.2.1

## 0.2.1

### Patch Changes

- Updated dependencies [adf2502]
- Updated dependencies [8360291]
- Updated dependencies [9dd663f]
  - @vizij/runtime-react@0.4.1
  - @vizij/node-graph-react@0.2.2
  - @vizij/node-graph-authoring@0.2.2
  - @vizij/render@1.0.0

## 0.2.0

### Minor Changes

- 556b721: Bake authored animation clips into the exported GLB.

  Authored clips drive abstract rig inputs and pose weights, not node channels,
  so baking evaluates the exported graph over time and records what it writes —
  a one-track clip on `lids_blink` can become dozens of node channels. Sampled
  at 30fps, decimated with Ramer-Douglas-Peucker, recombined into glTF vector
  and morph tracks, and validated against the export root before `GLTFExporter`
  gets a chance to discard a whole clip over one bad binding.

  Baking is on by default and covers every authored clip. The graphs it samples
  through are read out of the bundle being exported, so the baked motion comes
  from the same graph the bundle ships.

  Material channels still have no glTF equivalent and are reported by name in
  the export preflight rather than dropped silently.

  `@vizij/runtime-react` now exports `composeGraphSpecs`, so a host can compose
  the way the provider does instead of maintaining a second implementation that
  is free to drift from the one that plays.

### Patch Changes

- Updated dependencies [64bbc65]
- Updated dependencies [556b721]
  - @vizij/runtime-react@0.4.0
