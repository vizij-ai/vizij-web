---
"@vizij/node-graph-react": minor
"@vizij/node-graph-authoring": minor
---

Requires `@vizij/node-graph` 0.13, whose graphs run on arora-behavior-tree. The JS API is unchanged. A node computes again only when its inputs, its parameters or the clock it reads change, and `evalAll` still reports every node's ports. Since 0.9, `@vizij/node-graph` also brought the `spawn` node, a stable evaluation order where two outputs write one path, cheaper constants and selectors, and steps with no time in them that move nothing time drives.
