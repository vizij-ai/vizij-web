# demo-vizij-player

Bundle-first showcase for Vizij face exports. Load one bundled GLB, inspect the embedded rig and pose structure, and drive authored animations and procedural programs from a single runtime workspace.

## What This Demo Teaches

`demo-vizij-player` is the reference app in this repo for the current `@vizij/runtime-react` workflow:

- load one face bundle at a time from a curated sample or an uploaded `.glb`
- let `VizijRuntimeProvider` unpack embedded rig, pose, animation, and program content
- render the face with `VizijRuntimeFace`
- build operator controls from runtime metadata instead of hard-coded paths
- inspect what the runtime actually registered through diagnostics and runtime API examples

If you want to build your own runtime-react surface, this app is the closest end-to-end example in the workspace.

## Documentation

- Full walkthrough: [`docs/runtime-react-walkthrough.md`](./docs/runtime-react-walkthrough.md)
- Runtime package reference: [`packages/@vizij/runtime-react/README.md`](../../packages/@vizij/runtime-react/README.md)

The walkthrough covers:

- how a curated sample or uploaded GLB becomes a `VizijAssetBundle`
- how `VizijRuntimeProvider` extracts and merges embedded bundle content
- how the demo derives pose, animation, program, and face-control surfaces
- what the diagnostics panel is actually telling you
- how the embedded runtime API call examples map to the transport UI

## Scripts

- `pnpm dev` - start the local dev server
- `pnpm build` - build the production bundle
- `pnpm preview` - preview the production build
- `pnpm typecheck` - run TypeScript in `--noEmit` mode
- `pnpm lint` - run ESLint across the project
- `pnpm test` - execute the Vitest suite

## Current Workflow

- Start with one of the curated built-in samples: `Quori_Current_Extended.glb` or `Hugo_Current_Extended.glb`.
- Upload your own bundled `.glb` when you want to validate an external face.
- The app is intentionally bundle-oriented: separate low-level rig JSON, high-level rig JSON, and standalone animation JSON imports are not part of the main flow.
- Diagnostics are read-only and runtime-focused: graph inventory, controller ids, output paths, metadata, and runtime errors.
