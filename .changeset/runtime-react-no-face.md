---
"@vizij/runtime-react": minor
---

`VizijRuntimeProvider` takes `glb: null` for no face: it takes down the face it showed, if any, and keeps its children mounted, which see no face (`useOptionalVizijRuntime()` is `null`). A page whose face comes and goes — the authoring workspace — keeps its tree, and its state, across loads.
