# @vizij/runtime-react

## 0.2.0

### Minor Changes

- c70b674: Move to the value-unification wasm line: @vizij/animation-wasm 0.4,
  @vizij/node-graph-wasm 0.7, @vizij/orchestrator-wasm 0.4, @vizij/value-json
  0.2. The engines emit values in arora serde; every read path decodes through
  the @vizij/value-json accessors (which also accept the legacy forms), and
  values sent into the engines may stay legacy. Code that pattern-matched raw
  value JSON shapes must switch to the accessors.
- 2ffda39: Add transport controls for bundled procedural programs discovered from exported `motiongraph` bundle entries. The runtime now exposes program discovery plus `playProgram`, `pauseProgram`, `stopProgram`, and `getProgramState`, and standalone/browser consumers can surface bundled animations and procedural programs from the loaded asset.

### Patch Changes

- Updated dependencies [c70b674]
- Updated dependencies [22c1a61]
- Updated dependencies [6e7a15e]
  - @vizij/orchestrator-react@0.2.0
  - @vizij/node-graph-authoring@0.2.0
  - @vizij/render@0.1.1

## 0.1.0

### Minor Changes

- a53152b: React 19 support and dependency refresh
  - React 19 compatibility across Vizij React packages.
  - Update wasm wrapper dependencies to the latest published `@vizij/*-wasm` versions.
  - CI/release workflow updates (Node 24; npm publish via OIDC).

### Patch Changes

- Updated dependencies [a53152b]
  - @vizij/node-graph-authoring@0.1.0
  - @vizij/orchestrator-react@0.1.0
  - @vizij/render@0.1.0
  - @vizij/utils@0.1.0

## 0.0.14

### Patch Changes

- ed31344: Updated to latest vizij-rs dependencies
- Updated dependencies [ed31344]
  - @vizij/orchestrator-react@0.0.7
  - @vizij/render@0.0.7
  - @vizij/utils@0.0.3

## 0.0.13

### Patch Changes

- Updated dependencies
  - @vizij/render@0.0.6

## 0.0.12

### Patch Changes

- Updated dependencies [a9b5118]
  - @vizij/render@0.0.5

## 0.0.11

### Patch Changes

- Hard code render and utils

## 0.0.10

### Patch Changes

- Bump orchestrator dependency

## 0.0.9

### Patch Changes

- 3c8e659: Align React wrappers with the latest wasm releases and adjust tests to load the browser-safe wasm bytes directly so CI runs without fetch failures.
- Updated dependencies [3c8e659]
  - @vizij/orchestrator-react@0.0.6

## 0.0.8

### Patch Changes

- Adopt the browser-safe wasm bundles published from vizij-rs and fix the orchestrator StrictMode readiness guard so React 18 apps initialise without pending state.
- Updated dependencies
  - @vizij/orchestrator-react@0.0.5

## 0.0.7

### Patch Changes

- 3a19af3: Update dependencies

## 0.0.6

### Patch Changes

- Updated dependencies
  - @vizij/orchestrator-react@0.0.4

## 0.0.5

### Patch Changes

- a448d89: Fix asset bundle handling

## 0.0.4

### Patch Changes

- Align published dependencies for npm consumption and expose Vitest config helpers for the animation package to fix JSDOM test runs.
- Updated dependencies
  - @vizij/render@0.0.4

## 0.0.3

### Patch Changes

- Update for single glb import/export
- Updated dependencies
  - @vizij/render@0.0.3

## 0.0.2

### Patch Changes

- Update import and export process to save and consistently handle names
- Updated dependencies
  - @vizij/orchestrator-react@0.0.2
  - @vizij/render@0.0.2
  - @vizij/utils@0.0.2

## 0.0.1

### Patch Changes

- Seed initial changelog while preparing the first runtime preview release.
