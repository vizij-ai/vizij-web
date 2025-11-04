# @vizij/node-graph-authoring

Authoring-time helpers for constructing Vizij graph specifications. The package houses the binding state utilities, expression parser, and graph builder previously embedded in the Vizij authoring app.

## Highlights

- Binding slots now carry an explicit `valueType` (`"scalar"` or `"vector"`) so downstream tooling can reason about component width, enforce slot defaults, and persist vector-aware bindings.
- The expression parser understands comparison and boolean operators (`>`, `<`, `==`, `!=`, `&&`, `||`, `!`) and maps them through shared metadata to the appropriate logic nodes.
- Graph summaries surface the slot `valueType`, making it easier to audit vector wiring in generated specs.

## Development

```bash
pnpm install
pnpm --filter @vizij/node-graph-authoring test
```

> ℹ️ Vitest 3.2 has a known bug in `startVitest('run')` that throws `TypeError: filters.map is not a function` in some workspace environments. If the test task fails with that message, upgrade Vitest or run the suite via a manual `startVitest` wrapper until the upstream fix lands.

## Build

```bash
pnpm --filter @vizij/node-graph-authoring build
```
