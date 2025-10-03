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

> The `vizij` and `@semio/utils` packages use `tsup`. Run their scripts with `pnpm --filter "@vizij/render" …` and `pnpm --filter "@vizij/utils" …` when you need bundled output.

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
- pnpm 9.12.2 (or newer 9.x) to match the workspace lockfile.
- For day-to-day work the published `@vizij/*` packages are enough. See [Local WASM Development](#local-wasm-development) if you need to iterate on the Rust crates directly.

## First-Time Setup

1. Install dependencies from the repo root:
   ```bash
   pnpm install
   ```
   If you hit 404 errors for `@vizij/*-wasm` packages, build and link the WASM
   wrappers from the sibling `vizij-rs` repo first (see
   [Local WASM Development](#local-wasm-development)).
2. Build the core packages so `dist/` outputs exist (needed for local app dev):
   ```bash
   pnpm run build:packages
   ```
   If you need the bundled renderer/utilities, run:
   ```bash
   pnpm --filter "@vizij/render" build
   pnpm --filter "@vizij/utils" build
   ```
3. Launch the app you care about, for example the website:
   ```bash
   pnpm run dev:website
   ```
   or any workspace via `pnpm --filter <name> dev`.

## Local WASM Development

When you need edits from the Rust workspace (`vizij-rs`) to flow straight into the web apps, link the locally built WASM packages:

1. In `vizij-rs`, build and register the global links:
   ```bash
   pnpm run link:wasm
   ```
   This rebuilds both WASM wrappers and exposes them via `pnpm link` (use `pnpm run watch:wasm:animation|graph` there if you want ongoing rebuilds).
2. Back in this repo, link the packages into the monorepo:
   ```bash
   pnpm run link:wasm
   ```
   Existing dependencies stay intact—you do **not** need to delete `node_modules`. Simply restart any running Vite dev server so it picks up the new symlinks.
3. To return to the published artifacts, run `pnpm install` (or `pnpm unlink --global @vizij/animation-wasm @vizij/node-graph-wasm`) to restore the versions from the lockfile.

Gotchas to keep in mind:

- Always rebuild before linking; stale `pkg/` output in `vizij-rs` can cause confusing runtime errors.
- Keep crate/package versions aligned. If the published packages move forward, bump local versions before linking to avoid ABI mismatches.
- Relinking updates files inside `node_modules`, so rerun `pnpm run link:wasm` after switching branches or reinstalling dependencies.
- Long-running dev servers cache module graphs—restart them whenever you toggle between linked and published packages.

## Root Scripts

- `pnpm run dev` – convenience alias for `vizij-website` dev server.
- `pnpm run dev:<app>` – start any app (`dev:node-graph-editor`, `dev:animation-studio`, `dev:demo-animation`, `dev:demo-graph`).
- `pnpm run build` – run `build` in every workspace (`apps/*` and `packages/@vizij/*`).
- `pnpm run build:packages` / `pnpm run build:apps` – targeted package or app builds; `build:animation` and `build:graph` wire up common pairings.
- `pnpm run typecheck` – run `typecheck` wherever it is defined.
- `pnpm run test` – execute all workspace `test` scripts (Vitest today).
- `pnpm run clean` – delete build artefacts for all workspaces plus `packages/render` and `packages/utils`.
- `pnpm run clean:deep` – alias for `pnpm run reset` (prunes every `node_modules`, `.vite`, then reinstalls via pnpm).
- `pnpm run link:wasm` – convenience shim for linking locally built WASM packages.

## Working Inside a Workspace

- Most packages/apps are pnpm workspaces, so you can run `pnpm --filter <name> <script>` (or `pnpm run <script> --filter <name>`).
- Renderer and utility packages live outside the simpler filter globs; use `pnpm --filter "@vizij/render" <script>` or `pnpm --filter "@vizij/utils" <script>`.
- To add dependencies inside a workspace: `pnpm add <pkg> --filter <name>`.

## Cleaning & Troubleshooting

- Use `pnpm run clean` before switching branches or when Vite caches get confused.
- `pnpm run clean:deep` (a.k.a. `reset`) removes every `node_modules`, nukes `.vite` caches, and reinstalls from the pnpm lockfile.
- If WASM behaviour looks off after pulling the Rust repo, rebuild the WASM wrappers and re-run `pnpm run link:wasm`.

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
