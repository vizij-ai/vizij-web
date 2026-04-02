# Agent Notes · @vizij/node-graph-authoring

- Run scripts with `pnpm --filter "@vizij/node-graph-authoring"` (`build`, `test`, `typecheck`, `report:ir`, `clean`, `dev`).
- Treat this package as the authoring-time graph builder and IR inspection surface, not as the runtime evaluator itself.
- Coordinate shape, metadata, and generated-graph changes with `@vizij/node-graph-wasm`, `@vizij/node-graph-react`, `apps/vizij-authoring`, and any parity fixtures or IR snapshots.
- Use the packaged CLI and existing fixture-based tests as the main guardrails for drift.
- Keep README examples and fixture-refresh notes aligned whenever CLI behavior or IR output changes.

- Before handing off substantive changes, run:

  ```bash
  pnpm --filter "@vizij/node-graph-authoring" build
  pnpm --filter "@vizij/node-graph-authoring" test
  pnpm --filter "@vizij/node-graph-authoring" typecheck
  ```
