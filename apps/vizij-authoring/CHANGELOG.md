# vizij-authoring

## 0.4.2

### Patch Changes

- 8ef2bc1: Runs on @semio/ui 0.4: cards separate from their surroundings by elevation, with no drawn edge, and the semio controls take that release's design. Leaving the page with unsaved changes still asks for confirmation, through `preventDefault()` alone.
- Updated dependencies [8ef2bc1]
- Updated dependencies [8ef2bc1]
- Updated dependencies [8ef2bc1]
- Updated dependencies [8ef2bc1]
  - @vizij/node-graph-authoring@0.3.1
  - @vizij/node-graph-react@0.3.1
  - @vizij/render@3.1.1
  - @vizij/utils@0.2.2
  - @vizij/runtime-react@1.0.3

## 0.4.1

### Patch Changes

- Updated dependencies [8bbc547]
  - @vizij/node-graph-react@0.3.0
  - @vizij/node-graph-authoring@0.3.0

## 0.4.0

### Minor Changes

- d3e2718: The export dialog edits the face's hardware and software versions, and the export writes them into the bundle's metadata as `hardwareVersion` and `softwareVersion`, trimmed, leaving a blank one out. Loading a face reads them back from its bundle, and changing one marks the face unsaved. A Vizij device reports them to Semio Studio as its model, the face ID standing in for a hardware version the face does not state.

### Patch Changes

- Updated dependencies [d3e2718]
  - @vizij/render@3.1.0

## 0.3.3

### Patch Changes

- d31d15e: The app runs on `@vizij/runtime` 9.0.2. A call into the runtime's wasm module runs only that call's code, and `invoke`, `setValue` and `moduleAnimation` cost linearly in the size of the values they carry, so loading a long animation into the animation module, to play it or to sample it for a preview, a pose or a bake, costs linearly in its length.
- Updated dependencies [d31d15e]
- Updated dependencies [d31d15e]
  - @vizij/render@3.0.1
  - @vizij/runtime-react@1.0.2

## 0.3.2

### Patch Changes

- 12f3a75: The timeline's scrub preview, inserting a key on a curve, saving a frame as a pose and the GLB bake read an animation's values from Arora's animation module, the engine the face plays it with, where they evaluated the curves in JavaScript. A player of the animation on a device of its own is stepped across the times asked for and its outputs collected; nothing writes them to the face's inputs. The shipped faces' animations bake and preview to the same values, within a float32 rounding. At a keyframe that ends a `step` segment, the preview, a pose and the bake read that keyframe's value, as the face plays it, where they read the held value; of two keyframes at time zero they read the second. A keyframe whose time or value is not a finite number fails the sampling, naming its track, and the Save Frame dialog says that it could not sample.

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
