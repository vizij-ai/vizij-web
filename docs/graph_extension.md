# Graph Control Extension – Status

## What’s Shipped
- **Unified binding model** – `AnimatableBinding` powers animatable slots and standard-input parent aggregators, so expressions, remaps, and alias utilities work identically across the rig surface.
- **Expression + remap tooling** – The parser and graph builder emit arithmetic subgraphs for user-defined equations, now also applied to parent/child input chains.
- **Parent/child authoring** – The Standard Inputs panel exposes inline editors (via the shared `BindingEditor`) for wiring parents, blending sliders, and previewing derived inputs.
- **Graph exports** – `buildRigGraphSpec` records full lineage (slider/self → parents → animatable) and raises cycle diagnostics, ensuring downstream runtimes can reconcile control provenance.
- **Controller integration** – `useRigController` tracks input bindings, prunes dependency chains automatically, and hot-rebuilds the graph when either animatable or parent bindings change.
- **Persistence & migrations** – Rig state saves include a versioned `inputBindingDefinitions` block (with a legacy mirror); legacy saves migrate transparently with empty bindings.
- **Test coverage** – Vitest suites cover remap migration, expression graphs, parent aggregation, and cycle warnings. Tests run as part of `pnpm --filter demo-vizij-authoring test`.

## Still to Polish
- **UI polish** – Iterate on the Standard Inputs layout (group badges, nested previews) and add contextual docs/tooltips before wider rollout.
- **Cross-app reuse** – Promote the shared binding/editor primitives to `demo-vizij-rigging` once its state module migrates to the unified helpers.
- **Docs & tutorials** – Capture screenshots + walkthrough for the new parent/child flow; surface them in the authoring README/AGENTS and on internal wiki.
- **Automation** – Add smoke tests (Playwright or RTL) covering creation/edit/delete of parent bindings and derived inputs to guard against regressions.

## Validation Checklist
- `pnpm --filter demo-vizij-authoring test`
- `pnpm --filter demo-vizij-authoring typecheck`
- `pnpm run prep` (full workspace validation prior to commits/pushes)
