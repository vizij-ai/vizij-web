# @vizij/animation-react

React provider and hooks for Vizij's animation engine (WASM-backed). This package wraps `@vizij/animation-wasm` with an ergonomic React API for loading animations, binding targets, stepping the simulation, and subscribing to per-target values.

- Engine core (Rust): vizij-animation-core
- WASM bindings (Rust): vizij-animation-wasm
- JS entry (npm): @vizij/animation-wasm
- React integration (this package): @vizij/animation-react

This README describes the current API and should be treated as the canonical starting point.

## Install

Within the monorepo:

- Build the WASM package (if not already built):

  ```bash
  # from vizij-rs/
  node scripts/build-animation-wasm.mjs
  ```

- Build the npm wrapper:

  ```bash
  # from vizij-rs/npm/@vizij/animation-wasm
  npm run build
  ```

- Build this React package:
  ```bash
  # from vizij-web/packages/@vizij/animation-react
  npm run build
  ```

In a separate app (after publishing to npm), install:

```bash
npm i @vizij/animation-react @vizij/animation-wasm react react-dom
```

### Vite configuration

`@vizij/animation-react` automatically calls `init()` from `@vizij/animation-wasm`, which in turn loads the compiled `.wasm` file via a relative `import.meta.url`.
Most bundlers handle this out of the box, but **Vite will break it if it prebundles the wasm shim into `.vite/deps`**. When that happens the relative URL points at a JS bundle and the wasm fetch returns HTML, causing `WebAssembly.instantiate()` to fail ("expected magic word 00 61 73 6d").

To keep the WASM asset loading correctly—without making every app import it manually—add the following to your Vite config:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Keep linked workspaces under node_modules so import.meta.url stays stable
    preserveSymlinks: true,
  },
  server: {
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/animation-wasm/**",
        "!**/node_modules/@vizij/animation-react/**",
      ],
    },
  },
  optimizeDeps: {
    // Let Vite serve the wasm entry directly instead of prebundling it
    exclude: ["@vizij/animation-wasm"],
    include: ["@vizij/animation-react"],
    force: true,
  },
});
```

With this setup the React provider can fetch the wasm binary on its own and consumers do not need to import the `.wasm` file directly.

## Quick Start

Load a StoredAnimation and display a live scalar value.

```tsx
import React from "react";
import {
  AnimationProvider,
  useAnimTarget,
  valueAsNumber,
} from "@vizij/animation-react";

// Minimal StoredAnimation (recommended format)
const anim = {
  name: "Scalar Ramp",
  duration: 2000, // ms
  tracks: [
    {
      id: "t0",
      name: "Scalar",
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
  const value = useAnimTarget("demo/scalar"); // subscribe by resolved key
  const num = valueAsNumber(value); // helper to coerce Value -> number
  return <div>Value: {num !== undefined ? num.toFixed(3) : "…"}</div>;
}

export default function App() {
  return (
    <AnimationProvider
      animations={anim}
      prebind={(path) => path} // identity mapping: canonical path -> key
      autostart
      updateHz={60}
    >
      <Panel />
    </AnimationProvider>
  );
}
```

## Concepts

- StoredAnimation: Canonical JSON format for clips (see vizij-spec/Animation.md).
- Prebind: Map canonical target paths (e.g., `"node/Transform.translation"`) to small keys you control (string or number). The engine will emit changes keyed to these values.
- Per-target subscription: React hooks subscribe to a specific resolved key and are notified only when that key changes (efficient updates).

## Provider

```tsx
import { AnimationProvider } from "@vizij/animation-react";
```

Props:

- `animations: StoredAnimation | StoredAnimation[]`
  - One or more StoredAnimation JSON objects to load. The provider ensures they are loaded once per identity change.
- `instances?: { playerName: string; animIndex?: number; cfg?: unknown }[]`
  - Optional instance creation spec.
  - If omitted, the provider creates a default player `"default"` bound to the first animation.
  - `animIndex` refers to the index in the `animations` array (0 by default).
  - `cfg` is passed through to the engine for future instance options.
- `prebind?: (path: string) => string | number | null | undefined`
  - Prebind resolver. Identity mapping is valid for many cases. Numbers are accepted and coerced to strings internally.
- `autostart?: boolean` (default: true)
  - When true, starts an RAF loop to advance the engine and notify subscribers.
- `updateHz?: number`
  - When set, throttles subscriber notifications to at most N Hz (simulation still advances every frame).
- Behavior:
  - On mount/props changes, loads animations and creates instances.
  - Calls `init()` in the underlying wasm wrapper (browser path).
  - Applies outputs from each `update()` into an external store keyed by resolved target keys.

Context shape (via `useAnimation()`):

```ts
type Ctx = {
  ready: boolean; // Provider is initialized
  subscribeToKey(key: string, cb: () => void): () => void;
  getKeySnapshot(key: string): Value | undefined;
  step(dt: number, inputs?: Inputs): void; // Manual stepping if autostart=false
  reload(
    anims: StoredAnimation[] | StoredAnimation,
    instances?: InstanceSpec[],
  ): void;
  players: Record<string, number>; // Optional player name -> PlayerId map
};
```

## Hooks

### useAnimation()

Access the provider context. Throw if called outside provider.

```ts
const { ready, players, step, reload } = useAnimation();
```

### useAnimTarget(key?: string): Value | undefined

Subscribe to a single target key and get its latest Value (tagged union from the engine). Efficiently re-renders only when that key changes.

```tsx
const v = useAnimTarget("robot/Arm.rotation");
```

## Value Helpers

Helpers to coerce the engine Value union to simple types for UI.

```ts
import {
  valueAsNumber,
  valueAsVec3,
  valueAsBool,
} from "@vizij/animation-react";

const n: number | undefined = valueAsNumber(value);
const v3: [number, number, number] | undefined = valueAsVec3(value);
const b: boolean | undefined = valueAsBool(value);
```

## Types

The engine emits values using a tagged union normalized at the wasm boundary:

```ts
export type Value =
  | { type: "Scalar"; data: number }
  | { type: "Vec2"; data: [number, number] }
  | { type: "Vec3"; data: [number, number, number] }
  | { type: "Vec4"; data: [number, number, number, number] }
  | { type: "Quat"; data: [number, number, number, number] }
  | { type: "Color"; data: [number, number, number, number] }
  | {
      type: "Transform";
      data: {
        translation: [number, number, number];
        rotation: [number, number, number, number]; // (x,y,z,w)
        scale: [number, number, number];
      };
    }
  | { type: "Bool"; data: boolean }
  | { type: "Text"; data: string };
```

See `@vizij/animation-wasm` for the complete `Inputs`, `Outputs`, `Change`, and `CoreEvent` types if you need to pass player commands or instance updates into `step(dt, inputs)` or into the provider in future extensions.

## Multiple Animations and Instances

Load multiple clips and create named players bound to specific animations:

```tsx
<AnimationProvider
  animations={[animA, animB]}
  instances={[
    { playerName: "walk", animIndex: 0 },
    {
      playerName: "wave",
      animIndex: 1,
      cfg: {
        /* future instance cfg */
      },
    },
  ]}
  prebind={(path) => path}
/>
```

You can then retrieve `players` from `useAnimation()` to send Inputs targeting specific players/instances (advanced flows).

## Prebind

For performance and stability, the engine resolves canonical paths once:

```ts
prebind={(path) => {
  // Example mapping from canonical engine paths to UI keys
  const map: Record<string, string> = {
    "robot/Transform.rotation": "robot/rot",
    "robot/Transform.translation": "robot/pos",
  };
  return map[path] ?? null;
}}
```

If `prebind` is omitted, the engine will emit changes keyed to canonical paths; you can subscribe to those directly.

## Example App (in monorepo)

- `vizij-web/apps/demo-animation` shows a minimal setup that:
  - Loads a StoredAnimation fixture
  - Identity-prebinds paths to subscription keys
  - Displays a live scalar value using `useAnimTarget` and `valueAsNumber`

Build with:

```bash
# from vizij-web/apps/demo-animation
npm run build
```

## Troubleshooting

- No values showing: Ensure your `animations` contain tracks and your subscription key matches the resolved key (consider identity prebind).
- Bundler warnings about node: modules: These stem from the wasm wrapper supporting Node; in browsers the wrapper uses URL-based loading, so warnings are benign.

## License

See repository root for licensing details.
