---
"@vizij/runtime-react": patch
---

The `@vizij/runtime` peer range is `^8.0.0 || ^9.0.0`. The provider and hooks use `loadVizij`, `unloadVizij` and the `Runtime` they return, which runtime 9 keeps as they are; 9's breaking change concerns only WebAssembly guest modules, which the provider does not pass. It is built and tested against `@vizij/runtime` 9.0.2.
