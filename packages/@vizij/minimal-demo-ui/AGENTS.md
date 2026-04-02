# Agent Notes · @vizij/minimal-demo-ui

- Run scripts with `pnpm --filter "@vizij/minimal-demo-ui"` (`build`, `typecheck`, `lint`, `clean`, `dev`).
- Treat this package as shared presentation chrome for the minimal demo apps, not as a place for runtime-specific logic.
- Keep the API small and stable because `minimal-demo-animation`, `minimal-demo-graph`, `minimal-demo-animation-graph`, and `minimal-demo-orchestrator` depend on it for lightweight shell structure.
- Coordinate visual or API changes with those apps so they remain consistent and easy to use as regression surfaces.

- Before handing off substantive changes, run:

  ```bash
  pnpm --filter "@vizij/minimal-demo-ui" build
  pnpm --filter "@vizij/minimal-demo-ui" typecheck
  ```
