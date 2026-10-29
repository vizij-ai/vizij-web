# @vizij/node-graph-authoring

## 0.3.0

### Minor Changes

- 8bbc547: Requires `@vizij/node-graph` 0.13, whose graphs run on arora-behavior-tree. The JS API is unchanged. A node computes again only when its inputs, its parameters or the clock it reads change, and `evalAll` still reports every node's ports. Since 0.9, `@vizij/node-graph` also brought the `spawn` node, a stable evaluation order where two outputs write one path, cheaper constants and selectors, and steps with no time in them that move nothing time drives.

## 0.2.3

### Patch Changes

- c6db7b4: Licensed under Apache-2.0, where the package said MIT or declared no licence. Releases already published keep the licence they were published under.
- Updated dependencies [c6db7b4]
  - @vizij/utils@0.2.1

## 0.2.2

### Patch Changes

- 8360291: Depend on `@vizij/node-graph` 0.9. Its TypeScript API is the same as 0.7's; the runtime gains the `taskrun` node, and the arithmetic nodes take integer values as scalars.

## 0.2.1

### Patch Changes

- b48bd8c: Track the `@vizij/node-graph-wasm` → `@vizij/node-graph` dependency rename (same
  package, bare-domain npm name; no API change).
- Updated dependencies [1eaa5bf]
  - @vizij/utils@0.2.0

## 0.2.0

### Minor Changes

- c70b674: Move to the value-unification wasm line: @vizij/animation-wasm 0.4,
  @vizij/node-graph-wasm 0.7, @vizij/orchestrator-wasm 0.4, @vizij/value-json
  0.2. The engines emit values in arora serde; every read path decodes through
  the @vizij/value-json accessors (which also accept the legacy forms), and
  values sent into the engines may stay legacy. Code that pattern-matched raw
  value JSON shapes must switch to the accessors.

### Patch Changes

- 22c1a61: Refresh the React package release line against the latest published `vizij-rs`
  wasm wrappers and validate the current demo/app dependency matrix against those
  versions.

## 0.1.0

### Minor Changes

- a53152b: React 19 support and dependency refresh
  - React 19 compatibility across Vizij React packages.
  - Update wasm wrapper dependencies to the latest published `@vizij/*-wasm` versions.
  - CI/release workflow updates (Node 24; npm publish via OIDC).

### Patch Changes

- Updated dependencies [a53152b]
  - @vizij/utils@0.1.0

## 0.0.5

### Patch Changes

- ed31344: Updated to latest vizij-rs dependencies
- Updated dependencies [ed31344]
  - @vizij/utils@0.0.3

## 0.0.4

### Patch Changes

- 3c8e659: Align React wrappers with the latest wasm releases and adjust tests to load the browser-safe wasm bytes directly so CI runs without fetch failures.

## 0.0.3

### Patch Changes

- Adopt the browser-safe wasm bundles published from vizij-rs and fix the orchestrator StrictMode readiness guard so React 18 apps initialise without pending state.

## 0.0.2

### Patch Changes

- 3a19af3: Update dependencies
