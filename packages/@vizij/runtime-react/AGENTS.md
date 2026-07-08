# Agent Notes - @vizij/runtime-react

- Run scripts with `pnpm --filter "@vizij/runtime-react"` (`build`, `test`, `typecheck`, `lint`, `dev`, `clean`). Builds are handled by `tsup`; keep bundles in `dist/`.
- The runtime stitches together `@vizij/render`, `@vizij/orchestrator-react`, and asset bundle helpers. When updating hooks or provider props, verify the tutorial runtime (`apps/tutorial-fullscreen-face`) and any sample bundles still load without console errors.
- Keep README usage samples aligned with the orchestrator and render packages; export changes there usually require mirrored docs and new integration notes here.
- Before publishing, run:

  ```bash
  pnpm changeset
  pnpm version:packages
  pnpm install
  pnpm --filter "@vizij/runtime-react" build
  pnpm --filter "@vizij/runtime-react" test
  pnpm --filter "@vizij/runtime-react" typecheck
  pnpm --filter "@vizij/runtime-react" exec npm pack --dry-run
  ```

- Tag releases as `npm-runtime-react-vX.Y.Z`. The shared publish workflow pushes to npm automatically once the tag lands.
