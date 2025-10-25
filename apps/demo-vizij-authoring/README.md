# demo-vizij-authoring

The `demo-vizij-authoring` app focuses on visualising Vizij assets without a rig or orchestrator. It provides a
minimal control panel to load `.glb` files, inspect their hierarchy, and export them back to
a GLB.

## Available interactions

- **Load** – Choose a local GLB file, paste a URL, or use the bundled Hugo sample.
- **Inspect** – Hover over any rendered element to see its metadata, animatable properties,
  and current values.
- **Export** – Download the currently loaded Vizij as `scene.glb`.
- **Author expressions** – Combine multiple control slots with `+`, `-`, `*`, `/`, and parentheses; the canvas reflects changes immediately and highlights invalid math.
- **Curate labels** – Rename features inline, reset to the original asset label with a click, and see overrides at-a-glance.
- **Refine slots** – Add additional slot inputs, rename their aliases, and manage per-slot remaps without leaving the feature inspector.

## Scripts

```bash
pnpm --filter demo-vizij-authoring dev      # Start Vite in development mode
pnpm --filter demo-vizij-authoring build    # Build the demo for production
pnpm --filter demo-vizij-authoring preview  # Preview the production build
pnpm --filter demo-vizij-authoring typecheck
```

The app expects Vizij-compatible GLB files (e.g. assets produced via the Vizij pipeline or the
sample included in `public/samples`).
