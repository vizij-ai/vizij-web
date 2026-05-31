# Apps Agent Guide

Use this file when working under `apps/`.

## General Guidance

- All apps use Vite + React and share common tooling. Run scripts with `pnpm --filter "<app-name>" <script>`.
- When launching a Vite dev server from Codex or running browser automation against one, explicitly set `NODE_ENV=development` on the command you start. The Codex desktop shell can inherit `NODE_ENV=production`, which makes Vite serve the production `react-jsx-dev-runtime` during dev and causes blank pages with `_jsxDEV is not a function`. Example: `NODE_ENV=development pnpm --filter "<app-name>" dev --host 127.0.0.1 --port 4173`.
- When modifying shared packages, rebuild them (`pnpm run build:packages`) before running the demos so Vite picks up new outputs.
- Each app README outlines its purpose, sample data, and any manual steps. Review it before large edits.
- Keep demo state local—avoid introducing backend dependencies or long-running background tasks.
- Ensure smoke tests (where present) still pass after changes. Add lightweight Vitest coverage if you expose new hooks/components.
- Minimal demo apps share layout + theme primitives from `@vizij/minimal-demo-ui`; wire new chrome there instead of copying styles.
- Use `pnpm run validate` for a fast lint/type/test sweep across affected packages and apps; `pnpm run validate:all` remains available when you need whole-repo assurance.

## App Directory Map

| App                            | Notes                                                                   |
| ------------------------------ | ----------------------------------------------------------------------- |
| `demo-animation-studio`        | Advanced animation playground with preset + rig editors.                |
| `demo-graph-studio`            | Node graph editor; depends heavily on `@vizij/node-graph-react`.        |
| `vizij-authoring`              | Runtime-truthful GLB authoring with rig/pose editing and Arora preview. |
| `demo-vizij-player`            | Facial rig + orchestrator authoring surface for end-to-end workflows.   |
| `minimal-demo-animation`       | Minimal animation runtime smoke test.                                   |
| `minimal-demo-animation-graph` | Combined animation + node-graph sample featuring URDF IK and filters.   |
| `minimal-demo-graph`           | Lightweight node-graph playground (inputs/outputs/staging demos).       |
| `minimal-demo-orchestrator`    | Blackboard visualiser to test orchestrator controller coordination.     |
| `tutorial-agent-face`          | Tutorial/demo surface with agent interaction and runtime wiring.        |
| `tutorial-fullscreen-face`     | Lightweight getting-started face demo for the runtime provider.         |
| `vizij-showcase`               | Larger face showcase with advanced controls and staging helpers.        |
| `vizij-standalone`             | Tauri desktop runtime with local Arora control and optional ROS2.       |

Each app directory contains its own `AGENTS.md` (if not, add one before doing extensive work) alongside README/setup instructions.
