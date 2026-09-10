# @vizij/node-graph-authoring

Authoring-time helpers for constructing Vizij graph specifications. The package houses the binding state utilities, expression parser, and graph builder previously embedded in the Vizij authoring app.

## Highlights

- Binding slots now carry an explicit `valueType` (`"scalar"` or `"vector"`) so downstream tooling can reason about component width, enforce slot defaults, and persist vector-aware bindings.
- The expression parser understands comparison and boolean operators (`>`, `<`, `==`, `!=`, `&&`, `||`, `!`) and maps them through shared metadata to the appropriate logic nodes.
- Graph summaries surface the slot `valueType`, making it easier to audit vector wiring in generated specs.

## Design Docs

`docs/` holds the design documents for the compile contract, including the two plans for multi-output ports and user-definable many-in / many-out blocks. Start at `docs/README.md`.

## IR Inspection

Use the bundled `vizij-ir-report` CLI whenever you need to peek at or diff the metadata-annotated IR graph for a set of bindings—no GraphSpec export required. The tool rebuilds the IR via `buildRigGraphSpec`, emits a normalized machine-readable dump (including registry annotations under `irGraph.nodes[].annotations.registry`), and can compare dumps for CI/regression guards.

```bash
# From either vizij-web or vizij-rs worktrees
pnpm --filter @vizij/node-graph-authoring exec vizij-ir-report \
  --input path/to/buildGraphOptions.json \
  --dump ./artifacts/robot-face.ir.json

# Compare against a baseline dump and surface structured differences
pnpm --filter @vizij/node-graph-authoring exec vizij-ir-report \
  --input path/to/buildGraphOptions.json \
  --diff ./artifacts/baseline.ir.json \
  --diff-limit 200
```

Input files follow the `BuildGraphOptions` shape (face id, component definitions, binding map, `inputs`, and optional `inputMetadata`). The CLI accepts `--dump -`/`--diff -` for piping reports between tools, and exits with `1` when a diff finds mismatches—perfect for vizij-web parity tests or vizij-rs metadata checks.

Need the inspection data inside your own scripts? Import the new helpers directly:

```ts
import {
  buildMachineReport,
  diffMachineReports,
} from "@vizij/node-graph-authoring";

const report = buildMachineReport(buildRigGraphSpec(options));
const result = diffMachineReports(report, baselineReport);
```

The normalized report mirrors the CLI output, so the same metadata-rich payloads can back snapshots, drift detection, or custom dashboards.

## Development

```bash
pnpm install
pnpm --filter @vizij/node-graph-authoring test
```

> ℹ️ Always run the suite through the CLI (`pnpm --filter @vizij/node-graph-authoring test` or `pnpm test` from this package). Vitest 3.2.x currently crashes with `TypeError: filters.map is not a function` when invoked via `startVitest('run', …)` or other direct programmatic hooks, so avoid those entry points until the upstream fix lands.

### Updating IR parity fixtures

Whenever `buildRigGraphSpec` changes the emitted GraphSpec shape, refresh the frozen fixtures that drive `src/__tests__/irParity.test.ts`:

1. Build the package so the script can import the latest graph builder:

   ```bash
   pnpm --filter @vizij/node-graph-authoring build
   ```

2. Generate the updated fixture blobs (derived inputs, reserved-variable binding, vector bindings). The easiest way is to run a small Node snippet from the monorepo root and paste the resulting JSON back into `src/__tests__/__fixtures__/graphSpecParity.ts`:

   ```bash
   node <<'NODE'
   import {
     buildRigGraphSpec,
     createDefaultBinding,
     createDefaultParentBinding,
     addBindingSlot,
     bindingTargetFromInput,
     updateBindingWithInput,
     updateBindingExpression,
   } from "./packages/@vizij/node-graph-authoring/dist/index.js";
   import { SELF_BINDING_ID } from "@vizij/utils";
   // ...construct bindings/tests exactly as in irParity.test.ts...
   // console.log(JSON for each fixture)
   NODE
   ```

   (Copy the constructor logic directly from `irParity.test.ts` so the fixture inputs stay in sync; the snippet can simply `console.log(JSON.stringify({derived, reserved, vector}, null, 2))` and you can paste the values back into the fixture file.)

3. Update the inline snapshot in the “stacked operators” test if it changes:

   ```bash
   pnpm --filter @vizij/node-graph-authoring vitest run src/__tests__/irParity.test.ts --update
   ```

These three steps keep `graphSpecParity.ts` and the inline snapshot matched to the canonical GraphSpec layout, preventing future regressions from slipping through unnoticed.

## Build

```bash
pnpm --filter @vizij/node-graph-authoring build
```
