# @vizij/runtime-react

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
