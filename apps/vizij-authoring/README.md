# vizij-authoring

`vizij-authoring` authors Vizij faces: load a face, bind its rig to the face
standard, author poses, graphs and animations, and export the face as a
bundled GLB. The app runs faces on the same runtime as a deployed Vizij, so
what you author is what ships. Why that holds, and what it takes, is in
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md#the-face-runs-on-the-deployed-runtime).

## Core Workflows

- load a local GLB, URL, bundled GLB, or imported graph payload
- inspect hierarchy, properties, bindings, and live runtime values
- author expressions, drivers, and pose rigs
- validate authored output against runtime behavior
- export a bundled GLB as the primary runtime target

## Notable Current Features

- expression authoring with arithmetic, boolean logic, and validation feedback
- inline label curation and slot remapping
- auto-generated standard-input drivers with enable/disable and round-trip metadata
- grouped pose workflow with canonical pose-weight paths: `rig/{face}/poses/{poseId}.weight`
- graph import face-id safety and remapping
- live IR stats and report export hooks

## Standard Feature Spaces Editor

The Standard Feature Spaces Editor is the main interoperability workflow for standard inputs.

High-level flow:

1. load the main face
2. optionally load a reference face
3. manage the standard channel hierarchy in the Channels tab
4. author bindings in the Mapping tab

Path shape:

```text
/standard/{namespace}/{group…}/{attribute}
```

Examples, in the `vizij` namespace of the
[Vizij face standard](https://github.com/vizij-ai/vizij-rs/blob/main/docs/face-standard.md):

```text
/standard/vizij/left_eye/pos/x
/standard/vizij/expression/happy
```

A face's declared profiles (`bundle.profiles`) say which namespaces it uses.

## Export Model

Primary target:

- bundled GLB with GraphSpec + IR + assets for runtime consumers

Additional exports:

- graph/subgraph JSON
- IR snapshots

Validation rules:

- export is blocked when GraphSpec normalization/build fails
- export may proceed when IR is unhealthy, but the runtime keeps using the last known good graph payload

## Scripts

```bash
pnpm --filter vizij-authoring dev
pnpm --filter vizij-authoring build
pnpm --filter vizij-authoring preview
pnpm --filter vizij-authoring typecheck
pnpm --filter vizij-authoring lint
pnpm --filter vizij-authoring test
pnpm --filter vizij-authoring validate
pnpm --filter vizij-authoring test:e2e:smoke
pnpm --filter vizij-authoring storybook
```

Run `pnpm run build:packages` from the repository root first, and again after
changing `@vizij/render` or `@vizij/runtime-react`. A blank page with
`_jsxDEV is not a function` means the shell exports `NODE_ENV=production`:
start the dev server with `NODE_ENV=development`
([Troubleshooting](../../CONTRIBUTING.md#troubleshooting)). The e2e ports, and
running e2e from several worktrees at once, are in
[End-to-end tests](../../CONTRIBUTING.md#end-to-end-tests).

The checked-in sample faces live under [`public/assets`](./public/assets). The
other face apps load Quori from there too, so a moved or renamed asset updates
their URLs ([`ARCHITECTURE.md`](../../ARCHITECTURE.md#apps-apps)).

Firebase Hosting serves the app (site `vizij-workspace`): production deploys
from `main`, and each pull request gets a preview channel
([Deployments](../../CONTRIBUTING.md#deployments)).

## Docs

- Docs index: [`docs/README.md`](./docs/README.md)
- Architecture, and the contracts the runtime and the compiler keep:
  [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- UI behavior contract: [`docs/UI_DESIGN.md`](./docs/UI_DESIGN.md)
- Program planning/status: [`docs/plans/ROADMAP.md`](./docs/plans/ROADMAP.md), [`docs/plans/TRACKER.md`](./docs/plans/TRACKER.md)
