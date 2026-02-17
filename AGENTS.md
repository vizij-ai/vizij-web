# Vizij-Web Agent Guide

This note keeps coding agents aligned with the current `vizij-web` monorepo. Read the root `README.md`, the relevant `AGENTS.md`, and nearby README files before changing code.

## Ground Rules

- Use `pnpm` for everything. Target a workspace with `pnpm --filter "<name>" <script>`.
- After modifying any `package.json`, run `pnpm install` immediately to link workspace dependencies and resolve lint errors.
- Plan multi-step work and keep the plan updated.
- Run `pnpm run prep` (format + targeted validate) before handing off significant changes; use `pnpm run prep:push` (or set `HOOK_RUN_WEB_BUILD=1`) prior to publishing or pushing when you need a clean full build.
- Install the local git hooks (`bash scripts/install-git-hooks.sh`) so formatting, lint, and type checks stay consistent.
- Pre-commit automatically runs `lint-staged` on staged files; pre-push runs `pnpm run validate` scoped to affected workspaces. Override the comparison base with `PNPM_BASE_REF` when needed.
- Prefer incremental fixes over wide refactors unless you have explicit direction.

## Documentation

The codebase lives in `vizij-web` and `vizij-rs`, but project plans, specs, and design docs live in the sibling `vizij-docs` repository. Always check `vizij-docs` for the latest context before starting a task.

## Workspace Map

### Packages (`packages/@vizij/*`)

| Package                     | Focus                                                            |
| --------------------------- | ---------------------------------------------------------------- |
| `@vizij/animation-react`    | React provider/wrappers for the animation WASM runtime.          |
| `@vizij/node-graph-react`   | React bindings for Vizij node graphs.                            |
| `@vizij/orchestrator-react` | Hooks/components for orchestrator + blackboard orchestration.    |
| `@vizij/render`             | Three.js renderer and rig controllers used by the demos.         |
| `@vizij/utils`              | Shared math/value helpers consumed by the rest of the workspace. |
| `@vizij/minimal-demo-ui`    | Shared chrome + theming primitives for all minimal demo apps.    |

### Apps (`apps/*`)

| App                            | Highlights                                              |
| ------------------------------ | ------------------------------------------------------- |
| `demo-animation-studio`        | Advanced animation playground with preset management.   |
| `demo-graph-studio`            | In-progress node graph editor.                          |
| `demo-vizij-authoring`         | Inspect and export Vizij GLBs without rig/orchestrator. |
| `demo-vizij-player`            | Facial rig + orchestrator authoring surface.            |
| `demo-vizij-rigging`           | Build high-level emotion rigs from low-level mappings.  |
| `minimal-demo-animation`       | Small animation runtime smoke test.                     |
| `minimal-demo-animation-graph` | Animation + node-graph integration sample.              |
| `minimal-demo-graph`           | Lightweight node-graph playground.                      |
| `minimal-demo-orchestrator`    | Blackboard visualiser showing orchestrator merges.      |

See `apps/AGENTS.md` and each app’s `README.md` for deeper guidance.

## Common Tasks

| Task              | Command / Notes                                                       |
| ----------------- | --------------------------------------------------------------------- |
| Install deps      | `pnpm install`                                                        |
| Global lint       | `pnpm lint` (best for catching cross-package regressions)             |
| Build all         | `pnpm run build` (packages first, then apps)                          |
| Check formatting  | `pnpm run format:check` or `pnpm run format` (writes)                 |
| Targeted validate | `pnpm run validate` (lint + typecheck + test for affected workspaces) |
| Full validation   | `pnpm run prep:push` (format → clean → build → validate:all)          |
| Focused scripts   | `pnpm --filter "<workspace>" run <script>`                            |

## Working With Local WASM

1. In `vizij-rs`, rebuild and link the WASM crates (see that repo’s docs).
2. Back here, rerun `pnpm install` to refresh symlinks.
3. Restart any running Vite servers so they pick up the new builds.

Keep crate/npm versions aligned to avoid ABI mismatches.

## Expectations

- Target ES2022 modules with strict TypeScript configs; packages must emit `.d.ts`.
- Avoid top-level WASM initialisation—use async loaders/providers.
- Co-locate tests (`*.test.ts(x)`) with source and keep demos in sync with library changes.
- Never remove user-authored changes and never commit `dist/` artefacts outside publishing flows.
- Call out any skipped validation in your hand-off.

For details specific to packages or apps, consult the `AGENTS.md` deeper in the tree.
