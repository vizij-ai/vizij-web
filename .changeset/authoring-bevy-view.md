---
"vizij-authoring": minor
---

Authoring shows its faces on the Bevy view, over `@vizij/render` 2 and `@vizij/runtime-react` 1 on `@vizij/runtime` 8: the main face, the reference face and the empty-state demo each load as a Vizij.

- The timeline plays its animation on the face's animation module, Arora's, as the timeline draws it: each keyframe's tangents reach the module, which plays a `cubic` segment as glTF's `CUBICSPLINE` Hermite on them, on the chord slope where one is absent.
- The motion-graph editor runs its graph as a run beside the face's own, and applies each edit to that run in place, so the nodes an edit keeps keep their state.
- Export writes the scene built headless from the document. The bake steps the face's own composition and stages each track on the key the face plays it on.
