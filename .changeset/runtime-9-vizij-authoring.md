---
"vizij-authoring": patch
---

The app runs on `@vizij/runtime` 9.0.2. A call into the runtime's wasm module runs only that call's code, and `invoke`, `setValue` and `moduleAnimation` cost linearly in the size of the values they carry, so loading a long animation into the animation module, to play it or to sample it for a preview, a pose or a bake, costs linearly in its length.
