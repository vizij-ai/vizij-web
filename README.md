# vizij-web

Vizij's web monorepo collects the TypeScript packages, React integrations, and showcase applications that drive the "Web Based Framework for Rendered Robot Faces." It contains everything from the core animation/runtime hooks to demo front-ends used during development and research.

## Monorepo Layout

### Packages

| Package                   | Path                               | Purpose                                                               | Key scripts                                  |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| `@vizij/animation-react`  | `packages/@vizij/animation-react`  | React provider + hooks for the WASM animation engine.                 | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/config`           | `packages/@vizij/config`           | Canonical rig/pose/channel definitions shared across apps.            | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/node-graph-react` | `packages/@vizij/node-graph-react` | React bindings for the node-graph WASM runtime (provider + hooks).    | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/rig`              | `packages/@vizij/rig`              | React utilities for loading rigged 3D models into the Vizij renderer. | `dev`, `build`, `typecheck`, `clean`         |
| `vizij`                   | `packages/render`                  | Three.js renderer, store, and controllers for Vizij scenes.           | `dev`, `build`, `lint`, `clean`              |
| `@semio/utils`            | `packages/utils`                   | Shared math/helpers used across Vizij packages.                       | `dev`, `build`, `test`, `clean`              |

> The `vizij` and `@semio/utils` packages use `tsup`. Run their scripts with `npm --prefix packages/render …` and `npm --prefix packages/utils …` when you need bundled output.

### Apps

| App                       | Path                         | Purpose                                                       | Key scripts                                                     |
| ------------------------- | ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- |
| `vizij-website`           | `apps/website`               | Marketing + documentation site showcasing Vizij capabilities. | `dev`, `build`, `typecheck`, `lint`, `clean`, `preview`         |
| `vizij-node-graph-editor` | `apps/node-graph-editor`     | Full-featured editor for authoring node graphs.               | `dev`, `build`, `test`, `lint`, `typecheck`, `clean`, `preview` |
| `demo-animation-studio`   | `apps/demo-animation-studio` | Playground for the animation runtime and presets.             | `dev`, `build`, `typecheck`, `clean`, `preview`                 |
| `demo-animation`          | `apps/demo-animation`        | Minimal example showing animation playback + hooks.           | `dev`, `build`, `typecheck`, `clean`, `preview`                 |
| `demo-graph`              | `apps/demo-graph`            | Minimal node graph consumer demo.                             | `dev`, `build`, `typecheck`, `clean`, `preview`                 |

## Prerequisites

- Node.js 18 LTS or newer (Node 20 recommended).
- npm 9+, which ships with current Node LTS builds.
- For animation and node-graph runtimes: build the WASM artifacts from [`vizij-rs`](../vizij-rs) and `npm link` them (see `npm run link:wasm`).

## First-Time Setup

1. Install dependencies from the repo root:
   ```bash
   npm install
   ```
2. Build the core packages so `dist/` outputs exist (needed for local app dev):
   ```bash
   npm run build:packages
   ```
   If you need the bundled renderer/utilities, run:
   ```bash
   npm --prefix packages/render run build
   npm --prefix packages/utils run build
   ```
3. Launch the app you care about, for example the website:
   ```bash
   npm run dev:website
   ```
   or any workspace via `npm run dev --workspace <name>`.

## Root Scripts

- `npm run dev` – convenience alias for `vizij-website` dev server.
- `npm run dev:<app>` – start any app (`dev:node-graph-editor`, `dev:animation-studio`, `dev:demo-animation`, `dev:demo-graph`).
- `npm run build` – run `build` in every workspace (`apps/*` and `packages/@vizij/*`).
- `npm run build:packages` / `npm run build:apps` – targeted package or app builds; `build:animation` and `build:graph` wire up common pairings.
- `npm run typecheck` – run `typecheck` wherever it is defined.
- `npm run test` – execute all workspace `test` scripts (Vitest today).
- `npm run clean` – delete build artefacts for all workspaces plus `packages/render` and `packages/utils`.
- `npm run clean:deep` – alias for `npm run reset` (prunes every `node_modules`, `.vite`, then runs `npm ci`).
- `npm run link:wasm` – convenience shim for linking locally built WASM packages.

## Working Inside a Workspace

- Most packages/apps are npm workspaces, so you can run `npm run <script> --workspace <name>`.
- Renderer and utility packages live outside the workspace glob; use `npm --prefix packages/render run <script>` or `npm --prefix packages/utils run <script>`.
- To add dependencies inside a workspace: `npm install <pkg> --workspace <name>`.

## Cleaning & Troubleshooting

- Use `npm run clean` before switching branches or when Vite caches get confused.
- `npm run clean:deep` (a.k.a. `reset`) removes every `node_modules`, nukes `.vite` caches, and reinstalls from lockfile.
- If WASM behaviour looks off after pulling the Rust repo, rebuild the npm wrappers and re-run `npm run link:wasm`.

## Git Hooks

Local git hooks help keep CI green:

```bash
bash scripts/install-git-hooks.sh
```

Hooks run Prettier, ESLint, `tsc`, and Vitest (where defined) on commit/push. Set `HOOK_RUN_WEB_BUILD=1` if you want pre-push builds; override temporarily with `SKIP_GIT_HOOKS=1`.

## Related Repositories

- [`vizij-rs`](../vizij-rs) – Rust sources for the WASM runtimes.
- [`vizij-spec`](../vizij-spec) – canonical animation/spec documentation.
- [`vizij-docs`](../vizij_docs) – broader documentation set.
