# @vizij/config

> Canonical rig, channel, and viseme definitions shared across Vizij packages.

This package aggregates the strongly typed configuration used by the renderer, rig helpers, and React bindings. It exports reusable definitions for channel archetypes, pose libraries, rig bounds, TTS viseme mappings, and helper types so downstream packages stay in sync.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Available Modules](#available-modules)
5. [Development & Testing](#development--testing)
6. [Publishing](#publishing)
7. [Related Packages](#related-packages)

---

## Overview

- Provides `ChannelArchetype`, `TrackSet`, and `LowLevelRigDefinition` types for describing face rigs.
- Ships ready-made rig definitions such as `HugoLowLevelRig` and `QuoriLowLevelRig`.
- Includes expression and pose helpers for seeding demo apps and editor tooling.
- Supplies TTS/viseme lookup tables that match the orchestrator and animation runtimes.

---

## Installation

```bash
# pnpm
pnpm add @vizij/config

# npm
npm install @vizij/config

# yarn
yarn add @vizij/config
```

`@vizij/config` depends on `@vizij/utils`. The dependency is bundled automatically when you install this package.

---

## Usage

```ts
import {
  Archetype,
  HugoLowLevelRig,
  type LowLevelRigDefinition,
} from "@vizij/config";

function buildRigDefinition(): LowLevelRigDefinition {
  const mouthTracks = Archetype.MOUTH.tracks;

  return {
    ...HugoLowLevelRig,
    channels: {
      ...HugoLowLevelRig.channels,
      mouth: {
        ...HugoLowLevelRig.channels.mouth,
        tracks: {
          ...HugoLowLevelRig.channels.mouth?.tracks,
          morph: { key: "2" },
        },
      },
      custom_indicator: {
        shapeKey: "Indicator",
        tracks: { pos: { axis: ["x", "y"] } },
      },
    },
  };
}
```

The exported types keep renderer, rig helpers, and orchestrator bindings aligned on the same configuration schema.

---

## Available Modules

- `channel` – Channel archetypes and helpers for building `TrackSet` collections.
- `expression` / `pose` – Shared pose libraries useful for editor previews.
- `low_rig` – Core typing for `LowLevelRigDefinition` and related structures.
- `rigs` – Bundled rig definitions (`HugoLowLevelRig`, `QuoriLowLevelRig`, etc.).
- `track` – Track metadata shared across archetypes.
- `tts` / `viseme` – Text-to-speech viseme mappings and phoneme helpers.
- `models` – Lightweight metadata about demo models and asset lookup keys.

Each module re-exports through `src/index.ts`, so `import { ... } from "@vizij/config"` covers the majority of use cases.

---

## Development & Testing

```bash
pnpm --filter "@vizij/config" build
pnpm --filter "@vizij/config" typecheck
pnpm --filter "@vizij/config" test
```

This package uses `tsc` for builds. `vitest` is configured for fast structural tests; add additional coverage alongside new helpers or data sets.

---

## Publishing

Publishing is automated via [`.github/workflows/publish-npm.yml`](../../../.github/workflows/publish-npm.yml).

1. Update `package.json` with the new version and document schema changes.
2. Validate locally:
   ```bash
   pnpm install
   pnpm --filter "@vizij/config" build
   pnpm --filter "@vizij/config" typecheck
   pnpm --filter "@vizij/config" test
   pnpm --filter "@vizij/config" exec npm pack --dry-run
   ```
3. Push a tag that matches `npm-config-vX.Y.Z`:
   ```bash
   git tag npm-config-v0.2.0
   git push origin npm-config-v0.2.0
   ```

The workflow will build, test, and publish to npm with provenance metadata.

---

## Related Packages

- [`@vizij/utils`](../../utils/README.md) – Shared math/value helpers used across configuration modules.
- [`@vizij/rig`](../@vizij/rig/README.md) – Rig helpers that consume these definitions when driving the renderer.
- [`@vizij/render`](../../render/README.md) – Three.js renderer that reads rig metadata.

Have improvements to rig schemas or pose libraries? Submit a PR with updated documentation and tests to keep the config layer dependable. 🎯
