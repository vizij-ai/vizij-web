# demo-vizij-player

A showcase for Vizij face exports: load one face GLB, inspect the rig, poses,
animations and programs its bundle carries, and drive each of them from
panels built out of what the GLB declares.

## What This Demo Teaches

`demo-vizij-player` is the reference consumer of
[`@vizij/runtime-react`](../../packages/@vizij/runtime-react/README.md) and
[`@vizij/render`](../../packages/@vizij/render/README.md):

- one face at a time, from the curated sample or an uploaded `.glb`, on the
  page's canvas (`<VizijCanvas>`, `<VizijRuntimeFace>`);
- panels built from `describe(glb)`: rig inputs, poses, animations, programs;
- every control a call on the face's `Runtime` from `@vizij/runtime`: store
  writes for rig inputs and pose weights, the animation module's transport
  and the rest module's `reset` by name, programs as interpreter runs.

The face loads with its rig, pose driver and poses only
(`options: { graphs: ["rig", "pose-driver", "pose"], program: "none" }` in
`src/App.tsx`), without the standard adaptation, so the panels drive its rig
inputs and pose weights directly; its programs start from the Programs panel.
A capability the panels need belongs in `@vizij/runtime`, not in a helper
here.

The walkthrough is [`docs/runtime-react-walkthrough.md`](./docs/runtime-react-walkthrough.md).

## Key Files

- [`src/App.tsx`](./src/App.tsx): the canvas, the provider and the workspace.
- [`src/data/samples.ts`](./src/data/samples.ts): the sources and their GLBs.
- [`src/components/FaceControlsPanel.tsx`](./src/components/FaceControlsPanel.tsx): rig inputs as sliders.
- [`src/components/PosePanel.tsx`](./src/components/PosePanel.tsx): pose weights, pulsed and held.
- [`src/components/AnimationPanel.tsx`](./src/components/AnimationPanel.tsx): the animation module's transport.
- [`src/components/ProgramsPanel.tsx`](./src/components/ProgramsPanel.tsx): programs as runs.
- [`src/components/DiagnosticsPanel.tsx`](./src/components/DiagnosticsPanel.tsx): what the device lists of itself.
- [`src/state/storage.ts`](./src/state/storage.ts): the persisted source and
  panels. Bump its `STORAGE_VERSION` whenever their shape changes, so a stored
  state of the old shape is not read back.

The curated sample is Quori from `apps/vizij-authoring/public/assets`; keep
`src/data/samples.ts` aligned with the assets there.

## Scripts

- `pnpm dev` - start the local dev server
- `pnpm build` - build the production bundle
- `pnpm preview` - preview the production build
- `pnpm typecheck` - run TypeScript in `--noEmit` mode
- `pnpm lint` - run ESLint across the project
- `pnpm test` - execute the Vitest suite

The e2e spec is `e2e/tests/demo-vizij-player-load-sample.spec.ts` (port 5200).
