# Agent Notes · @vizij/render

- Run tasks with `pnpm --filter "@vizij/render"` (`build`, `test`, `typecheck`, `lint`, `clean`). Builds run through `tsup`; keep outputs confined to `dist/`.
- Coordinate changes with consuming apps (`apps/demo-vizij-authoring`, `apps/demo-vizij-player`, `apps/demo-vizij-rigging`) and `@vizij/utils`. Keep README snapshots and component docs aligned when APIs move.
- Dependencies like `three`, `@react-three/fiber`, and `zustand` must stay in sync with the demo apps. If you bump them, run the apps locally to confirm nothing regresses.
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
- Push tags in the form `npm-render-vX.Y.Z`. The GitHub Action handles the actual `npm publish`.
