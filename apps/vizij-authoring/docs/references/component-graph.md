# Component import graph

Two generated views of what imports what under `src/components`, produced by
static analysis rather than by hand — so they cannot drift from the code.

```bash
pnpm --filter vizij-authoring graph:components
```

That writes the `.d2` sources. To render:

```bash
d2 --font-regular <Questrial-Regular.ttf> docs/references/component-graph-layers.d2 docs/references/component-graph-layers.svg
```

## The two views

**`component-graph-layers.svg`** — every edge aggregated to layer granularity.
This is the architecture check: it answers whether the `ui/` → `editor/` →
feature direction actually holds. Read it top-down; every edge should point
downward, and any edge that does not is a layering violation.

**`component-graph-detail.svg`** — per-component nodes for the three _portable_
layers (`ui/`, `editor/`, `common/`) and the edges between them. This is the
packaging check: it shows exactly which primitives a reusable component drags
along with it, which is the thing you need to know before extracting one.

Feature-code consumers are deliberately **not drawn** in the detail view. 48
files importing 27 primitives renders as a 12,000px-wide hairball, and the layers
view already summarises that direction. The information survives as the `←N`
count in each node's label: the number of distinct feature files importing it.

## What the current graph says

- **The layering holds.** No edge runs from `ui/` or `editor/` up into feature
  code. The two cross-layer edges inside the portable set —
  `editor/molecules/WorkbenchPanel` → `ui/` (Badge, Button, Tooltip) and
  `common/SidebarSection` → `ui/CollapsibleGroup` — both point the right way.
- **`Button ←39` is the load-bearing primitive**, followed by `Input ←12`,
  `Chip ←11`, `Select ←9`, `Panel ←9`. Any change to `Button` is an app-wide
  change; this is why it got its own migration phase.
- **Two feature files import `radix-ui` directly** —
  `inspector/RiggingMaterialSection.tsx` and `panels/HierarchyPanel.tsx`,
  bypassing the primitive layer. Those are the two Popovers converted during the
  Base UI removal. Not wrong, but they are the only feature-level dependency on
  the primitive substrate, and they would block extracting those files as-is.
- **`lucide-react` is still reached from `ui/` in 4 places.** The plan is to move
  `ui/`'s icons to `@tabler/icons-react` (already used in 5) and leave feature-code
  lucide alone, so those 4 edges are the remaining work, not the whole 36.

## Reading caveats

- `*.stories.tsx` and `*.test.tsx` are excluded. They import downward by
  definition and would imply runtime dependencies that do not exist.
- Edge labels are **import-statement counts, not call-site counts**. A file that
  imports `Button` once and renders it 40 times contributes 1.
- Barrel imports (`from "../ui"`) are attributed to the file that actually owns
  each imported symbol, via an exported-symbol table — `ui/index.ts` is
  `export *` only, so without that table every barrel import would fan out to all
  27 primitives. Barrel-derived edges are drawn **dashed**.
- The analyser is regex-based, not a TypeScript program. It is accurate for this
  codebase's import style; it would need real parsing for dynamic `import()` or
  `require`.
