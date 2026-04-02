# Agent Notes · @vizij/arora-types

- Run commands via `pnpm --filter "@vizij/arora-types"` (`build`, `test`, `typecheck`, `clean`, `dev`).
- Treat this package as the TypeScript contract surface for Arora values and WebSocket message shapes, not as a transport or runtime implementation.
- Keep canonical slot-based names aligned with the Rust protocol surfaces (`arora-connection`, `arora-websocket`) and preserve compatibility aliases only where older client callsites still depend on them.
- Update `src/messages.contract.test.ts` whenever canonical names, aliases, or guards change so drift is caught immediately.
- Coordinate docs with `apps/vizij-standalone` and the runtime docs in `vizij-docs` when the wire contract changes.

- Before handing off substantive changes, run:

  ```bash
  pnpm --filter "@vizij/arora-types" build
  pnpm --filter "@vizij/arora-types" test
  pnpm --filter "@vizij/arora-types" typecheck
  ```
