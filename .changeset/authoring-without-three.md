---
"vizij-authoring": patch
---

The authoring app no longer depends on `three`. Its baked animations are built by `@vizij/render`'s `createExportAnimation`, and its scene editing and bake compute transforms with their own euler, quaternion and matrix functions, in the ZYX order the Bevy view composes, with the same results.
