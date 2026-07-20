---
"@vizij/face-core": minor
"@vizij/render": patch
"@vizij/runtime-react": patch
---

The Face Package schema (`VizijBundleExtension` and friends — the
`VIZIJ_bundle` GLB payload types) moves from `@vizij/render` into
`@vizij/face-core`, which now owns the Face Package vocabulary (L1). Render
re-exports every previous name, so its public API is unchanged; runtime-react
imports the schema from face-core, making its framework-free core render-free.
