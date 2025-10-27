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
8. [Publishing Packages](#publishing-packages)
9. [Related Repositories](#related-repositories)

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
| `@vizij/node-graph-react`   | `packages/@vizij/node-graph-react`   | React provider & hooks for node graphs.                       | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/orchestrator-react` | `packages/@vizij/orchestrator-react` | React orchestrator bindings and hooks.                        | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/render`             | `packages/@vizij/render`             | Three.js renderer + controllers for Vizij rigs.               | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/utils`              | `packages/@vizij/utils`              | Shared math/value utilities consumed across packages/apps.    | `dev`, `build`, `test`, `clean`              |

### Apps

| App                          | Path                                  | Purpose                                                                             | Typical scripts                                         |
| ---------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `demo-animation-studio`      | `apps/demo-animation-studio`          | Playground for animation presets & advanced rig control.                            | `dev`, `build`, `typecheck`, `preview`                  |
| `demo-graph-studio`          | `apps/demo-graph-studio`              | Work-in-progress Vizij node graph editor.                                           | `dev`, `build`, `typecheck`, `preview`                  |
| `vizij-authoring`       | `apps/vizij-authoring`           | Author vizij assets, export GLBs and rig graphs.                              | `dev`, `build`, `typecheck`, `preview`                  |
| `demo-vizij-player`          | `apps/demo-vizij-player`              | Authoring surface for facial rigs and orchestrator-driven playback.                 | `dev`, `build`, `typecheck`, `preview`                  |
| `minimal-demo-animation`     | `apps/minimal-demo-animation`         | Minimal animation runtime example for quick smoke tests.                            | `dev`, `build`, `typecheck`, `preview`                  |
| `minimal-demo-animation-graph` | `apps/minimal-demo-animation-graph` | Animation + node-graph integration showcase (URDF IK, filtering).                   | `dev`, `build`, `typecheck`, `preview`                  |
| `minimal-demo-graph`         | `apps/minimal-demo-graph`             | Lightweight node-graph playground (inputs, outputs, staging behaviour).             | `dev`, `build`, `typecheck`, `preview`                  |
| `minimal-demo-orchestrator`  | `apps/minimal-demo-orchestrator`      | Orchestrator blackboard visualiser with canned controllers.                         | `dev`, `build`, `typecheck`, `preview`                  |

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
   pnpm run dev:demo-animation-studio
   # or start any other app via pnpm --filter "<workspace>" dev
   ```

---

## Scripts

From the repo root:

| Command                                  | Description                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm run dev:<workspace>`               | Start a specific app (e.g. `dev:demo-vizij-player`, `dev:minimal-demo-graph`).               |
| `pnpm run build`                         | Build packages then apps in dependency order.                                                |
| `pnpm run build:packages` / `build:apps` | Run just the package builds or just the app builds.                                          |
| `pnpm run prep`                          | Format, then lint, then run `typecheck:all` across the workspace.                            |
| `pnpm run prep:push`                     | Full validation: format → clean → build → lint → `typecheck:all` → test (CI-friendly).       |
| `pnpm run lint`                          | Aggregate lint command for workspaces that expose `lint`.                                    |
| `pnpm run typecheck` / `typecheck:all`   | Regular type checks (`typecheck`) or no-bail mode that surfaces every failure (`typecheck:all`). |
| `pnpm run test`                          | Execute all test scripts (Vitest).                                                           |
| `pnpm run clean`                         | Remove workspace build outputs.                                                              |
| `pnpm run reset` / `reset:hard`          | Drop `node_modules` (and lockfiles via `reset:hard`) to rebuild the workspace from scratch.   |

Use `pnpm --filter "<workspace>" <script>` when you want to target a specific package/app.

---

## Local WASM Development

When you need edits from the Rust workspace:

1. In `vizij-rs`:
   ```bash
   pnpm run link:wasm
   # optional: pnpm run watch:wasm:<animation|graph|orchestrator> for continuous rebuilds
   ```
2. Back in this repo, reinstall to pick up the new symlinks:
   ```bash
   pnpm install
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

## Publishing Packages

The workflow at [`.github/workflows/publish-npm.yml`](.github/workflows/publish-npm.yml) publishes each npm package when a matching tag is pushed. Tags follow the pattern `npm-<package>-vX.Y.Z` and trigger a build, test, dry-run pack, and publish with provenance enabled.

### Release preparation

1. Generate a changeset to bump versions and capture notes:
   ```bash
   pnpm changeset
   pnpm version:packages
   ```
   Keep dependency ranges in sync with the latest `vizij-rs` WASM publishes.
2. Install dependencies and verify the build locally:
   ```bash
   pnpm install
   pnpm --filter "@vizij/<package>"... run build
   pnpm --filter "@vizij/<package>" run test
   pnpm --filter "@vizij/<package>" run typecheck
   pnpm --filter "@vizij/<package>" exec npm pack --dry-run
   ```
3. Commit changes, then create and push the tag:
   ```bash
   git tag npm-<package>-vX.Y.Z
   git push origin npm-<package>-vX.Y.Z
   ```

### Tag reference

| Package                     | Tag prefix                 | Notes                                                                                      |
| --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------ |
| `@vizij/utils`              | `npm-utils-v`              | Publish first; consumed by most other packages.                                            |
| `@vizij/render`             | `npm-render-v`             | Depends on `@vizij/utils`.                                                                 |
| `@vizij/animation-react`    | `npm-animation-react-v`    | Requires `@vizij/animation-wasm` from `vizij-rs` to be up to date.                         |
| `@vizij/node-graph-react`   | `npm-node-graph-react-v`   | Requires `@vizij/node-graph-wasm` from `vizij-rs`.                                         |
| `@vizij/orchestrator-react` | `npm-orchestrator-react-v` | Requires `@vizij/orchestrator-wasm` from `vizij-rs`.                                       |

The action logs the npm publish output. If a publish needs to be re-run, delete the tag locally and remotely (`git tag -d ...`, `git push origin :<tag>`), fix the issue, and push a new tag.

---

## Related Repositories

- [`vizij-rs`](../vizij-rs) – Rust source for the animation, graph, and orchestrator cores plus WASM bundles.
- [`vizij_docs`](../vizij_docs) – Additional design notes, investigation reports, and API documentation.
- [`vizij-spec`](../vizij_spec) – Authoritative schema definitions for animations, node graphs, and orchestrations.

Questions or contributions? Open an issue or reach out to the Vizij front-end & tooling team. Great docs keep this monorepo approachable. 🚀
