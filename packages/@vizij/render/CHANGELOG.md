# @vizij/render

## 0.1.1

### Patch Changes

- 6e7a15e: Publish the speech-enabled authoring and standalone package surfaces, including
  the shared speech React hooks package and the renderer bundle typing updates
  that support those flows.

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
- Updated dependencies [ed31344]
  - @vizij/utils@0.0.3

## 0.0.6

### Patch Changes

- Fix workspace dep bug

## 0.0.5

### Patch Changes

- a9b5118: Patch color display in canvas

## 0.0.4

### Patch Changes

- Align published dependencies for npm consumption and expose Vitest config helpers for the animation package to fix JSDOM test runs.

## 0.0.3

### Patch Changes

- Update for single glb import/export

## 0.0.2

### Patch Changes

- Update import and export process to save and consistently handle names
- Updated dependencies
  - @vizij/utils@0.0.2

## 0.0.1

### Patch Changes

- Add changlog in preparation for publishing packages
- Updated dependencies
  - @vizij/utils@0.0.1

Release notes are generated via [Changesets](../../.changeset/README.md). Run `pnpm changeset` after changing the public renderer API or bundle surface.
