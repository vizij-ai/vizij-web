# vizij-web Monorepo

> **TypeScript packages, React integrations, and demo applications that showcase Vizij’s real-time animation platform.**

This workspace consumes the Rust artefacts from [`vizij-rs`](../vizij-rs) via `@vizij/*-wasm` packages and exposes production-ready packages plus a suite of internal apps.

---

## Table of Contents

1. [Overview](#overview)
2. [Workspace Layout](#workspace-layout)
3. [Tooling Requirements](#tooling-requirements)
4. [First-Time Setup](#first-time-setup)
5. [Scripts](#scripts)
6. [Local WASM Development](#local-wasm-development)
7. [Development Tips](#development-tips)
8. [Related Repositories](#related-repositories)

---

## Overview

- **Packages** – Reusable libraries (`@vizij/*`) that wrap WASM runtimes, provide rig utilities, share configs, and expose rendering primitives.
- **Apps** – Demo and tooling front-ends (Vite + React) used for development, QA, and showcasing Vizij capabilities.
- **pnpm workspace** – Shared dependency graph, consistent linting/typechecking, and streamlined scripts.

---

## Workspace Layout

### Packages

| Package                     | Path                                 | Summary                                                       | Key scripts                                  |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------- | -------------------------------------------- |
| `@vizij/animation-react`    | `packages/@vizij/animation-react`    | React provider for the animation WASM engine.                 | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/config`             | `packages/@vizij/config`             | Canonical rig/channel definitions + utilities.                | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/node-graph-react`   | `packages/@vizij/node-graph-react`   | React provider & hooks for node graphs.                       | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/orchestrator-react` | `packages/@vizij/orchestrator-react` | React orchestrator bindings.                                  | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/rig`                | `packages/@vizij/rig`                | Helpers for loading rigged GLTF characters into the renderer. | `dev`, `build`, `typecheck`, `clean`         |
| `vizij`                     | `packages/render`                    | Three.js renderer, store, controllers.                        | `dev`, `build`, `lint`, `clean`              |
| `@vizij/utils`              | `packages/utils`                     | Shared math/value utilities.                                  | `dev`, `build`, `test`, `clean`              |

### Apps

| App                     | Path                         | Purpose                                                                             | Typical scripts                                         |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `website`               | `apps/website`               | Marketing/docs site sharing Vizij components.                                       | `dev`, `build`, `typecheck`, `lint`, `preview`, `clean` |
| `node-graph-editor`     | `apps/node-graph-editor`     | Authoring tool for Vizij graphs.                                                    | `dev`, `build`, `test`, `typecheck`, `lint`, `preview`  |
| `demo-animation-studio` | `apps/demo-animation-studio` | Playground for animation presets & rig control.                                     | `dev`, `build`, `typecheck`, `preview`                  |
| `demo-animation`        | `apps/demo-animation`        | Minimal animation player sample.                                                    | `dev`, `build`, `typecheck`, `preview`                  |
| `demo-animation-graph`  | `apps/demo-animation-graph`  | Animation graph showcase combining node graphs and animation outputs.               | `dev`, `build`, `typecheck`, `preview`                  |
| `demo-graph`            | `apps/demo-graph`            | Minimal node graph consumer sample.                                                 | `dev`, `build`, `typecheck`, `preview`                  |
| `demo-orchestrator`     | `apps/demo-orchestrator`     | Orchestrator showcase (graphs + animations).                                        | `dev`, `build`, `typecheck`, `preview`                  |
| `demo-render-no-rig`    | `apps/demo-render-no-rig`    | Renderer showcase without rigging layer (basic face control & orchestration panel). | `dev`, `build`, `typecheck`, `preview`                  |

---

## Tooling Requirements

- **Node.js** 18 LTS or newer (Node 20 recommended).
- **pnpm** 9.x (Corepack recommended: `corepack enable`).
- Optional: VS Code with recommended extensions (`.vscode/extensions.json`).

When linking local WASM builds you’ll also need the Rust toolchain from [`vizij-rs`](../vizij-rs).

---

## First-Time Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Build packages so apps receive compiled outputs:
   ```bash
   pnpm run build:packages
   ```
   To bundle renderer/utilities specifically:
   ```bash
   pnpm --filter "@vizij/render" build
   pnpm --filter "@vizij/utils" build
   ```
3. Start a dev server:
   ```bash
   pnpm run dev:website
   # or any app via pnpm --filter "<workspace>" dev
   ```

---

## Scripts

From the repo root:

| Command                                  | Description                                                  |
| ---------------------------------------- | ------------------------------------------------------------ |
| `pnpm run dev:<app>`                     | Start any app (`dev:animation`, etc.).                       |
| `pnpm run build`                         | Build all packages and apps.                                 |
| `pnpm run build:packages` / `build:apps` | Targeted builds.                                             |
| `pnpm run typecheck`                     | Run TypeScript checks across workspaces.                     |
| `pnpm run test`                          | Execute all test scripts (Vitest).                           |
| `pnpm run lint`                          | Aggregate lint command for workspaces that expose `lint`.    |
| `pnpm run clean`                         | Remove workspace build outputs.                              |
| `pnpm run reset`                         | Remove every `node_modules`/cache (:hard to remove locks).   |
| `pnpm run link:wasm`                     | Link locally built `@vizij/*-wasm` packages from `vizij-rs`. |

Use `pnpm --filter "<workspace>" <script>` when you want to target a specific package/app.

---

## Local WASM Development

When you need edits from the Rust workspace:

1. In `vizij-rs`:
   ```bash
   pnpm run link:wasm
   # optional: pnpm run watch:wasm:<animation|graph|orchestrator> for continuous rebuilds
   ```
2. Back in this repo:
   ```bash
   pnpm run link:wasm
   ```

Tips:

- Restart Vite dev servers after linking so they pick up new symlinks.
- Keep crate/npm versions aligned to avoid ABI mismatch errors (`expected 2, got 1`). Rebuild when they diverge.
- When you want to revert to published packages, run `pnpm install` (or `pnpm unlink --global @vizij/*-wasm`).

Vite configuration essentials (already applied in apps):

- `resolve.preserveSymlinks = true`
- `optimizeDeps.exclude` includes `@vizij/*-wasm`
- `server.watch.ignored` un-ignores the linked wasm package
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers required for wasm threads

---

## Development Tips

- Use `pnpm --filter "<workspace>" dev` for quick iteration without spinning up every app.
- Set `USE_LINKED_WASM=1` (where provided) to toggle behaviour when running against local builds.
- CI and git hooks expect formatted code; run `pnpm run lint` / `pnpm run typecheck` before pushing large changes.
- When Vite cache issues arise, `pnpm run clean` or `pnpm run reset` usually resolves them.

---

## Related Repositories

- [`vizij-rs`](../vizij-rs) – Rust source for the animation, graph, and orchestrator cores plus WASM bundles.
- [`vizij_docs`](../vizij_docs) – Additional design notes, investigation reports, and API documentation.
- [`vizij-spec`](../vizij_spec) – Authoritative schema definitions for animations, node graphs, and orchestrations.

Questions or contributions? Open an issue or reach out to the Vizij front-end & tooling team. Great docs keep this monorepo approachable. 🚀
