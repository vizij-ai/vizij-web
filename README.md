# vizij-web Monorepo

> **TypeScript packages, React integrations, and demo applications that showcase Vizij’s real-time animation platform.**

This workspace consumes the Rust artefacts from [`vizij-rs`](../vizij-rs) via the published `@vizij/*` bindings (the `@vizij/animation` and `@vizij/node-graph-wasm` engines plus the `@vizij/runtime` runtime) and exposes production-ready packages plus a suite of internal apps.

---

## Table of Contents

1. [Overview](#overview)
2. [Workspace Layout](#workspace-layout)
3. [Tooling Requirements](#tooling-requirements)
4. [First-Time Setup](#first-time-setup)
5. [Scripts](#scripts)
6. [Local WASM Development](#local-wasm-development)
7. [Development Tips](#development-tips)
8. [Validation Workflow](#validation-workflow)
9. [Publishing & Versioning](#publishing--versioning)
10. [Related Repositories](#related-repositories)

---

## Overview

- **Packages** – Reusable libraries (`@vizij/*`) that wrap WASM runtimes, provide rig utilities, share configs, and expose rendering primitives.
- **Apps** – Demo and tooling front-ends (Vite + React) used for development, QA, and showcasing Vizij capabilities.
- **pnpm workspace** – Shared dependency graph, consistent linting/typechecking, and streamlined scripts.

## Documentation & Source Of Truth

- `vizij-docs` is the canonical internal source for cross-repo architecture, roadmap framing, lifecycle status, known issues, and release-note policy.
- This repo is the canonical source for `vizij-web` implementation detail, package/app workflows, and local execution docs.
- `vizij-web/apps/vizij-authoring/docs/*` is the detailed execution source for authoring work; `vizij-docs` summarizes that work at the cross-repo level.
- `vizij-ai.github.io` is the curated public-docs/tutorial/showcase surface.

---

## Workspace Layout

### Packages

| Package                       | Path                                   | Summary                                                         | Key scripts                                  |
| ----------------------------- | -------------------------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| `@vizij/animation-react`      | `packages/@vizij/animation-react`      | React provider for the animation WASM engine.                   | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/arora-types`          | `packages/@vizij/arora-types`          | TypeScript protocol types for standalone/control work.          | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/minimal-demo-ui`      | `packages/@vizij/minimal-demo-ui`      | Shared chrome and theme layer for minimal demos.                | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/node-graph-authoring` | `packages/@vizij/node-graph-authoring` | Authoring/compiler helpers and IR report CLI.                   | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/node-graph-react`     | `packages/@vizij/node-graph-react`     | React provider & hooks for node graphs.                         | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/render`               | `packages/@vizij/render`               | Three.js renderer + controllers for Vizij rigs.                 | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/runtime-react`        | `packages/@vizij/runtime-react`        | Runtime provider wiring the renderer to an Arora device engine. | `dev`, `build`, `test`, `typecheck`, `clean` |
| `@vizij/speech-react`         | `packages/@vizij/speech-react`         | Shared STT/LLM/TTS speech pipeline hooks for Vizij React apps.  | `dev`, `build`, `typecheck`, `clean`         |
| `@vizij/utils`                | `packages/@vizij/utils`                | Shared math/value utilities consumed across packages/apps.      | `dev`, `build`, `test`, `clean`              |

### Apps

| App                            | Path                                | Purpose                                                                 | Typical scripts                        |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- |
| `demo-animation-studio`        | `apps/demo-animation-studio`        | Playground for animation presets & advanced rig control.                | `dev`, `build`, `typecheck`, `preview` |
| `demo-graph-studio`            | `apps/demo-graph-studio`            | Work-in-progress Vizij node graph editor.                               | `dev`, `build`, `typecheck`, `preview` |
| `vizij-authoring`              | `apps/vizij-authoring`              | Author vizij assets, configure rig bindings, and export GLBs.           | `dev`, `build`, `typecheck`, `preview` |
| `demo-vizij-player`            | `apps/demo-vizij-player`            | Bundle-first reference player/showcase for `@vizij/runtime-react`.      | `dev`, `build`, `typecheck`, `preview` |
| `minimal-demo-animation`       | `apps/minimal-demo-animation`       | Minimal animation runtime example for quick smoke tests.                | `dev`, `build`, `typecheck`, `preview` |
| `minimal-demo-animation-graph` | `apps/minimal-demo-animation-graph` | Animation + node-graph integration showcase (URDF IK, filtering).       | `dev`, `build`, `typecheck`, `preview` |
| `minimal-demo-graph`           | `apps/minimal-demo-graph`           | Lightweight node-graph playground (inputs, outputs, staging behaviour). | `dev`, `build`, `typecheck`, `preview` |
| `tutorial-fullscreen-face`     | `apps/tutorial-fullscreen-face`     | Runtime tutorial app built on `@vizij/runtime-react`.                   | `dev`, `build`, `typecheck`            |
| `tutorial-agent-face`          | `apps/tutorial-agent-face`          | Tutorial/demo app with agent-facing interaction flow.                   | `dev`, `build`, `typecheck`            |
| `vizij-showcase`               | `apps/vizij-showcase`               | Shareable fullscreen showcase with runtime, voice, and staging helpers. | `dev`, `build`, `typecheck`            |
| `vizij-standalone`             | `apps/vizij-standalone`             | Tauri standalone application surface.                                   | `dev`, `build`, `preview`              |

There is also an `apps/vizij-ws-app` directory in the repo, but it is not part of the primary current pnpm app map or root command aliases. Treat it as a transitional implementation surface while the standalone/protocol story is normalized.

### vizij-authoring Features

The `vizij-authoring` app is the primary tool for creating and configuring Vizij face rigs. Key features include:

- **Scene Composer** – Import GLB models and configure scene hierarchy
- **Rigging Panel** – Create bindings between standard inputs and animatable components using expressions
- **Standard Feature Spaces Editor** – Define and configure standard input channels for facial animation:
  - **Setup Tab**: Load a reference face GLB to use as a visual guide
  - **Channels Tab**: Manage the standard input hierarchy (namespace → channel → track → attribute)
  - **Mapping Tab**: Compare main and reference faces side-by-side, configure bindings with a group-centric editor
- **Import/Export** – Save and load Vizij bundles as GLB files with embedded rig graphs

### Standard Feature Spaces

Standard Feature Spaces provide a unified naming convention for rig inputs, enabling interoperability between different face rigs and animation systems. Each standard input follows a hierarchical path:

```text
/standard/{namespace}/{channel}/{track}/{attribute}
```

- **Namespace**: Groups related channels under a feature space (e.g., `semio`)
- **Channel**: Feature group (e.g., `mouth`, `left_eye`, `right_eye`, `left_eyebrow`)
- **Track**: Control type (e.g., `pos`, `morph`, `rotation`)
- **Attribute**: Individual value (e.g., `x`, `y`, `z`, or morph target names)

#### Semio Namespace

The `semio` namespace is the primary standard feature space for Vizij facial rigs. It defines channels for:

| Channel                          | Description                 | Common Tracks                         |
| -------------------------------- | --------------------------- | ------------------------------------- |
| `left_eye` / `right_eye`         | Eye gaze and lid control    | `pos` (x, y), `rotation`              |
| `left_eyebrow` / `right_eyebrow` | Eyebrow movement            | `pos`, `morph`                        |
| `mouth`                          | Lip shapes and jaw movement | `morph` (visemes, expressions), `pos` |
| `head`                           | Head orientation            | `pos`, `rotation`                     |
| `jaw`                            | Jaw articulation            | `pos`, `rotation`                     |

The actual channels available depend on the loaded reference face GLB. Use the Standard Feature Spaces Editor in `vizij-authoring` to explore and configure channels for your specific rig.

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

| Command                                  | Description                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm run dev:<workspace>`               | Start a specific app (e.g. `dev:demo-vizij-player`, `dev:minimal-demo-graph`).                   |
| `pnpm run build`                         | Build packages then apps in dependency order.                                                    |
| `pnpm run build:packages` / `build:apps` | Run just the package builds or just the app builds.                                              |
| `pnpm run prep`                          | Format, then lint, then run `typecheck:all` across the workspace.                                |
| `pnpm run prep:push`                     | Full validation: format → clean → build → lint → `typecheck:all` → test (CI-friendly).           |
| `pnpm run lint`                          | Aggregate lint command for workspaces that expose `lint`.                                        |
| `pnpm run typecheck` / `typecheck:all`   | Regular type checks (`typecheck`) or no-bail mode that surfaces every failure (`typecheck:all`). |
| `pnpm run test`                          | Execute all test scripts (Vitest).                                                               |
| `pnpm run clean`                         | Remove workspace build outputs.                                                                  |
| `pnpm run reset` / `reset:hard`          | Drop `node_modules` (and lockfiles via `reset:hard`) to rebuild the workspace from scratch.      |

Use `pnpm --filter "<workspace>" <script>` when you want to target a specific package/app.

---

## Local WASM Development

When you need edits from the Rust workspace:

1. In `vizij-rs`:

   ```bash
   pnpm run link:wasm
   # optional: pnpm run watch:wasm:<animation|graph> for continuous rebuilds
   ```

2. Back in this repo, link the packages you want (and verify status):

   ```bash
   # link a subset
   pnpm run wasm:link -- --pkgs "node-graph-wasm runtime"
   # or link everything
   pnpm run wasm:link -- --pkgs all

   # confirm which ones are local vs registry
   pnpm run wasm:status
   ```

3. Optionally, reinstall to refresh workspace symlinks / resolution:

   ```bash
   pnpm install
   ```

Tips:

- Restart Vite dev servers after linking so they pick up new symlinks.
- Keep crate/npm versions aligned to avoid ABI mismatch errors (`expected 2, got 1`). Rebuild when they diverge.
- When you want to revert to published packages:

  ```bash
  pnpm run wasm:unlink -- --pkgs all
  pnpm install
  ```

Implementation note:

- `pnpm run wasm:link` uses direct symlinks under `node_modules/@vizij/*` pointing at `../vizij-rs/npm/@vizij/*` (rather than `pnpm link --global`), to avoid pnpm global-link flakiness and keep the workflow local to this checkout.

Vite configuration essentials (already applied in apps):

- `resolve.preserveSymlinks = true`
- `optimizeDeps.exclude` includes `@vizij/*-wasm`
- `server.watch.ignored` un-ignores the linked wasm package
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers required for wasm threads

---

## Development Tips

- Use `pnpm --filter "<workspace>" dev` for quick iteration without spinning up every app.
- Set `USE_LINKED_WASM=1` (where provided) to toggle behaviour when running against local builds.
- Git hooks run automatically: pre-commit formats/lints staged files via `lint-staged`, and pre-push runs the targeted validation pipeline (see below). Export `SKIP_GIT_HOOKS=1` to bypass in emergencies.
- The top-level `pnpm run validate` command scopes lint/typecheck/test to the workspaces that changed against your branch upstream, so use it for quick confidence between commits.
- When Vite cache issues arise, `pnpm run clean` or `pnpm run reset` usually resolves them.

## Validation Workflow

The repository now favours incremental checks by default while keeping “all workspaces” fallbacks close at hand.

- **Day-to-day editing**
  - Rely on the pre-commit hook to format/lint staged files. To preview the same behaviour manually, run `pnpm exec lint-staged`.
  - Run `pnpm run validate` whenever you want a local confidence sweep; it lint/typechecks/tests only the workspaces affected since your branch’s upstream (you can override the base via `PNPM_BASE_REF`).
- **Before pushing / handing off**
  - `pnpm run validate` (targeted) + `pnpm run build` catch most regressions without traversing the entire tree. If you need a clean build of everything, use `pnpm run build:packages` / `pnpm run build:apps`.
  - For full coverage (e.g. release prep), use `pnpm run validate:all` or `pnpm run prep:all`. The pre-push hook still calls `pnpm run validate`, and setting `HOOK_RUN_WEB_BUILD=1` forces an additional `pnpm run build`.
- **Continuous Integration**
  - CI runs `pnpm run format:check`, `lint:all`, `typecheck:all`, `test:all`, and `build`, so even if you lean on the incremental workflow locally, the pipeline proves a clean checkout passes every check.

- **Troubleshooting**
  - All validation scripts route through `scripts/run-affected.sh`, which uses pnpm’s bidirectional filters (`...[$BASE]...`) to include both changed workspaces and their dependents—so apps automatically re-validate when shared packages change.
  - Use `PNPM_BASE_REF=<commitish>` to compare against a different target (e.g. a release branch) without editing the scripts.

---

### Verifying Hooks

To ensure your git hooks are correctly installed, run:

```bash
./scripts/doctor.sh
```

If the check fails, run `./scripts/install-git-hooks.sh` to fix it.

## Publishing & Versioning

Publishing is coordinated through Changesets and a tag-triggered GitHub Actions workflow.

- Primary workflow: [`.github/workflows/publish-npm.yml`](.github/workflows/publish-npm.yml)
- Trigger: push an annotated tag matching `npm-pub-*` (or run the workflow manually via `workflow_dispatch`).

This workflow versions packages (via `changeset version`), commits the release artifacts back to the branch that contains the tagged commit, runs package-only verification, and then publishes only the changed `@vizij/*` packages to npm.

Legacy workflow (kept as a break-glass option): [`.github/workflows/release-tag_legacy.yml`](.github/workflows/release-tag_legacy.yml). It is now `workflow_dispatch` only.

### Prerequisites

- Internal package dependencies must use the workspace protocol (see `packages/**/package.json` and `.npmrc`).
- `NPM_TOKEN` in repo secrets with publish rights for the `@vizij/*` scope.
- Each publishable package has `"private": false` and a `publishConfig.access` entry.

### How a release flows

1. **Capture changes**
   - Run `pnpm changeset` for every feature PR that requires a release.
   - Merge the feature branch into `main`. The changeset files stay unversioned until the release cut.
2. **Tag a release commit**
   - From a clean local checkout of the branch you want to release (usually `main`):

     ```bash
     git tag -a "npm-pub-$(date -u '+%Y%m%d-%H%M%S')" -m "Trigger npm publish"
     git push origin --follow-tags
     ```

   - CI will determine the branch containing the tag commit and check it out.

3. **CI versions and publishes**
   - The `publish-npm` workflow installs dependencies, runs `pnpm ci:version` (Changesets versioning), commits the generated changes, runs `pnpm run verify:packages` (build + lint + tests scoped to `@vizij/*` packages), and finally executes `pnpm ci:publish`.
   - `pnpm ci:publish` runs `scripts/ci-publish.mjs`, which temporarily rewrites `workspace:*` dependency ranges to real versions during the publish step and restores manifests afterward.
   - Only packages with pending changesets are published.

### Tips & recovery

- Need a semantic tag instead of the timestamp? Use any `npm-pub-*` string that fits your conventions.
- If CI fails before the publish step, fix the issue on the release branch and push a new `npm-pub-*` tag.
- The legacy local-tag script is now `scripts/release-tag_legacy.sh` and is intended only for emergency use.
- If a publish succeeds but you spot a problem, deprecate the broken version on npm and release a follow-up changeset as normal—no manual republishing required.

The workflow logs the npm publish output for each changed package. After a successful run, your `main` branch already contains the release commit, so downstream work starts from the latest version state.

---

## Related Repositories

- [`vizij-rs`](../vizij-rs) – Rust source for the animation and graph cores plus WASM bundles.
- [`vizij-docs`](../vizij-docs) – Canonical internal cross-repo architecture, roadmap, decisions, and status summaries.
- [`vizij-ai.github.io`](../vizij-ai.github.io) – Curated public docs, tutorials, and showcase content.

Questions or contributions? Open an issue or reach out to the Vizij front-end & tooling team. Great docs keep this monorepo approachable. 🚀
