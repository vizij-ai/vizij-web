# @vizij/rig

> React hooks that load rigged GLTF models and wire them into the Vizij renderer.

`@vizij/rig` bridges the configuration from `@vizij/config` with runtime helpers from `@vizij/render`. It exposes hooks that import GLB assets, seed initial values, and produce rig controllers ready for animation and orchestration.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Usage](#usage)
4. [API Surface](#api-surface)
5. [Development & Testing](#development--testing)
6. [Publishing](#publishing)
7. [Related Packages](#related-packages)

---

## Overview

- `useModelLoader` loads a GLTF file, registers it with the Vizij renderer, and returns ids for morph/scale animatables.
- `useRiggedModelLoader` produces a `VizijLowRig` instance backed by a `LowLevelRigDefinition`, giving you a typed interface for manipulating channels.
- Automatically applies `initialValues` from rig definitions so demos start with the right colours, positions, and morphs.
- Guards against duplicate loads and logs helpful debug output in development builds.

---

## Installation

```bash
# pnpm
pnpm add @vizij/rig

# npm
npm install @vizij/rig

# yarn
yarn add @vizij/rig
```

This package expects `react >= 18`, `@vizij/render`, `@vizij/config`, and `@vizij/utils` in your project. They are declared as dependencies or peer dependencies in `package.json`; keep versions aligned to avoid duplicate React copies.

---

## Usage

```tsx
import { useEffect } from "react";
import { Vizij, useVizijStore } from "@vizij/render";
import { HugoLowLevelRig } from "@vizij/config";
import { useRiggedModelLoader } from "@vizij/rig";

const GLB_URL = new URL("../../assets/hugo.glb", import.meta.url).toString();

export function RiggedViewer() {
  const { rig, isLoaded } = useRiggedModelLoader(GLB_URL, HugoLowLevelRig);
  const setValue = useVizijStore((state) => state.setValue);

  useEffect(() => {
    if (!rig || !isLoaded) {
      return;
    }
    // Lift mouth
    rig.apply("mouth", { morph: { float: 0.8 } });
    setValue(rig.scaleId, "default", { float: 1.2 });
  }, [rig, isLoaded, setValue]);

  return <Vizij rootId={rig?.rootId ?? ""} namespace="default" showSafeArea />;
}
```

Use `useModelLoader` when you need lower-level access to raw animatable ids or want to handle mapping manually.

---

## API Surface

### `useModelLoader(glb, bounds, initialValues, rigDef)`

Returns `{ rigMapping, isLoading, isLoaded }`, where `rigMapping` contains `rootId`, `scaleId`, `morphId`, and the loaded animatables map. Pass `bounds` and `initialValues` from your rig definition to position the renderer and seed colours or morphs.

### `useRiggedModelLoader(glb, rigDef)`

Resolves to `{ rig, isLoading, isLoaded }`. `rig` is an instance of `VizijLowRig` that exposes high-level helpers such as `apply(channel, values)` and `animatables`. The hook deduplicates loads and keeps track of already-processed assets.

Both hooks rely on `@vizij/render`’s internal store. Ensure you wrap your scene with a `VizijContext.Provider` or use the default provider exposed by `Vizij`.

---

## Development & Testing

```bash
pnpm --filter "@vizij/rig" build
pnpm --filter "@vizij/rig" typecheck
pnpm --filter "@vizij/rig" test
```

The package uses `tsc` for builds and Vitest for smoke tests. When adding new hooks or behaviours, update the demo apps under `apps/` so changes can be exercised visually.

---

## Publishing

Releases run through [`.github/workflows/publish-npm.yml`](../../../.github/workflows/publish-npm.yml).

1. Synchronise dependency versions (`@vizij/render`, `@vizij/config`, `@vizij/utils`) and bump this package’s `version`.
2. Validate:
   ```bash
   pnpm install
   pnpm --filter "@vizij/rig" build
   pnpm --filter "@vizij/rig" typecheck
   pnpm --filter "@vizij/rig" test
   pnpm --filter "@vizij/rig" exec npm pack --dry-run
   ```
3. Push `npm-rig-vX.Y.Z` (for example, `npm-rig-v0.2.0`). The workflow will publish the package with provenance metadata.

---

## Related Packages

- [`@vizij/config`](../@vizij/config/README.md) – Source of rig definitions leveraged by the hooks.
- [`@vizij/render`](../../render/README.md) – Renderer and store consumed by the rig loader.
- [`@vizij/animation-react`](../@vizij/animation-react/README.md) – Pair this with rigs when driving characters from animation clips.

Questions or ideas for richer rig helpers? Open an issue so we can document and automate it for everyone. 🤖
