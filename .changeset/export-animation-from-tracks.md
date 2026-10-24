---
"@vizij/render": minor
---

`createExportAnimation({ name, duration, tracks, root })` builds an animation for `exportScene({ animations })` from baked tracks given as plain data (`ExportAnimationTrack`: the node's name, a `position`, `quaternion`, `scale` or `morphTargetInfluences` property, key times in seconds and flattened values). Each track is bound against `root` by node name first; one that would not bind — no such node, no such morph target, or a value count other than `times × stride` — is left out and returned in `issues`, since `GLTFExporter` would otherwise drop the whole animation or throw. `animation` is `null` when no track binds. A caller no longer needs `three` to export baked animations.
