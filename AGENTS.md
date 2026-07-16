# Vizij-Web Agent Guide

This repo is the implementation home for Vizij's web packages, demos, tutorials, and standalone surfaces. Cross-repo architecture and roadmap truth live in `vizij-docs`; this repo owns implementation detail and local execution notes.

## Ground Rules

- Use `pnpm` for everything. Scope commands with `pnpm --filter "<name>" <script>`.
- Verify the current workspace surface from `package.json`, `pnpm-workspace.yaml`, and app/package manifests before trusting older local planning docs.
- After modifying any `package.json`, run `pnpm install` so workspace links stay correct.
- Run `pnpm run prep` before handing off substantial changes; use `pnpm run prep:push` when you need the full clean build + validation sweep.
- Install local git hooks with `bash scripts/install-git-hooks.sh`.
- Prefer incremental fixes over wide refactors unless asked otherwise.

## Documentation & Source Of Truth

- `vizij-docs` is canonical for cross-repo architecture, roadmap framing, lifecycle status, known issues, and release-note policy.
- `vizij-web` docs are canonical for implementation detail in this repo.
- `vizij-web/apps/vizij-authoring/docs/*` is the authoritative detailed tracker for authoring execution. `vizij-docs` summarizes that work at the cross-repo level.
- `vizij-ai.github.io` is the curated public-docs and showcase surface.

## Workspace Map

### TypeScript packages (`packages/@vizij/*`)

| Package                       | Focus                                                         |
| ----------------------------- | ------------------------------------------------------------- |
| `@vizij/animation-react`      | React bindings for the animation runtime                      |
| `@vizij/node-graph-react`     | React bindings for graph runtime/staging                      |
| `@vizij/render`               | Three.js renderer and controllers                             |
| `@vizij/runtime-react`        | Higher-level runtime provider wiring renderer + orchestration |
| `@vizij/utils`                | Shared utility layer                                          |
| `@vizij/node-graph-authoring` | Authoring/compiler helpers and IR report CLI                  |
| `@vizij/minimal-demo-ui`      | Shared UI/chrome for minimal demo apps                        |
| `@vizij/arora-types`          | TypeScript protocol surface for standalone/control work       |

### Local Rust crates under `packages/`

| Crate              | Focus                                           |
| ------------------ | ----------------------------------------------- |
| `arora-connection` | Core Arora connection traits/types              |
| `arora-websocket`  | WebSocket implementation for the Arora protocol |

### Apps (`apps/*`)

| App                            | Focus                                |
| ------------------------------ | ------------------------------------ |
| `vizij-authoring`              | Runtime-truthful authoring surface   |
| `demo-vizij-player`            | Authoring/runtime playback demo      |
| `demo-animation-studio`        | Animation playground                 |
| `demo-graph-studio`            | Graph editing demo                   |
| `minimal-demo-animation`       | Minimal animation smoke surface      |
| `minimal-demo-animation-graph` | Combined animation + graph sample    |
| `minimal-demo-graph`           | Minimal graph sample                 |
| `tutorial-fullscreen-face`     | Runtime tutorial example             |
| `tutorial-agent-face`          | Tutorial/demo with agent interaction |
| `vizij-showcase`               | Shareable showcase/demo surface      |
| `vizij-standalone`             | Tauri standalone app                 |

`apps/vizij-ws-app` also exists as a directory, but it is not part of the primary current pnpm app map or root command set. Treat it as a transitional implementation surface tied to the standalone/protocol track.

## Common Tasks

| Task                 | Command / Notes                             |
| -------------------- | ------------------------------------------- |
| Install deps         | `pnpm install`                              |
| Build all            | `pnpm run build`                            |
| Targeted validate    | `pnpm run validate`                         |
| Full validation      | `pnpm run prep:push`                        |
| Format               | `pnpm run format` / `pnpm run format:check` |
| Target one workspace | `pnpm --filter "<workspace>" run <script>`  |

## Working With Local WASM

1. In `vizij-rs`, build the needed wasm stack(s).
2. Back here, use:
   - `pnpm run wasm:link`
   - `pnpm run wasm:status`
   - `pnpm run wasm:unlink`
3. Restart any running Vite server after relinking.

Keep wasm/package versions aligned to avoid ABI mismatch errors.

## Expectations

- Use the manifests and README files as truth for what currently exists.
- Keep package/app docs aligned with real current workspace surfaces.
- If you change a shared runtime or contract, update `vizij-docs` summaries when the effect crosses repo boundaries.
- Call out any skipped validation in your hand-off.
