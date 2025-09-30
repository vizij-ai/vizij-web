# Implementation Plan

[Overview]
Create a React integration package for the Orchestrator WASM runtime and a minimal demo app that showcases registering controllers, stepping the orchestrator, and reading merged frame outputs.

This work adds a new monorepo package `@vizij/orchestrator-react` inside `vizij-web/packages/@vizij/orchestrator-react` which wraps the existing `@vizij/orchestrator-wasm` npm package with a React Provider, hooks, and lightweight value helpers. It mirrors the design and API ergonomics used by `@vizij/animation-react` and `@vizij/node-graph-react` so consumers get a familiar provider + hooks integration pattern.

The scope covers:

- A React provider component that initializes the WASM wrapper (`init()`), constructs a single Orchestrator instance, exposes imperative control APIs (register controllers, set inputs, prebind) and runs an RAF or manual loop.
- A small set of hooks for subscribing to keys/players and reading the latest frame (useOrchestrator, useOrchTarget, useOrchFrame).
- Type definitions that capture the key shapes used by the wrapper (OrchestratorFrame, WriteOp, InitInput, Controller identifiers, etc).
- A demo app `apps/demo-orchestrator` that consumes the provider to demonstrate a simple orchestrator usage: register an animation and a graph controller, set an input, step and render merged_writes to the UI.
- Minimal tests and build scripts matching repo conventions.

Why: the orchestrator runtime exists as a wasm wrapper in `vizij-rs/npm/@vizij/orchestrator-wasm`. Front-end teams expect a React-first integration like the existing animation/node-graph packages. Providing `@vizij/orchestrator-react` and a demo enables faster integration, consistent ergonomics across domain stacks, and a place to validate wasm packaging/linking during local development.

[Types]  
Single sentence describing the type system changes.  
Add TypeScript types describing the Orchestrator wrapper surface and the React-provider context so consumers get typed hooks and better DX.

Detailed type definitions

- Path: vizij-web/packages/@vizij/orchestrator-react/src/types.ts
- Exports in file:
  - type ValueJSON = any; // broad alias to accept wasm shapes; document shape in comments
  - type ShapeJSON = any;
  - type WriteOp = { path: string; value: ValueJSON; shape?: ShapeJSON; player?: number | string; };
  - type OrchestratorTimings = { animations_ms?: number; graphs_ms?: number; total_ms: number; [k: string]: number | undefined; };
  - type OrchestratorFrame = {
    epoch: number;
    dt: number;
    merged_writes: WriteOp[];
    conflicts?: any[];
    timings_ms: OrchestratorTimings;
    events?: any[];
    };
  - type InitInput = string | URL | Uint8Array | { url?: string } ; // mirror orchestrator-wasm accepts
  - type PrebindResolver = (path: string) => string | number | null | undefined;
  - type CreateOrchOptions = { schedule?: "SinglePass" | "TwoPass" | "RateDecoupled"; };
  - type ControllerId = string;
  - type OrchestratorReactCtx = {
    ready: boolean;
    createOrchestrator: (opts?: CreateOrchOptions) => Promise<void>;
    registerGraph: (cfg: object | string) => ControllerId;
    registerAnimation: (cfg: object) => ControllerId;
    prebind?: (resolver: PrebindResolver) => void;
    setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
    removeInput: (path: string) => boolean;
    step: (dt: number) => OrchestratorFrame | null;
    listControllers: () => { graphs: ControllerId[]; anims: ControllerId[] };
    removeGraph: (id: ControllerId) => boolean;
    removeAnimation: (id: ControllerId) => boolean;
    getLatestFrame: () => OrchestratorFrame | null;
    };
- Validation rules:
  - Inputs should match ValueJSON; provider performs shallow validation (non-empty strings for paths, numbers arrays remain as-is).
  - ControllerId is a string returned by underlying wasm wrapper; React layer treats them as opaque strings.
- Relationship:
  - OrchestratorFrame is what step() returns; provider caches latest frame and notifies subscribers.

[Files]  
Single sentence describing file modifications.  
Add a new package folder for the React wrapper and a new app demo; do not modify existing packages except build/test scripts if required.

Detailed breakdown:

New files to be created

- vizij-web/packages/@vizij/orchestrator-react/package.json
  - name: "@vizij/orchestrator-react"
  - version: "0.1.0"
  - type: "module"
  - main: "dist/index.js"
  - types: "dist/index.d.ts"
  - files: ["dist", "README.md"]
  - scripts: "dev", "build", "typecheck", "clean" (match animation-react)
  - dependencies: { "@vizij/orchestrator-wasm": "^0.1.0", "react": "^18.2.0" }
  - peerDependencies: { "react": ">=18" }
  - devDependencies: { "typescript": "^5.5.0", "@types/react": "^18.2.0" }

- vizij-web/packages/@vizij/orchestrator-react/tsconfig.json
  - similar to animation-react tsconfig (target esnext, module esnext, declaration true)

- vizij-web/packages/@vizij/orchestrator-react/README.md
  - Quickstart, Vite notes, usage examples (init(), createOrchestrator, register controllers, setInput, step(), prebind)

- src/ (source files)
  - vizij-web/packages/@vizij/orchestrator-react/src/index.tsx
    - Provider exports: OrchestratorProvider, useOrchestrator, useOrchTarget, useOrchFrame, value helpers
    - Re-export relevant surface from @vizij/orchestrator-wasm (e.g., init, createOrchestrator factory, types)
  - vizij-web/packages/@vizij/orchestrator-react/src/OrchestratorProvider.tsx
    - Core provider implementation (initializes wasm with init(), creates orchestrator instance, runs RAF loop if autostart)
  - vizij-web/packages/@vizij/orchestrator-react/src/hooks/useOrchestrator.ts
    - Hook to access context; throw when used outside provider
  - vizij-web/packages/@vizij/orchestrator-react/src/hooks/useOrchTarget.ts
    - useSyncExternalStore-based hook to subscribe to a single path's last value in the merged_writes
  - vizij-web/packages/@vizij/orchestrator-react/src/hooks/useOrchFrame.ts
    - Subscribe to the whole OrchestratorFrame (latest) for rendering diagnostic info
  - vizij-web/packages/@vizij/orchestrator-react/src/valueHelpers.ts
    - Helpers: valueAsNumber, valueAsVec3, valueAsBool — mirror animation-react helpers but adapt to orchestrator ValueJSON shape
  - vizij-web/packages/@vizij/orchestrator-react/src/types.ts
  - vizij-web/packages/@vizij/orchestrator-react/src/compat.ts (optional)
    - Provide any lightweight compatibility aliases if useful

New demo app

- vizij-web/apps/demo-orchestrator/package.json
  - "name": "demo-orchestrator", scripts: dev, build, typecheck, preview
  - dependencies: react, react-dom, @vizij/orchestrator-react
- vizij-web/apps/demo-orchestrator/tsconfig.json
  - Vite-react template like other demo apps
- vizij-web/apps/demo-orchestrator/index.html
- vizij-web/apps/demo-orchestrator/vite.config.ts
  - match existing demo app configs (optimizeDeps exclude @vizij/orchestrator-wasm if needed; preserveSymlinks)
- vizij-web/apps/demo-orchestrator/src/main.tsx
  - Standard React entry: import ReactDOM and mount App
- vizij-web/apps/demo-orchestrator/src/App.tsx
  - Uses OrchestratorProvider to:
    - await init
    - create orchestrator (createOrchestrator)
    - register a minimal graph and animation controller (or register empty controllers)
    - set an input
    - run a manual step on button click and display merged_writes and timings_ms
  - Provide a minimal UI: two buttons ("Register controllers", "Step 1 frame"), a list of merged_writes.

Existing files to be modified

- None required. The monorepo workspaces already include globs for packages/_ and apps/_ so new package and app should be picked up without editing root package.json. If maintainers prefer explicit workspace entries, add to vizij-web/package.json scripts for building packages/apps (optional).

Files to be deleted or moved

- None.

Configuration file updates

- No mandatory changes. Vite configs may need an `optimizeDeps.exclude` entry for `@vizij/orchestrator-wasm` in demo app's vite.config.ts to avoid prebundling the wasm helper; the provider should document the Vite recommendation (similar to animation-react README). If demo dev server runs into wasm fetch issues, add preserveSymlinks and optimizeDeps.exclude entries as in `@vizij/animation-react/README.md`.

[Functions]  
Single sentence describing function modifications.  
Add provider lifecycle functions and small hooks to subscribe to orchestrator frames and per-path writes; implement utility functions for prebinding and shallow validation.

Detailed breakdown:

New functions (name, signature, file path, purpose)

- initWrapper (re-export) — src/index.tsx
  - signature: export { init } from "@vizij/orchestrator-wasm";
  - Purpose: expose the wasm init helper to consumers.
- OrchestratorProvider (React component) — src/OrchestratorProvider.tsx
  - signature: React.FC<{
    children: React.ReactNode;
    autostart?: boolean;
    updateHz?: number;
    createOptions?: CreateOrchOptions;
    prebind?: PrebindResolver;
    onFrame?: (frame: OrchestratorFrame) => void;
    }>
  - Purpose: initialize wasm, create orchestrator instance, expose context, run RAF loop or allow manual step.
- createOrchestratorInternal (helper) — src/OrchestratorProvider.tsx
  - signature: async (opts?: CreateOrchOptions) => Promise<void>
  - Purpose: call wasm wrapper createOrchestrator(opts) and return instance handle.
- stepOrchestrator (method on provider context) — src/OrchestratorProvider.tsx
  - signature: (dt: number) => OrchestratorFrame | null
  - Purpose: call orchestrator.step(dt), cache latest frame, apply merged writes into provider store, notify subscribers.
- setInput (ctx method) — src/OrchestratorProvider.tsx
  - signature: (path: string, value: ValueJSON, shape?: ShapeJSON) => void
  - Purpose: convenience wrapper to call orchestrator.setInput(...).
- registerGraph / registerAnimation (ctx methods) — src/OrchestratorProvider.tsx
  - signatures: (cfg: object | string) => ControllerId
  - Purpose: register controllers via wasm wrapper and return ids.
- useOrchestrator (hook) — src/hooks/useOrchestrator.ts
  - signature: () => OrchestratorReactCtx
  - Purpose: return provider context and throw if missing.
- useOrchTarget (hook) — src/hooks/useOrchTarget.ts
  - signature: (path?: string) => ValueJSON | undefined
  - Purpose: subscribe to a single path's last value within merged_writes using useSyncExternalStore.
- useOrchFrame (hook) — src/hooks/useOrchFrame.ts
  - signature: () => OrchestratorFrame | null
  - Purpose: subscribe to latest full frame (for diagnostics / dev UI).
- valueAsNumber, valueAsVec3, valueAsBool — src/valueHelpers.ts
  - signature: (v: ValueJSON | undefined) => number | [number,number,number] | boolean | undefined

Modified functions

- None in existing packages.

Removed functions

- None.

[Classes]  
Single sentence describing class modifications.  
No new JS/TS classes are required; use functional React components and hooks.

Detailed breakdown:

- New classes: none.
- Modified classes: none.
- Removed classes: none.

[Dependencies]  
Single sentence describing dependency modifications.  
Add `@vizij/orchestrator-wasm` as a runtime dependency and standard React/type dev dependencies for the new package; no changes to core wasm packaging.

Important Note: As soon as the package is created we will need to run npm run link:wasm as the orchestrator wasm package has not been published yet and is only local.

Details:

- New packages:
  - "@vizij/orchestrator-react" dependencies:
    - runtime: "@vizij/orchestrator-wasm": "^0.1.0"
    - runtime: "react": "^18.2.0"
    - peerDependencies: "react": ">=18"
    - devDependencies: "typescript": "^5.5.0", "@types/react": "^18.2.0"
- Demo app dependencies:
  - "react", "react-dom", "@vizij/orchestrator-react"
- Integration requirements:
  - If developing locally against vizij-rs: run `npm run build:wasm:orchestrator` in vizij-rs and `npm link` the npm wrapper, then in `vizij-web` run `npm run link:wasm` or `npm link @vizij/orchestrator-wasm`.
  - Vite: recommend `preserveSymlinks: true` and `optimizeDeps.exclude: ["@vizij/orchestrator-wasm"]` for the demo app when using linked packages, documented in README.

[Testing]  
Single sentence describing testing approach.  
Provide unit tests for hooks/Provider behaviors and a manual smoke demo test for the app; tests use Vitest + @testing-library/react following monorepo conventions.

Test file requirements and locations:

- vizij-web/packages/@vizij/orchestrator-react/test/OrchestratorProvider.test.tsx
  - Tests:
    - Provider initializes and sets ready state after calling init() (mock wasm wrapper).
    - step() calls orchestrator.step and provider updates latest frame.
    - setInput forwards to wasm wrapper.
    - hooks useOrchTarget and useOrchFrame update subscribers on new frames (use fake timers / mocked step).
- Testing approach:
  - Mock `@vizij/orchestrator-wasm` exports (init, createOrchestrator, createOrchestratorFactory, instantiate orchestration API) to avoid requiring wasm files in CI.
  - Use Vitest and testing-library/react: render provider and assert subscriptions.
- Demo validation:
  - Manual smoke: start `npm run dev --workspace demo-orchestrator` and open UI; the app shows merged_writes after a step.
  - CI: (optional) basic typecheck `npm run typecheck --workspace @vizij/orchestrator-react` included in pipeline by maintainers as needed.

[Implementation Order]  
Single sentence describing the implementation sequence.  
Implement package scaffolding, provider/hook code, demo app, tests, and update docs — in that order — then validate with a local dev server using linked wasm pkg.

Numbered steps

1. Create package scaffolding
   - Create `vizij-web/packages/@vizij/orchestrator-react/package.json`, `tsconfig.json`, `README.md`, and `src/` folder with empty files listed above.
2. Implement types & valueHelpers
   - Add `src/types.ts` and `src/valueHelpers.ts`.
3. Implement Provider core
   - Add `src/OrchestratorProvider.tsx` implementing init(), create orchestrator, prebind, step loop, applyOutputs, caching latest frame, and subscriber notifications similar to `@vizij/animation-react` provider.
4. Implement hooks
   - Add `useOrchestrator`, `useOrchTarget`, `useOrchFrame` using useSyncExternalStore to subscribe to provider's notification callbacks.
5. Export surface
   - Implement `src/index.tsx` to export provider, hooks, helpers, and re-export `@vizij/orchestrator-wasm` surface where appropriate.
6. Implement demo app
   - Create `apps/demo-orchestrator` with `App.tsx` demonstrating registration of controllers, setInput, manual step and display of `merged_writes`.
7. Add basic unit tests
   - Add tests mocking `@vizij/orchestrator-wasm` to validate provider lifecycle and hooks.
8. Build, link and integration test locally
   - If developing live against rust wasm: build vizij-rs wasm pkg and `npm link` the wrapper, then in this repo `npm link @vizij/orchestrator-wasm` and run `npm run dev --workspace demo-orchestrator`.
9. Document Vite caveats and usage in package README
   - Add `optimizeDeps` and `preserveSymlinks` docs similar to animation-react.
10. Optional: add `demo-orchestrator` to any top-level build scripts if maintainers want it included in batch builds.

Implementation notes and edge cases

- The provider must not assume player ids are numbers; treat controller/player ids as opaque strings returned by wasm wrapper.
- Provide graceful errors when wasm `init()` fails; the provider should surface `ready=false`.
- Keep the hook re-rendering efficient: use useSyncExternalStore and per-path subscribers to avoid broad re-renders.
- When using linked packages in Vite, preserve symlinks and exclude the wasm wrapper from prebundling to avoid wasm fetch issues.
- Tests should mock wasm wrapper surface to avoid binary dependencies in CI.

## Progress Log

- 2025-09-30T05:43:59Z — Reviewed existing React integration packages to mirror configuration and conventions.
- 2025-09-30T05:45:05Z — Scaffolded @vizij/orchestrator-react package with initial config, placeholder source files, and typed value helpers.
- 2025-09-30T05:49:52Z — Implemented provider, hooks, and exports for orchestrator React integration, including RAF loop and subscription stores.
- 2025-09-30T05:52:33Z — Built demo-orchestrator Vite app with controller registration workflow and frame diagnostics UI.
- 2025-09-30T05:55:39Z — Added Vitest suite with wasm stubs, wired test config, and verified orchestrator-react tests pass.
- 2025-09-30T05:56:23Z — Documented package usage, Vite setup, and updated link:wasm script for orchestrator support.
