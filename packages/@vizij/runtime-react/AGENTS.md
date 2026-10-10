# Agent Notes - @vizij/runtime-react

- Run scripts with `pnpm --filter "@vizij/runtime-react"` (`build`, `test`, `typecheck`, `lint`, `dev`, `clean`). Builds are handled by `tsup`; keep bundles in `dist/`.
- The package binds one `@vizij/runtime` face to a React tree and adds only React plumbing: the provider (the face's lifecycle and its one change drain), the value hooks and the JS tween. The `Runtime` it hands out is `@vizij/runtime`'s, unwrapped. A function that wraps or duplicates what Arora or `@vizij/runtime` provides needs a written justification in [`DESIGN-1.0.md`](./DESIGN-1.0.md) section 5.1; a missing capability is added upstream.
- `@vizij/runtime` and `@vizij/render` are peer dependencies: a page must resolve one copy of each (one wasm module, one page canvas).
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

- Merging the Version Packages PR publishes; there is no release tag.
