# Agent Notes · @vizij/rig

- Run scripts with `pnpm --filter "@vizij/rig"` (`build`, `typecheck`, `test`, `clean`, `dev`). Bundles are emitted via `tsup`; keep outputs limited to `dist/`.
- Hooks depend on `@vizij/render`, `@vizij/config`, and `@vizij/utils`. When changing loader behaviour, check demo apps (`apps/demo-vizij-rigging`, `apps/demo-render-no-rig`) and update docs accordingly.
- The loaders deduplicate GLB imports based on `glb` + rig JSON. Maintain this contract if you refactor caching.
- Before publishing, run:
  ```bash
  pnpm changeset
  pnpm version:packages
  pnpm install
  pnpm --filter "@vizij/rig" build
  pnpm --filter "@vizij/rig" typecheck
  pnpm --filter "@vizij/rig" test
  pnpm --filter "@vizij/rig" exec npm pack --dry-run
  ```
- Push tags as `npm-rig-vX.Y.Z`; the shared workflow will publish once tests pass.
