# Vizij-Web Agent Guide

Welcome! This note keeps AI coding agents aligned with the current state of the
`vizij-web` monorepo. Refer to `README.md`, workspace-specific READMEs, and the
implementation plan for authoritative details; this file distills the key
expectations and workflows.

## Agent Workflow Checklist

- Re-read the root `README.md` and any touched package/app README before
  editing—monorepo scripts evolve quickly.
- Default to `pnpm`. Call workspace scripts with
  `pnpm --filter <name> <script>`; use `pnpm --filter "@vizij/render"` (or
  `"@vizij/utils"`) for packages outside the default workspace globs.
- Keep the planning tool handy for multi-step tasks and update plans after each
  major action.
- Watch for stale symlinks when linking WASM packages from `vizij-rs`; restart
  Vite servers after switching between linked and published packages.
- Install the local git hooks (`bash scripts/install-git-hooks.sh`) so fmt/lint
  checks run automatically. You can run the same scripts manually if needed.
- Stay concise in handoffs; mention skipped validation steps and suggest
  next actions (including tests, builds) when relevant.

## Workspace Snapshot

### Core packages (`packages/@vizij/*`)

| Workspace                   | Purpose                                                       | Common scripts                               |
| --------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `@vizij/animation-react`    | React provider and hooks wrapping the animation WASM runtime. | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/node-graph-react`   | React bindings for the node-graph controller.                 | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/orchestrator-react` | React hooks/components for the orchestrator WASM API.         | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/config`             | Canonical rig/pose/channel definitions shared by apps.        | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/rig`                | Helpers for loading rigged assets into the renderer.          | `dev`, `build`, `typecheck`, `clean`         |

### Supporting packages

| Workspace       | Path              | Notes                                                                                                   |
| --------------- | ----------------- | ------------------------------------------------------------------------------------------------------- |
| `@vizij/render` | `packages/render` | Three.js renderer + controllers. Uses `tsup`; run scripts via `pnpm --filter "@vizij/render" <script>`. |
| `@vizij/utils`  | `packages/utils`  | Shared math/helpers. Also uses `tsup` and exposes a Vitest suite.                                       |

### Apps (`apps/*`)

| Workspace                 | Purpose                                         |
| ------------------------- | ----------------------------------------------- |
| `vizij-website`           | Marketing/documentation site.                   |
| `vizij-node-graph-editor` | Full editor for authoring node graphs.          |
| `demo-animation-studio`   | Playground for animation presets.               |
| `demo-animation`          | Minimal animation demo.                         |
| `demo-graph`              | Minimal node-graph demo.                        |
| `demo-orchestrator`       | Orchestrator integration showcase.              |
| `demo-render-no-rig`      | Tests renderer/orchestrator without rig assets. |
| `demo-animation-graph`    | Combined animation + graph demo.                |

Use `pnpm --filter <workspace> <script>` (or `pnpm run <script> --filter <workspace>`) to interact with any of them.

## Root Command Reference

| Task                               | Command                                              |
| ---------------------------------- | ---------------------------------------------------- |
| Install dependencies               | `pnpm install`                                       |
| Build everything (packages + apps) | `pnpm run build`                                     |
| Build library packages only        | `pnpm run build:packages`                            |
| Build apps only                    | `pnpm run build:apps`                                |
| Start a specific dev server        | `pnpm run dev:<app>` (see scripts in `package.json`) |
| Run lint across workspaces         | `pnpm run lint`                                      |
| Run Vitest suites                  | `pnpm run test`                                      |
| Type-check everywhere              | `pnpm run typecheck`                                 |
| Clean build artefacts              | `pnpm run clean`                                     |
| Reset node_modules and reinstall   | `pnpm run clean:deep` (alias for `pnpm run reset`)   |
| Link locally built WASM packages   | `pnpm run link:wasm`                                 |

## Local WASM Development (with `vizij-rs`)

1. In the `vizij-rs` repo, rebuild and link the WASM crates:
   ```bash
   pnpm run build:wasm:animation   # or :graph / :orchestrator as needed
   pnpm run link:wasm
   ```
   Use the `watch:wasm:*` scripts there (requires `cargo-watch`) for continuous
   rebuilds.
2. Back in `vizij-web`, link the packages into this workspace:
   ```bash
   pnpm run link:wasm
   ```
3. Restart any running Vite dev servers so they pick up the new symlinks. Run
   `pnpm install` later to return to the published versions.

Keep crate/package versions aligned and rebuild before linking to avoid ABI
mismatches. Relink after switching branches or cleaning lockfiles.

## Coding and Testing Expectations

- Target ES2022/ESM modules and strict TypeScript settings. Ensure packages
  emit type declarations (`dist/*.d.ts`).
- Prefer functional React components with hooks. Surface public APIs from
  `src/index.ts` and keep internals private.
- Handle WASM loading asynchronously (dynamic `import()`, `init()` helpers, and
  loading/error UI states). Do not initialise WASM at module top-level.
- Co-locate tests with source (`*.test.tsx`). Use Vitest + React Testing Library
  where available; add smoke tests when exposing new hooks/components.
- Run `pnpm run lint`, `pnpm run typecheck`, and `pnpm run test` (if present) on
  touched workspaces before handoff. Call out any skipped command in your
  response.
- Avoid committing `dist/` unless a release workflow demands it. Rebuild before
  publishing and keep metadata in sync (`package.json`, changelog if added).

## Tooling and Git Hooks

- Install repo hooks once per machine:
  ```bash
  bash scripts/install-git-hooks.sh
  ```
- Hooks run Prettier, ESLint, `tsc`, and Vitest (where configured). You can set
  `HOOK_RUN_WEB_BUILD=1` to include builds, or temporarily skip with
  `SKIP_GIT_HOOKS=1`.
- Editor setup: enable ESLint + Prettier integrations and point TypeScript to
  the workspace root for path resolution.

## Cross-Repo and Release Notes

- The React packages depend on the WASM crates shipped from `vizij-rs`. Publish
  the WASM packages first, then update dependency ranges here before releasing
  React packages.
- Coordinate changes that affect both repos—document JSON schema or ABI updates
  in changelog/README pairs and mention migration steps in PR descriptions.
- Demo apps often reference local assets; document any manual asset copy steps
  (for example, bespoke WASM bundle locations) in the PR or README until they
  are automated.

## Maintenance

- Update this guide whenever packages, scripts, or workflows change. Keep it in
  sync with the root README and implementation plan so future agents stay on
  the happy path.
