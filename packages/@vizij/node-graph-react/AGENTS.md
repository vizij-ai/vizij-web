# Agent Notes · @vizij/node-graph-react

- Run commands via `pnpm --filter "@vizij/node-graph-react"` (`build`, `test`, `typecheck`, `lint`, `clean`, `dev`). Bundles are produced with `tsup`; declarations live in `dist/`.
- Coordinate ABI or API changes with `@vizij/node-graph-wasm` (from `vizij-rs`). Update dependency versions and ensure compatibility helpers (`compat.tsx`) evolve in lock-step.
- Maintain documentation and demos (`apps/demo-graph-studio`, `apps/minimal-demo-graph`, `apps/minimal-demo-animation-graph`) when adding or removing hooks.
- Pre-publish checklist:
  ```bash
  pnpm changeset
  pnpm version:packages
  pnpm install
  pnpm --filter "@vizij/node-graph-react" build
  pnpm --filter "@vizij/node-graph-react" test
  pnpm --filter "@vizij/node-graph-react" typecheck
  pnpm --filter "@vizij/node-graph-react" exec npm pack --dry-run
  ```
- Tag releases as `npm-node-graph-react-vX.Y.Z`. The GitHub Action handles the publish step automatically.
