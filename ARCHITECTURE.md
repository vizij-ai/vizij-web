# vizij-web architecture

How vizij-web fits together: what runs a face, how apps drive one, what each
workspace is for, and where the design docs live. How to set up, check and land
a change is in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## What runs a face

Every face in vizij-web is drawn and run by
[`@vizij/runtime`](https://github.com/vizij-ai/vizij-rs/tree/main/npm/@vizij/runtime):
one wasm module holding the vizij-rs `vizij` crate's Bevy view and, per face,
an Arora device that runs the face's graphs, programs, animations and speech.
It is the crate the native `vizij` binary is built from, so a face behaves in
these apps as it does deployed.

- **One wasm module per page.** `@vizij/runtime` is a peer dependency of
  `@vizij/render` and `@vizij/runtime-react`, so a page resolves one copy;
  two copies would each initialise a module of their own. The page mounts one
  canvas (`<VizijCanvas>`), and each face draws in a slot of it (`<Vizij>`,
  `VizijRuntimeFace`) placed over its element.
- **A face is an Arora device.** Its `Runtime` hands out the device's surface:
  `call`, `invoke`, `spawn`, `halt`, `listKeys`, the store (`setValue`,
  `writeValues`, `readValues`, `drainChanges`), `loadGraph` and
  `applyGraphEdits`, and two kinds of hold: `holdKeys` keeps store keys from
  the face's own writers, `hold` keeps a rig output at the value the face
  shows while the device writes on. The view's own calls take the face's id:
  `placeVizij`, `setView`, `setStaticFeature`.
- **The page steps the device.** `VizijRuntimeProvider` steps it every
  animation frame while the page is visible and on a timer while it is hidden,
  where browsers throttle timers and draw nothing. `run={false}` stops it,
  which is how an offscreen face costs nothing.
- **three.js draws no face.** It remains in `@vizij/render`'s GLB loader and
  headless exporter, and in the authoring app's scene maths and animation bake.

The design of the two packages over it, with every call each app makes, is
[`packages/@vizij/runtime-react/DESIGN-1.0.md`](packages/@vizij/runtime-react/DESIGN-1.0.md).

## How apps drive a face

An app drives a face through its Arora API: the methods it declares
(`invoke`) and its data store, on the keys of the **vizij face standard**
(`standard/vizij/…` under the face's rig prefix, `runtime.path(…)`), each an
`f32`. The shipped faces carry a standard adaptation that maps those keys onto
their own rig. The vocabulary is vizij-rs's
[`docs/face-standard.md`](https://github.com/vizij-ai/vizij-rs/blob/main/docs/face-standard.md);
the full intent-to-call table is section 4 of `DESIGN-1.0.md`.

- **A capability an app needs belongs in `@vizij/runtime`**, not in a helper
  in the app or in `@vizij/runtime-react`: a wrapper is a second contract to
  keep in sync with the device's.
- **A face that carries a program plays along with the app.** The program
  moves the face; the app commands it through the program's inputs (the
  conversation state, the gaze target `standard/vizij/gaze/target/{x,y,weight}`)
  and never writes the keys the program writes, such as the eye positions.
- **Speech is the device's.** `say` plays the line's audio and its visemes;
  `play_viseme` plays one viseme from an external aligner. The device's viseme
  players smooth and blend them, and `say`'s visemes own the jaw: no app moves
  the mouth from audio volume.
- **A blink is a level.** `standard/vizij/blink` closes the eyes; whoever
  blinks shapes it over time (a tween up and back), or the face's program
  blinks.
- **A program is a run.** `run_behavior` starts it and `halt` stops or pauses
  it, its outputs holding their last values; resuming is a new run, from fresh
  node state. Returning its outputs to rest is a separate, explicit step
  (`reset_keys` with `outputKeys(graph)`): a halt resets nothing.
- **A page that inspects a face's own rig** (the player's rig and pose panels,
  the showcase's rig sliders, the authoring viewport) loads it without the
  adaptation, `options: { graphs: ["rig", "pose-driver", "pose"] }`, and
  writes rig inputs and `poses/<id>.weight` directly.
- **The rig's `override/*` keys belong to the authoring app** (its inspector's
  override, see [its architecture](apps/vizij-authoring/docs/ARCHITECTURE.md));
  an app never writes them.
- **ROS4HRI is a profile for ROS robots**
  ([vizij-rs `docs/ros4hri.md`](https://github.com/vizij-ai/vizij-rs/blob/main/docs/ros4hri.md));
  apps use the vizij standard.

## Workspace map

### Packages (`packages/@vizij/*`)

- **`@vizij/render`**: the page's canvas and the face slot; the GLB loader,
  the headless exporter (`buildSceneGraph`, `exportScene`), the world store
  and the bundle types. `three` is imported only by the loader and the
  exporter; the rest takes its types at most. Used by `@vizij/runtime-react`
  and the face apps.
- **`@vizij/runtime-react`**: one face's lifecycle in React
  (`VizijRuntimeProvider`), the fan-out of its store changes, value hooks and
  `useAnimateValue`. It hands out `@vizij/runtime`'s `Runtime` unwrapped and
  adds a function only where React needs one, each justified in
  `DESIGN-1.0.md` section 5.1. Used by the face apps except
  `vizij-standalone`.
- **`@vizij/utils`**: shared value types and rig helpers, among them the rig
  pipeline's paths. Framework-agnostic: no React. Used by `@vizij/render`,
  `@vizij/node-graph-authoring` and most apps.
- **`@vizij/node-graph-authoring`**: compiles authored bindings to IR and to
  a `GraphSpec` (`buildRigGraphSpec`); the binding expression parser
  (`parseControlExpression`); the `vizij-ir-report` CLI. Used by
  `vizij-authoring` and `demo-graph-studio`.
- **`@vizij/node-graph-react`**: React provider and hooks over
  `@vizij/node-graph`; `compat.tsx` follows that package's ABI. Used by
  `vizij-authoring`, `demo-graph-studio`, `minimal-demo-graph` and
  `minimal-demo-animation-graph`.
- **`@vizij/animation-react`**: React provider over `@vizij/animation`. Used
  by `demo-animation-studio`, `minimal-demo-animation` and
  `minimal-demo-animation-graph`.
- **`@vizij/minimal-demo-ui`** (private): shared chrome for the minimal
  demos.

Each package exports from its `src/index.ts` (or `index.tsx`) only and builds
with `tsup` into `dist/`. A change to a package's API updates the apps that
use it in the same pull request.

### Apps (`apps/*`)

The face apps run on `@vizij/runtime`:

| App (package name)                             | What it is                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `vizij-authoring`                              | The authoring app; its design is [`docs/ARCHITECTURE.md`](apps/vizij-authoring/docs/ARCHITECTURE.md). |
| `vizij-standalone`                             | The face page with a voice agent, on `@vizij/runtime` directly, in a Tauri shell.                     |
| `vizij-showcase`                               | Five sections, a face each, on one canvas.                                                            |
| `demo-vizij-player`                            | One face export, its rig, poses, animations and programs driven from panels.                          |
| `tutorial-fullscreen-face` (`fullscreen-face`) | The smallest React app driving a face.                                                                |
| `tutorial-agent-face`                          | A face wired to a live Gemini agent.                                                                  |

The engine demos run the `@vizij/animation` and `@vizij/node-graph` engines,
with no face: `demo-animation-studio`, `demo-graph-studio`,
`minimal-demo-animation`, `minimal-demo-graph` and
`minimal-demo-animation-graph`.

The face apps load their sample face, Quori, from
[`apps/vizij-authoring/public/assets`](apps/vizij-authoring/public/assets)
(`Quori_Current_Extended.glb`), each by a relative URL in its own source
(`src/FaceApp.tsx`, `src/lib/faceAssets.ts`, `src/data/samples.ts`,
`src/glb.ts`): moving the file means updating each.

`apps/vizij-ws-app` tracks nothing but a `.gitignore` and is not a workspace.

### Other directories

- [`e2e/`](e2e): the workspace Playwright suite (`vizij-e2e`), one server per
  app.
- [`scripts/`](scripts): the hook installer and doctor, the wasm linker,
  `run-affected.sh` behind `validate`, the publish scripts, and the scripts
  that edit a face GLB's `VIZIJ_bundle` in place (`glb-bundle.mjs` and its
  users).
- [`.changeset/`](.changeset) and [`.github/workflows/`](.github/workflows):
  releases and CI, described in `CONTRIBUTING.md`.

## How vizij-web consumes vizij-rs

vizij-rs publishes the wasm packages from its `npm/@vizij/*`, and vizij-web
takes them from npm by version range:

| Package             | What it is                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| `@vizij/runtime`    | The Bevy view and the face's Arora device: everything an app calls on a face. |
| `@vizij/node-graph` | The node-graph engine: the authoring app's graph tooling and the graph demos. |
| `@vizij/animation`  | The animation engine of the animation demos.                                  |
| `@vizij/value-json` | The value codecs the engines and their React bindings share.                  |

A capability vizij-web needs from a face lands in vizij-rs first; once
released, a pull request here raises the range and the lockfile. Before the
release, a local vizij-rs checkout can stand in for the npm packages
(`pnpm run wasm:link`, in `CONTRIBUTING.md`). The face standard, its profiles
and mappings, the device's skills (`say`, `play_viseme`) and the ROS 2 surface
are defined and documented in vizij-rs.

## Where design docs live

- **Cross-repository architecture, roadmap and status:** vizij-docs (private).
  Its guidebook is the source of vizij.ai's public tutorials; the pages
  `/tutorials/agent-face` and `/tutorials/behind-the-face` link into
  `apps/tutorial-agent-face`, `apps/vizij-authoring`, `apps/vizij-standalone`
  and `packages/@vizij/runtime-react` on `main`. Moving or renaming one of
  those means updating vizij-docs' `public_projection_manifest.json` with it.
- **The runtime, the face standard and the device:** vizij-rs's `docs/`, its
  [`npm/@vizij/runtime` README](https://github.com/vizij-ai/vizij-rs/blob/main/npm/@vizij/runtime/README.md)
  and its `crates/vizij` README.
- **This repository:**
  - this file;
  - [`packages/@vizij/runtime-react/DESIGN-1.0.md`](packages/@vizij/runtime-react/DESIGN-1.0.md):
    `@vizij/render` 1.0 and `@vizij/runtime-react` 1.0, and how apps drive a
    face;
  - [`apps/vizij-authoring/docs/`](apps/vizij-authoring/docs): the authoring
    app's contracts, indexed by its [`README.md`](apps/vizij-authoring/docs/README.md);
  - each package's and app's `README.md`, and the tutorials' `tutorial.md`.
- **Tickets:** Linear, team VIZ.

The plans and reports under `apps/vizij-authoring/docs/plans/`,
`docs/reports/` and `docs/archive/` record their date. Check a statement in
one against the code before acting on it.
