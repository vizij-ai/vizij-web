# @vizij/animation-react

## 0.1.0

### Minor Changes

- a53152b: React 19 support and dependency refresh
  - React 19 compatibility across Vizij React packages.
  - Update wasm wrapper dependencies to the latest published `@vizij/*-wasm` versions.
  - CI/release workflow updates (Node 24; npm publish via OIDC).

## 0.0.8

### Patch Changes

- ed31344: Updated to latest vizij-rs dependencies

## 0.0.7

### Patch Changes

- 3c8e659: Align React wrappers with the latest wasm releases and adjust tests to load the browser-safe wasm bytes directly so CI runs without fetch failures.

## 0.0.6

### Patch Changes

- Adopt the browser-safe wasm bundles published from vizij-rs and fix the orchestrator StrictMode readiness guard so React 18 apps initialise without pending state.

## 0.0.5

### Patch Changes

- Fixed StrictMode mount tracking so React 18 dev builds (Next.js) no longer leave the provider stuck in “initializing”; README now calls out bundler requirements.

## 0.0.3

### Patch Changes

- Align published dependencies for npm consumption and expose Vitest config helpers for the animation package to fix JSDOM test runs.

## 0.0.2

### Patch Changes

- Update import and export process to save and consistently handle names

## 0.0.1

### Patch Changes

- Add changlog in preparation for publishing packages

This package uses [Changesets](../../../.changeset/README.md) for release notes. Run `pnpm changeset` after modifying the public API, then follow the publishing checklist in the README.
