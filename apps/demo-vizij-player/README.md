# demo-vizij-player

Bundle-first showcase for Vizij face exports. Load one bundled GLB, inspect the embedded rig and pose structure, and drive authored animations and procedural programs from a single runtime workspace.

## Scripts

- `pnpm dev` – start the local dev server.
- `pnpm build` – build the production bundle.
- `pnpm preview` – preview the production build.
- `pnpm typecheck` – run TypeScript in `--noEmit` mode.
- `pnpm lint` – run ESLint across the project.
- `pnpm test` – execute the Vitest suite.

## Workflow

- Start with one of the curated built-in samples: `Quori_Current_Extended.glb` or `Hugo_Current_Extended.glb`.
- Upload your own bundled `.glb` export when you want to validate an external face.
- The app is intentionally bundle-oriented: separate low-level rig JSON, high-level rig JSON, and standalone animation JSON imports are no longer part of the main flow.
- Diagnostics remain read-only and runtime-focused: graph inventory, registered controllers, output paths, and runtime errors.
