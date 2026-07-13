# @vizij/orchestrator-react

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

## 0.0.7

### Patch Changes

- ed31344: Updated to latest vizij-rs dependencies

## 0.0.6

### Patch Changes

- 3c8e659: Align React wrappers with the latest wasm releases and adjust tests to load the browser-safe wasm bytes directly so CI runs without fetch failures.

## 0.0.5

### Patch Changes

- Adopt the browser-safe wasm bundles published from vizij-rs and fix the orchestrator StrictMode readiness guard so React 18 apps initialise without pending state.

## 0.0.4

### Patch Changes

- Fixed StrictMode mount tracking so React 18 dev builds (Next.js) no longer leave the provider stuck in “initializing”; README now calls out bundler requirements.

## 0.0.2

### Patch Changes

- Update import and export process to save and consistently handle names

## 0.0.1

### Patch Changes

- Add changlog in preparation for publishing packages

Changelogs are managed via [Changesets](../../../.changeset/README.md). Run `pnpm changeset` to record updates before tagging a release.
