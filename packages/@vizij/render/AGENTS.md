# Agent Notes · @vizij/render

- Run tasks with `pnpm --filter "@vizij/render"` (`build`, `test`, `typecheck`, `lint`, `clean`). Builds run through `tsup`; keep outputs confined to `dist/`.
- Coordinate changes with consuming apps (`apps/vizij-authoring`, `apps/demo-vizij-player`, `apps/vizij-showcase`), `@vizij/runtime-react` and `@vizij/utils`. Keep the README aligned when APIs move.
- Faces are drawn by `@vizij/runtime`'s Bevy view, a peer dependency. `three` is imported only by the loader (`src/functions/load-gltf*`, `src/functions/gltf-loading/`) and the exporter (`src/functions/build-scene-graph.ts`, `src/functions/export.ts`, `src/functions/vizij-bundle.ts`); the rest imports its types at most.
- Before publishing, generate a changeset and then execute:

  ```bash
  pnpm changeset
  pnpm version:packages
  pnpm install
  pnpm --filter "@vizij/render" build
  pnpm --filter "@vizij/render" test
  pnpm --filter "@vizij/render" typecheck
  pnpm --filter "@vizij/render" lint
  pnpm --filter "@vizij/render" size
  pnpm --filter "@vizij/render" exec npm pack --dry-run
  ```

- Merging the Version Packages PR publishes; there is no release tag.
