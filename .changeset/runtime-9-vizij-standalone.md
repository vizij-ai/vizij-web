---
"vizij-standalone": patch
---

The page runs on `@vizij/runtime` 9.0.2. A call into the runtime's wasm module runs only that call's code, and `invoke` and `writeValues` cost linearly in the size of the values they carry.
