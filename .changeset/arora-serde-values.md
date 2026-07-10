---
"@vizij/animation-react": minor
"@vizij/node-graph-react": minor
"@vizij/orchestrator-react": minor
"@vizij/node-graph-authoring": minor
"@vizij/runtime-react": minor
---

Move to the value-unification wasm line: @vizij/animation-wasm 0.4,
@vizij/node-graph-wasm 0.7, @vizij/orchestrator-wasm 0.4, @vizij/value-json
0.2. The engines emit values in arora serde; every read path decodes through
the @vizij/value-json accessors (which also accept the legacy forms), and
values sent into the engines may stay legacy. Code that pattern-matched raw
value JSON shapes must switch to the accessors.
