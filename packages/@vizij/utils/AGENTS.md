# Agent Notes · @vizij/utils

- Invoke scripts with `pnpm --filter "@vizij/utils"` (`build`, `test`, `typecheck`, `clean`, `dev`). Builds run through `tsup`; keep emitted files in `dist/`.
- Treat this package as the source of truth for shared value types. Coordinate changes with `@vizij/render`, `@vizij/animation-react`, and `@vizij/node-graph-react` before renaming or reshaping interfaces.
- Avoid adding React-specific code here—keep utilities framework agnostic.
- Prior to publishing, run:

  ```bash
  pnpm changeset
  pnpm version:packages
  pnpm install
  pnpm --filter "@vizij/utils" build
  pnpm --filter "@vizij/utils" test
  pnpm --filter "@vizij/utils" typecheck
  pnpm --filter "@vizij/utils" exec npm pack --dry-run
  ```

- Release tags follow `npm-utils-vX.Y.Z`. The shared GitHub Action will publish once the tag is pushed.
