# @vizij/utils

> Shared TypeScript utilities and value helpers for the Vizij ecosystem.

This package gathers type definitions, value helpers, and namespacing utilities that keep Vizij packages consistent. Use it to describe animated values, manage namespaced ids, and share primitive types between the renderer, rigging, and React bindings.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Usage](#usage)
4. [API Highlights](#api-highlights)
5. [Development & Testing](#development--testing)
6. [Publishing](#publishing)
7. [Related Packages](#related-packages)

---

## Overview

- Strongly typed representations of animated values (`AnimatableNumber`, `AnimatableColor`, etc.).
- Helpers for composing namespaced lookup keys (`getLookup`, `getNamespace`, `getId`).
- Shared types referenced throughout Vizij packages, ensuring every layer agrees on value shapes.

---

## Installation

```bash
# pnpm
pnpm add @vizij/utils

# npm
npm install @vizij/utils

# yarn
yarn add @vizij/utils
```

No peer dependencies are required. The package exports plain TypeScript utilities.

---

## Usage

```ts
import { AnimatableNumber, getLookup, getNamespace } from "@vizij/utils";

const jawOpen: AnimatableNumber = {
  id: "jaw/open",
  type: "number",
  default: 0,
  constraints: { min: 0, max: 1 },
};

const lookup = getLookup("actorA", jawOpen.id); // "actorA.jaw/open"
const namespace = getNamespace(lookup); // "actorA"
```

Use these primitives when defining rig channels, orchestrator inputs, or animation metadata so everything aligns with the same schema.

---

## API Highlights

- `animated-values` – Full suite of `Animatable*` interfaces plus shared `RawValue` types and publishing metadata.
- `namespace` – `getLookup`, `getNamespace`, `getId` utilities for composing/storing namespaced ids.

The package re-exports everything from `src/index.ts`, so importing from `"@vizij/utils"` is sufficient.

---

## Development & Testing

```bash
pnpm --filter "@vizij/utils" build
pnpm --filter "@vizij/utils" test
pnpm --filter "@vizij/utils" typecheck
```

`tsup` bundles both ESM and CJS outputs and emits `.d.ts`. Vitest currently includes smoke tests; add coverage close to new helpers.

---

## Publishing

Releases flow through [`.github/workflows/publish-npm.yml`](../../.github/workflows/publish-npm.yml).

1. Record a changeset and apply the version bump:
   ```bash
   pnpm changeset
   pnpm version:packages
   ```
2. Validate locally:
   ```bash
   pnpm install
   pnpm --filter "@vizij/utils" build
   pnpm --filter "@vizij/utils" test
   pnpm --filter "@vizij/utils" typecheck
   pnpm --filter "@vizij/utils" exec npm pack --dry-run
   ```
3. Push a tag with the `npm-utils-vX.Y.Z` pattern (for example, `npm-utils-v0.3.0`). The workflow publishes and records provenance automatically.

---

## Related Packages

- [`@vizij/animation-react`](../@vizij/animation-react/README.md) – Re-exports value helpers for React consumers.
- [`@vizij/render`](../render/README.md) – Uses the namespace helpers to manage store ids.

Have ideas for additional shared helpers? Open a PR and document the changes here to keep the ecosystem aligned. 🧰
