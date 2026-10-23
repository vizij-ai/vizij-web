---
"vizij-authoring": patch
---

The face plays the timeline's animation as the timeline draws it. Authoring runs on `@vizij/runtime` 8, whose animations play through Arora's animation module, and each keyframe's tangents reach the module: a `cubic` segment plays as glTF's `CUBICSPLINE` Hermite on its keyframes' tangents, on the chord slope where one is absent, where the face played it with an ease of its own.
