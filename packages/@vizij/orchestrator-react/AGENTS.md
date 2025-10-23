# Agent Notes · @vizij/orchestrator-react

- Invoke scripts with `pnpm --filter "@vizij/orchestrator-react"` (`build`, `test`, `typecheck`, `lint`, `clean`). Builds run through `tsc`.
- Keep this package aligned with `@vizij/orchestrator-wasm`. When the WASM crate changes ABI versions, update dependency ranges, helpers, and docs together.
- Check orchestrator-focused demos (`apps/demo-orchestrator`, `apps/demo-animating-faces`) after modifying hooks or provider behaviour.
- Before publishing, run:
  ```bash
  pnpm install
  pnpm --filter "@vizij/orchestrator-react" build
  pnpm --filter "@vizij/orchestrator-react" test
  pnpm --filter "@vizij/orchestrator-react" typecheck
  pnpm --filter "@vizij/orchestrator-react" exec npm pack --dry-run
  ```
- Push tags as `npm-orchestrator-react-vX.Y.Z`; the shared GitHub Action handles the npm publish.
