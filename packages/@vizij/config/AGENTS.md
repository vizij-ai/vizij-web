# Agent Notes · @vizij/config

- Use `pnpm --filter "@vizij/config"` for all scripts (`build`, `typecheck`, `test`, `clean`). The build uses `tsc`; no bundler artefacts should be committed.
- Keep definitions aligned with the renderer and WASM crates. Update `@vizij/utils` consumers if you change shared types or helpers.
- Before publishing, bump `package.json` and run:
  ```bash
  pnpm install
  pnpm --filter "@vizij/config" build
  pnpm --filter "@vizij/config" typecheck
  pnpm --filter "@vizij/config" test
  pnpm --filter "@vizij/config" exec npm pack --dry-run
  ```
- Tag releases as `npm-config-vX.Y.Z`. The repository workflow handles the actual publish when the tag lands on `main`.
- Document schema or data changes in the README (and changelog if added) so downstream packages understand migration steps.
