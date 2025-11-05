# @vizij/animation-react

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
