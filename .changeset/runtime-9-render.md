---
"@vizij/render": patch
---

The `@vizij/runtime` peer range is `^8.0.0 || ^9.0.0`. The package uses the runtime's page functions and types, which runtime 9 keeps as they are; 9's breaking change concerns only WebAssembly guest modules, which the package does not load. It is built and tested against `@vizij/runtime` 9.0.2.
