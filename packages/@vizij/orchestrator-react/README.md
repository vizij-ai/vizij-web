# @vizij/orchestrator-react

React provider and hooks for Vizij's orchestrator runtime (WASM-backed). This package bridges
`@vizij/orchestrator-wasm` with idiomatic React primitives so apps can register controllers,
step the orchestrator, and subscribe to merged frame outputs without juggling imperative glue.

## Quickstart (monorepo)

1. Build the wasm wrapper (once per change):
   ```bash
   # from vizij-rs/
   npm run build:wasm:orchestrator
   ```
2. Link the wasm package into the web workspace:
   ```bash
   # from vizij-web/
   npm run link:wasm
   # or, if orchestrator is not yet part of the script:
   npm link @vizij/orchestrator-wasm
   ```
3. Build or typecheck this package:
   ```bash
   npm run build --workspace @vizij/orchestrator-react
   npm run test --workspace @vizij/orchestrator-react
   ```

## Install (external app)

```bash
npm install @vizij/orchestrator-react @vizij/orchestrator-wasm react react-dom
```

Ensure your bundler can load the wasm glue. For Vite, add the `preserveSymlinks` and
`optimizeDeps.exclude` entries shown below (the demo app uses this exact config).

## Usage

Wrap your app with the provider and use the hooks to manipulate the orchestrator:

```tsx
import React from "react";
import {
  OrchestratorProvider,
  useOrchestrator,
  useOrchFrame,
  useOrchTarget,
} from "@vizij/orchestrator-react";

function DemoPanel() {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerAnimation,
    setInput,
    step,
  } = useOrchestrator();
  const frame = useOrchFrame();
  const firstWrite = useOrchTarget(frame?.merged_writes[0]?.path);

  React.useEffect(() => {
    createOrchestrator({ schedule: "SinglePass" }).catch(console.error);
  }, [createOrchestrator]);

  return (
    <div>
      <p>Ready: {ready ? "yes" : "no"}</p>
      <button onClick={() => registerGraph({ spec: { nodes: [] } })}>
        register graph
      </button>
      <button onClick={() => registerAnimation({ setup: {} })}>
        register anim
      </button>
      <button
        onClick={() => setInput("demo/input/value", { float: Math.random() })}
      >
        set input
      </button>
      <button onClick={() => step(1 / 60)}>step</button>
      <pre>{JSON.stringify(frame?.merged_writes ?? [], null, 2)}</pre>
      <pre>{JSON.stringify(firstWrite, null, 2)}</pre>
    </div>
  );
}

export function App() {
  return (
    <OrchestratorProvider autostart={false}>
      <DemoPanel />
    </OrchestratorProvider>
  );
}
```

### Hooks & helpers

- `useOrchestrator()` — access the imperative orchestrator host API (register controllers, set/remove inputs, step, list controllers).
- `useOrchFrame()` — subscribe to the latest `OrchestratorFrame` without re-rendering the entire tree.
- `useOrchTarget(path)` — subscribe to a single merged-write path. Returns the last value (if any).
- `valueAsNumber / valueAsVec3 / valueAsBool` — convenience helpers for common value projections.

The provider caches merged writes internally so `useOrchTarget` only re-renders components that
care about specific paths.

## Vite configuration

When consuming linked wasm packages, configure Vite to keep symlinks, un-ignore the linked
module, and avoid pre-bundling the wasm shim:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/orchestrator-wasm/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@vizij/orchestrator-wasm"],
  },
});
```

See `apps/demo-orchestrator` for a minimal working example including controller
registration, manual stepping, and merged frame rendering.

## Testing

The package ships with a Vitest suite that mocks the wasm layer. Run it via:

```bash
npm run test --workspace @vizij/orchestrator-react
```

Vitest is configured with a lightweight stub for `@vizij/orchestrator-wasm`, so real
binary builds are not required for CI smoke tests.
