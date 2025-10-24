# Agent Notes · @vizij/animation-react

- Use `pnpm --filter "@vizij/animation-react"` to run `build`, `test`, `typecheck`, `lint`, `clean`, and `dev`. Builds run through `tsup`; keep artefacts confined to `dist/`.
- Keep API changes in sync with `@vizij/animation-wasm` (published from `vizij-rs`). Update dependency ranges and value helper exports when the WASM ABI changes.
- Update the animation-focused demos (`apps/demo-animation-studio`, `apps/minimal-demo-animation`, `apps/minimal-demo-animation-graph`, `apps/demo-vizij-player`) alongside behaviour changes so examples stay accurate.
- Before publishing, generate a changeset and execute:
  ```bash
  pnpm changeset
  pnpm version:packages
  pnpm install
  pnpm --filter "@vizij/animation-react" build
  pnpm --filter "@vizij/animation-react" test
  pnpm --filter "@vizij/animation-react" typecheck
  pnpm --filter "@vizij/animation-react" exec npm pack --dry-run
  ```
- Tag releases as `npm-animation-react-vX.Y.Z`. The `.github/workflows/publish-npm.yml` job will publish once the tag pushes successfully.
