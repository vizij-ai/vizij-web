# vizij-web

The web packages and apps of Vizij: author a face, show it on a page, drive it
from React. Every face here runs on
[`@vizij/runtime`](https://github.com/vizij-ai/vizij-rs/tree/main/npm/@vizij/runtime),
the browser build of [vizij-rs](https://github.com/vizij-ai/vizij-rs), the
same runtime a deployed Vizij runs.

## Apps

| App                                                                 | What it is                                                                                                  | Start it                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| [`vizij-authoring`](apps/vizij-authoring)                           | Author a face: load a GLB, bind its rig to the face standard, author poses and animations, export the face. | `pnpm run dev:vizij-authoring`              |
| [`vizij-standalone`](apps/vizij-standalone)                         | The face page: one face with a voice agent, in a Tauri shell.                                               | `pnpm run dev:vizij-standalone:web`         |
| [`vizij-showcase`](apps/vizij-showcase)                             | Several face experiences on one page: expressions, gaze, voice, rig controls.                               | `pnpm run dev:vizij-showcase`               |
| [`demo-vizij-player`](apps/demo-vizij-player)                       | Load a face export and drive its rig, poses, animations and programs.                                       | `pnpm run dev:demo-vizij-player`            |
| [`tutorial-fullscreen-face`](apps/tutorial-fullscreen-face)         | The smallest React app driving a face, with its walkthrough.                                                | `pnpm run dev:tutorial-fullscreen-face`     |
| [`tutorial-agent-face`](apps/tutorial-agent-face)                   | A face wired to a live Gemini agent, with its walkthrough.                                                  | `pnpm run dev:tutorial-agent-face`          |
| [`demo-animation-studio`](apps/demo-animation-studio)               | A playground for the animation engine: presets, players and their outputs.                                  | `pnpm run dev:demo-animation-studio`        |
| [`demo-graph-studio`](apps/demo-graph-studio)                       | An editor for node graphs.                                                                                  | `pnpm run dev:demo-graph-studio`            |
| [`minimal-demo-animation`](apps/minimal-demo-animation)             | The smallest page on the animation engine.                                                                  | `pnpm run dev:minimal-demo-animation`       |
| [`minimal-demo-graph`](apps/minimal-demo-graph)                     | The smallest page on the node-graph engine.                                                                 | `pnpm run dev:minimal-demo-graph`           |
| [`minimal-demo-animation-graph`](apps/minimal-demo-animation-graph) | Animation tracks feeding a node graph (URDF IK, filtering).                                                 | `pnpm run dev:minimal-demo-animation-graph` |

Each app's README says what it needs, such as an API key.

## Packages

Published on npm, for apps of your own:

- [`@vizij/render`](packages/@vizij/render): the page's canvas and the face
  slot, the GLB loader and exporter.
- [`@vizij/runtime-react`](packages/@vizij/runtime-react): a face in a React
  tree, and hooks over its values.
- [`@vizij/utils`](packages/@vizij/utils),
  [`@vizij/node-graph-authoring`](packages/@vizij/node-graph-authoring),
  [`@vizij/node-graph-react`](packages/@vizij/node-graph-react),
  [`@vizij/animation-react`](packages/@vizij/animation-react): shared helpers,
  the binding compiler, and React bindings for the engines.

## Run it

You need Node 24 and pnpm 9 (`corepack enable` provides it). From the
repository root:

```bash
pnpm install
pnpm run build:packages
pnpm run dev:vizij-authoring
```

## More

- [`CONTRIBUTING.md`](CONTRIBUTING.md): setup for working on this repository,
  checks, branches and releases.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): how the packages, the apps and
  vizij-rs fit together.
- [vizij-rs](https://github.com/vizij-ai/vizij-rs): the runtime, the face
  standard and the native `vizij` app.
