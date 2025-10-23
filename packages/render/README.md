# @vizij/render

> Three.js + React renderer, scene store, and helper controllers for Vizij faces.

This package exposes the `Vizij` canvas component along with hooks, stores, and GLTF helpers that power Vizij’s real-time character visualisation. It is the foundation that other packages (`@vizij/rig`, `@vizij/orchestrator-react`, etc.) build upon.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Store & Hooks](#store--hooks)
5. [Controllers & Helpers](#controllers--helpers)
6. [Development & Testing](#development--testing)
7. [Publishing](#publishing)
8. [Related Packages](#related-packages)

---

## Overview

- `Vizij` renders a fully managed `@react-three/fiber` canvas with sensible defaults for orthographic cameras and safe-area overlays.
- A Zustand-powered store (`useVizijStore`) tracks renderables, controllers, and transient state. Hooks let you read or mutate slices without re-rendering entire scenes.
- Utilities (`loadGLTF`, `loadGLTFBlob`, export helpers) streamline loading rigged GLTF assets and exporting scene snapshots.
- Controllers wrap common behaviours (e.g., pointer interaction, safe-area visualisation) so you can compose features quickly.

---

## Installation

```bash
# pnpm
pnpm add @vizij/render three @react-three/fiber @react-three/drei zustand @vizij/utils

# npm
npm install @vizij/render three @react-three/fiber @react-three/drei zustand @vizij/utils

# yarn
yarn add @vizij/render three @react-three/fiber @react-three/drei zustand @vizij/utils
```

Peer requirements:

- `react >= 18`
- `three >= 0.170`
- `@react-three/fiber >= 8`
- `@react-three/drei >= 9`
- `zustand >= 5`
- Optional UI integrations: `tailwindcss >= 4.1` (declared as a peer for theme utilities)

Ensure these versions align with the rest of your app to avoid duplicate React or Three.js instances.

---

## Usage

```tsx
import { Vizij, useVizijStore } from "@vizij/render";
import { useEffect } from "react";

export function VizijCanvas() {
  const setDebug = useVizijStore((state) => state.setDebugState);

  useEffect(() => {
    setDebug((debug) => ({ ...debug, showGrid: true }));
  }, [setDebug]);

  return (
    <Vizij
      rootId="default/root"
      namespace="default"
      showSafeArea
      style={{ width: "100%", height: 480 }}
    />
  );
}
```

Wrap the component tree with `VizijContext.Provider` if you want to supply a custom store; otherwise the `Vizij` component creates one internally.

---

## Store & Hooks

- `useVizijStore(selector?)` – Access or mutate the renderer store with automatic subscription management.
- `useVizijStoreGetter`, `useVizijStoreSetter`, `useVizijStoreSubscription` – Fine-grained accessors when you need optimised reads/writes.
- `useFeatures()` – Inspect feature flags registered in the store.
- Store types (`VizijData`, `VizijActions`) are exported from `store-types` for strongly typed selectors.

The store tracks world graph entries, controllers, debug overlays, and renderable metadata. See `src/store.ts` for the full surface.

---

## Controllers & Helpers

- Controllers under `src/controllers` encapsulate input handling, camera logic, and other behaviours. Compose them with your own React components.
- `loadGLTF` / `loadGLTFBlob` simplify loading rig assets and extract animatable metadata used by `@vizij/rig`.
- `export` helpers produce snapshots of the current scene (useful for tooling or exporting frames).

All exports are re-exported through `src/index.tsx`, so a simple `import { loadGLTF } from "@vizij/render"` works.

---

## Development & Testing

```bash
pnpm --filter "@vizij/render" build
pnpm --filter "@vizij/render" test
pnpm --filter "@vizij/render" typecheck
pnpm --filter "@vizij/render" lint
```

`tsup` produces both ESM and CJS bundles with type declarations. Tests run via Vitest (currently smoke-level). Consider adding `size-limit` assertions for significant changes to keep bundle size predictable.

---

## Publishing

Use the shared workflow at [`.github/workflows/publish-npm.yml`](../../.github/workflows/publish-npm.yml).

1. Align dependency versions (`three`, `@react-three/*`, `zustand`, Vizij packages) and bump `package.json`.
2. Validate locally:
   ```bash
   pnpm install
   pnpm --filter "@vizij/render" build
   pnpm --filter "@vizij/render" test
   pnpm --filter "@vizij/render" typecheck
   pnpm --filter "@vizij/render" lint
   pnpm --filter "@vizij/render" exec npm pack --dry-run
   ```
3. Tag the release as `npm-render-vX.Y.Z` and push the tag. The workflow will publish with provenance metadata.

---

## Related Packages

- [`@vizij/rig`](../@vizij/rig/README.md) – Hooks that consume the renderer to load rigged models.
- [`@vizij/config`](../@vizij/config/README.md) – Rig definitions and channel archetypes used by controllers.
- [`@vizij/animation-react`](../@vizij/animation-react/README.md) – React bindings that feed animation values back into the renderer.

Questions or contributions? Open an issue so we can keep the renderer API and docs sharp for the whole Vizij ecosystem. 🎨
