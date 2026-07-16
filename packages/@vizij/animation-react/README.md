# @vizij/animation-react

> **React provider and hooks for Vizij’s animation WASM runtime.**

This package wraps `@vizij/animation-wasm` with React-friendly primitives so applications can load animations, manage players/instances, stream outputs, and bake results using idiomatic hooks.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Peer Dependencies](#peer-dependencies)
4. [Quick Start](#quick-start)
5. [Provider & Context](#provider--context)
6. [Hooks](#hooks)
7. [Helpers](#helpers)
8. [Development & Testing](#development--testing)
9. [Publishing](#publishing)
10. [Related Packages](#related-packages)

---

## Overview

- Initialises `@vizij/animation-wasm` automatically and manages the wasm engine lifecycle.
- Loads one or more `StoredAnimation` clips, creates players/instances, and keeps them in sync with React state.
- Provides fine-grained subscriptions (`useAnimTarget`) backed by `useSyncExternalStore`.
- Supports manual or automatic playback (`autostart` with RAF or manual stepping via `step`).
- Exposes helpers for value coercion (`valueAsNumber`, `valueAsTransform`, etc.).

---

## Installation

```bash
# pnpm
pnpm add @vizij/animation-react @vizij/animation-wasm react react-dom

# npm
npm install @vizij/animation-react @vizij/animation-wasm react react-dom

# yarn
yarn add @vizij/animation-react @vizij/animation-wasm react react-dom
```

During local development with linked WASM packages, ensure your bundler preserves symlinks and excludes `@vizij/animation-wasm` from pre-bundling (see the [`vizij-web` README](../../../README.md#local-wasm-development) for a Vite example).

> **Bundler note:** `@vizij/animation-react` depends on `@vizij/animation-wasm`, which emits a `.wasm` artefact. Enable async WebAssembly and treat `.wasm` files as emitted assets in your bundler. For Next.js:
>
> ```js
> // next.config.js
> module.exports = {
>   webpack: (config) => {
>     config.experiments = {
>       ...(config.experiments ?? {}),
>       asyncWebAssembly: true,
>     };
>     config.module.rules.push({
>       test: /\.wasm$/,
>       type: "asset/resource",
>     });
>     return config;
>   },
> };
> ```
>
> When overriding the wasm location, call `init("https://.../vizij_animation_wasm_bg.wasm")` with a string URL so Webpack does not wrap it in `RelativeURL`.

---

## Peer Dependencies

- `react >= 18`
- `react-dom >= 18`
- `@vizij/animation-wasm` (keep the version in sync with the `vizij-rs` publish)

When working from source, update these ranges before cutting a release so downstream apps do not end up with duplicate React copies or mismatched WASM ABIs.

---

## Quick Start

```tsx
import {
  AnimationProvider,
  useAnimTarget,
  valueAsNumber,
} from "@vizij/animation-react";

const storedAnimation = {
  name: "Scalar Ramp",
  duration: 2000,
  tracks: [
    {
      id: "scalar",
      animatableId: "demo/scalar",
      points: [
        { id: "k0", stamp: 0.0, value: 0 },
        { id: "k1", stamp: 1.0, value: 1 },
      ],
    },
  ],
  groups: {},
};

function Panel() {
  const value = useAnimTarget("demo/scalar");
  const num = valueAsNumber(value);
  return <div>Value: {num?.toFixed(3) ?? "…"}</div>;
}

export function App() {
  return (
    <AnimationProvider
      animations={storedAnimation}
      prebind={(path) => path} // canonical path -> subscription key
      autostart
      updateHz={60}
    >
      <Panel />
    </AnimationProvider>
  );
}
```

---

## Provider & Context

```tsx
import { AnimationProvider, useAnimation } from "@vizij/animation-react";
```

`AnimationProvider` props:

| Prop         | Type                                                                   | Description                                                                              |
| ------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `animations` | `StoredAnimation / StoredAnimation[]`                                  | Clips to load on mount (reloaded when identity changes).                                 |
| `instances`  | `InstanceSpec[]` _(optional)_                                          | Preconfigured instances; defaults to a single player/instance using the first animation. |
| `prebind`    | `(path: string) => string \| number \| null \| undefined` _(optional)_ | Resolver from canonical target paths to subscription keys.                               |
| `autostart`  | `boolean` _(default: `true`)_                                          | When true, starts a `requestAnimationFrame` loop. If false, call `step(dt)` manually.    |
| `updateHz`   | `number` _(optional)_                                                  | Throttle subscriber notifications while the simulation still runs every frame.           |

`useAnimation()` returns the provider context:

```ts
type AnimationContext = {
  ready: boolean;
  subscribeToKey(key: string, cb: () => void): () => void;
  getKeySnapshot(key: string): ValueJSON | undefined;
  step(dtSeconds: number, inputs?: Inputs): void;
  reload(
    animations: StoredAnimation | StoredAnimation[],
    instances?: InstanceSpec[],
  ): void;
  players: Record<string, number>; // player name -> PlayerId
};
```

Use `step` when `autostart` is disabled (e.g., timeline scrubbing tools).

---

## Hooks

| Hook                          | Description                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `useAnimation()`              | Access the provider context (throws if used outside `AnimationProvider`).          |
| `useAnimTarget(key?: string)` | Subscribe to a resolved target key; returns the latest `ValueJSON` or `undefined`. |

`useAnimTarget` is built on `useSyncExternalStore`, so components re-render only when the requested key changes.

---

## Helpers

The package re-exports value coercion helpers from `@vizij/value-json`:

```ts
import {
  valueAsNumber,
  valueAsNumericArray,
  valueAsTransform,
  valueAsQuat,
  valueAsVec3,
  valueAsColorRgba,
  valueAsBool,
  valueAsText,
} from "@vizij/animation-react";
```

Use them to format engine values for UI or to feed other subsystems.

---

## Development & Testing

```bash
pnpm --filter "@vizij/animation-react" build
pnpm --filter "@vizij/animation-react" test
pnpm --filter "@vizij/animation-react" typecheck
```

Vitest mocks the wasm binding to keep tests fast; end-to-end checks can be exercised via demo apps (e.g., `apps/demo-animation-studio`) after linking local builds.

---

## Publishing

This package is published via the repository-wide workflow at [`.github/workflows/publish-npm.yml`](../../../.github/workflows/publish-npm.yml). To cut a release:

1. Generate a changeset and apply version bumps:

   ```bash
   pnpm changeset
   pnpm version:packages
   ```

2. Verify the package locally:

   ```bash
   pnpm install
   pnpm --filter "@vizij/animation-react" build
   pnpm --filter "@vizij/animation-react" test
   pnpm --filter "@vizij/animation-react" typecheck
   pnpm --filter "@vizij/animation-react" exec npm pack --dry-run
   ```

3. Tag the commit using the `npm-animation-react-vX.Y.Z` pattern and push the tag:

   ```bash
   git tag npm-animation-react-v0.3.0
   git push origin npm-animation-react-v0.3.0
   ```

The workflow builds with the latest linked dependencies, runs tests, and publishes with provenance metadata if the job succeeds.

---

## Related Packages

- [`@vizij/animation-wasm`](../../../vizij-rs/npm/@vizij/animation-wasm/README.md) – WASM binding used internally.
- [`vizij-animation-core`](../../../vizij-rs/crates/animation/vizij-animation-core/README.md) – underlying animation engine.
- [`@vizij/node-graph-react`](../node-graph-react/README.md) – complementary React bindings.

Questions or feature requests? Open an issue—smooth React integration keeps Vizij animations easy to use. 🎬
