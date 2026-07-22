# Packages Agent Guide

Use this note when touching anything under `packages/`.

## Quick Tips

- Every workspace is managed with `pnpm`. Scope commands with `pnpm --filter "@vizij/<name>" <script>`.
- Builds run through `tsup`; outputs should stay under each package’s `dist/`.
- Keep public APIs tight. Export only from `src/index.ts` (or `src/index.tsx`) and document major changes in the package README.
- Update dependent demos whenever behaviour or typings change. See the individual package notes for which apps rely on them.
- Publishing flows are centralised: generate a changeset, run the `prep:push` checks, then tag following the `npm-<package>-vX.Y.Z` convention.

## Workspace Snapshot

| Package                       | Path                          | Notes                                                          |
| ----------------------------- | ----------------------------- | -------------------------------------------------------------- |
| `@vizij/animation-react`      | `@vizij/animation-react`      | React bindings for the animation runtime.                      |
| `@vizij/arora-types`          | `@vizij/arora-types`          | TypeScript protocol surface for standalone/control work.       |
| `@vizij/minimal-demo-ui`      | `@vizij/minimal-demo-ui`      | Shared UI/chrome for minimal demo apps.                        |
| `@vizij/node-graph-authoring` | `@vizij/node-graph-authoring` | Authoring/compiler helpers and IR report CLI.                  |
| `@vizij/node-graph-react`     | `@vizij/node-graph-react`     | React bindings for node graphs and staging helpers.            |
| `@vizij/render`               | `@vizij/render`               | Three.js renderer/controllers used across demos.               |
| `@vizij/runtime-react`        | `@vizij/runtime-react`        | All-in-one runtime provider that wires render + orchestration. |
| `@vizij/speech-react`         | `@vizij/speech-react`         | STT/LLM/TTS speech pipeline hooks for Vizij React apps.        |
| `@vizij/utils`                | `@vizij/utils`                | Shared math/value helpers used by all other packages/apps.     |

See each package’s own `AGENTS.md` for test expectations, release notes, and integration tips.
