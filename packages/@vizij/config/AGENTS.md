# Agent Notes · @vizij/config

- Use `pnpm --filter "@vizij/config"` for all scripts (`build`, `typecheck`, `test`, `clean`). Bundles are produced with `tsup`; keep `dist/` as the only published artefact.
- Keep definitions aligned with the renderer and WASM crates. Update `@vizij/utils` consumers if you change shared types or helpers.
- Before publishing, record a changeset and run:
  ```bash
  pnpm changeset
  pnpm version:packages
  pnpm install
  pnpm --filter "@vizij/config" build
  pnpm --filter "@vizij/config" typecheck
  pnpm --filter "@vizij/config" test
  pnpm --filter "@vizij/config" exec npm pack --dry-run
  ```
- Tag releases as `npm-config-vX.Y.Z`. The repository workflow handles the actual publish when the tag lands on `main`.
- Document schema or data changes in the README (and changelog) so downstream packages understand migration steps.
