# @vizij/orchestrator-react

> **React bindings for Vizij’s orchestrator – register controllers, stream blackboard writes, and manage playback from JSX.**

This package layers a declarative provider and hook set on top of `@vizij/orchestrator-wasm`. It handles WASM initialisation, orchestrator creation, controller registration, frame subscriptions, and convenient helpers like `useOrchTarget`.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Peer Dependencies](#peer-dependencies)
4. [Quick Start](#quick-start)
5. [Core Concepts](#core-concepts)
6. [Hook Reference](#hook-reference)
7. [Development & Testing](#development--testing)
8. [Publishing](#publishing)
9. [Related Packages](#related-packages)

---

## Overview

- `OrchestratorProvider` sets up a shared orchestrator instance backed by `@vizij/orchestrator-wasm`.
- Hooks expose imperative APIs (`useOrchestrator`) and observational subscriptions (`useOrchFrame`, `useOrchTarget`), all built on `useSyncExternalStore`.
- Local caching ensures that host-triggered `setInput` calls update hook subscribers immediately (0.3.x improvement).
- Native graph merging support: `registerMergedGraph` wires multiple specs together with configurable conflict strategies (`error`, `namespace`, `blend`).
- Works alongside `@vizij/node-graph-react` and `@vizij/animation-react` to coordinate multi-domain Vizij experiences.

---

## Installation

```bash
# pnpm
pnpm add @vizij/orchestrator-react @vizij/orchestrator-wasm react react-dom

# npm
npm install @vizij/orchestrator-react @vizij/orchestrator-wasm react react-dom

# yarn
yarn add @vizij/orchestrator-react @vizij/orchestrator-wasm react react-dom
```

If you consume locally linked WASM packages from `vizij-rs`, configure your Vite dev server to preserve symlinks, exclude the wasm pkg from pre-bundling, and enable COOP/COEP headers. See the Vizij web monorepo README for an end-to-end example.

---

## Peer Dependencies

- `react >= 18`
- `react-dom >= 18`
- `@vizij/orchestrator-wasm` (publish from `vizij-rs` first, then update this dependency range)

Double-check these ranges before releasing to avoid duplicate React copies or mismatched orchestrator ABI versions.

---

## Quick Start

```tsx
import {
  OrchestratorProvider,
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
} from "@vizij/orchestrator-react";

function Dashboard() {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    setInput,
    step,
  } = useOrchestrator();
  const frame = useOrchFrame();
  const demoValue = useOrchTarget("demo/output/value");

  React.useEffect(() => {
    if (!ready) {
      createOrchestrator({ schedule: "SinglePass" }).catch(console.error);
    }
  }, [ready, createOrchestrator]);

  return (
    <div>
      <button onClick={() => registerGraph({ spec: { nodes: [] } })}>
        Register graph
      </button>
      <button onClick={() => registerAnimation({ setup: {} })}>
        Register animation
      </button>
      <button
        onClick={() =>
          setInput("demo/input/value", { float: Math.random() * 10 })
        }
      >
        Push input
      </button>
      <button onClick={() => step(1 / 60)}>Step</button>
      <pre>{JSON.stringify(frame?.merged_writes ?? [], null, 2)}</pre>
      <p>Latest demo value: {JSON.stringify(demoValue)}</p>
    </div>
  );
}

export function App() {
  return (
    <OrchestratorProvider autostart={false}>
      <Dashboard />
    </OrchestratorProvider>
  );
}
```

---

## React 18 & Next.js Notes

- `OrchestratorProvider` now resets its internal mount flag on every effect pass, so React 18 Strict Mode (including Next.js dev builds) no longer leaves the provider stuck in “not ready”. If you previously worked around this by disabling Strict Mode, you can remove that patch.
- When you consume `@vizij/orchestrator-wasm` (and other Vizij wasm packages) in Webpack/Next.js, enable async WebAssembly and treat `.wasm` files as emitted assets:

```js
// next.config.js
module.exports = {
  webpack: (config) => {
    config.experiments = {
      ...(config.experiments ?? {}),
      asyncWebAssembly: true,
    };
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });
    return config;
  },
};
```

If you override `init()` with a custom wasm location, prefer string URLs (`init("https://cdn.example.com/vizij_orchestrator_wasm_bg.wasm")`) so Webpack doesn’t wrap them in `RelativeURL`.

---

## Core Concepts

### Provider Props

- `initInput` – Forwards optional init input to `@vizij/orchestrator-wasm.init`.
- `autoCreate` (default `true`) – Automatically call `createOrchestrator` on mount.
- `createOptions` – Options passed to `createOrchestrator` (e.g., `{ schedule: "TwoPass" }`).
- `autostart` – When `true`, kicks off an `requestAnimationFrame` loop stepping the orchestrator every frame.
- `backend="aroraWeb"` – Runs the shared module-facade contract through `arora-web.Engine`.
  Pass `initInput={{ orchestratorModule: "composed" }}` to load the composed Arora module, or omit it to keep the compatibility module default.
  By default, dependency preloads are derived from the selected module header's `imports` and resolved through a module registry. The built-in registry covers the independent `vizij-animation` and `vizij-node-graph` modules declared by the composed manifest, `moduleRegistryUrl` can point at a browser artifact manifest such as `/arora-web/modules/manifest.json`, and `moduleRegistry` can add custom module ids/URLs/bytes. Pass `preloadModules` only when you need to override header-derived dependency loading entirely.

### Context Surface

`useOrchestrator()` exposes:

- Lifecycle: `ready`, `createOrchestrator`, `requireOrchestrator`.
- Controller management: `registerGraph`, `registerMergedGraph`, `registerAnimation`, `removeGraph`, `removeAnimation`, `listControllers`.
- Blackboard API: `setInput`, `removeInput`, `prebind` — paths are normalised (trimmed, no whitespace) before staging to match `TypedPath` requirements.
- Stepping: `step`, plus autostart support in the provider.
- Utilities: `normalizeGraphSpec?(spec)` and `abiVersion?()` expose WASM helpers for editor tooling and compatibility checks.
- Internals ensure `setInput` mirrors values into a local cache so `useOrchTarget` subscribers update immediately, even before the next `step`.

### Frame & Path Subscriptions

- `useOrchFrame()` – Subscribes to the latest `OrchestratorFrame` (merged writes, conflicts, timings, events).
- `useOrchTarget(path)` – Observes a single blackboard path. Paths are normalised before subscription and cached so updates only re-render interested components.
- `valueHelpers` – `valueAsNumber`, `valueAsVec3`, `valueAsBool` mirror helpers from `@vizij/value-json` for convenience.

### StrictMode Consideration

React 18 StrictMode double-mounts providers in development. Because the orchestrator uses internal mutable refs, the second mount can leave `ready` false. Either avoid wrapping the provider in `<React.StrictMode>` or conditionally gate initialisation if you need both.

---

## Hook Reference

| Hook                  | Description                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `useOrchestrator()`   | Returns the imperative API described above.                                                       |
| `useOrchFrame()`      | Subscribes to the latest `OrchestratorFrame`.                                                     |
| `useOrchTarget(path)` | Subscribes to a single merged-write path, with immediate updates on `setInput`.                   |
| `useValueHelpers()`   | Access `valueAsNumber`, `valueAsVec3`, `valueAsBool` (or import directly from `valueHelpers.ts`). |

---

## Development & Testing

Run scripts with pnpm filters:

```bash
pnpm --filter "@vizij/orchestrator-react" dev
pnpm --filter "@vizij/orchestrator-react" test
pnpm --filter "@vizij/orchestrator-react" build
pnpm --filter "@vizij/orchestrator-react" typecheck
```

Vitest tests mock the wasm binding to keep execution fast. When you want end-to-end coverage against the real `vizij-orchestrator-wasm` build, rebuild the WASM package in `vizij-rs` (`pnpm run build:wasm:orchestrator`) and launch the `apps/demo-orchestrator` workspace.

---

## Publishing

The tag-driven workflow in [`.github/workflows/publish-npm.yml`](../../../.github/workflows/publish-npm.yml) publishes this package.

1. Create a changeset and apply the version bump:

   ```bash
   pnpm changeset
   pnpm version:packages
   ```

2. Validate locally:

   ```bash
   pnpm install
   pnpm --filter "@vizij/orchestrator-react" build
   pnpm --filter "@vizij/orchestrator-react" test
   pnpm --filter "@vizij/orchestrator-react" typecheck
   pnpm --filter "@vizij/orchestrator-react" exec npm pack --dry-run
   ```

3. Push a tag of the form `npm-orchestrator-react-vX.Y.Z`:

   ```bash
   git tag npm-orchestrator-react-v0.3.0
   git push origin npm-orchestrator-react-v0.3.0
   ```

Successful runs publish with provenance metadata using `NODE_AUTH_TOKEN`.

---

## Related Packages

- [`@vizij/orchestrator-wasm`](../../../vizij-rs/npm/@vizij/orchestrator-wasm/README.md) – wasm wrapper consumed by this package.
- [`vizij-orchestrator-core`](../../../vizij-rs/crates/orchestrator/vizij-orchestrator-core/README.md) – Rust crate providing orchestrator logic.
- [`@vizij/node-graph-react`](../@vizij/node-graph-react/README.md) & [`@vizij/animation-react`](../@vizij/animation-react/README.md) – React bindings for the other Vizij stacks.
- `apps/demo-orchestrator` – Minimal showcase using this package end-to-end.

Questions or feedback? Open an issue in Vizij’s main repo—great documentation keeps orchestration predictable. 🔄
