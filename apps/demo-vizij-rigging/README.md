# Vizij Rigging Demo

Author high-level emotion rigs on top of low-level Vizij mappings. Load a Vizij GLB, import the low-level graph spec exported from `demo-vizij-render`, sculpt per-input neutral values, capture emotions, blend them live, and export the resulting high-level graph plus rig configuration for reuse.

## Scripts

```bash
pnpm --filter demo-vizij-rigging dev      # Start Vite in development mode
pnpm --filter demo-vizij-rigging build    # Build the demo for production
pnpm --filter demo-vizij-rigging preview  # Preview the production build
pnpm --filter demo-vizij-rigging typecheck
```

The demo expects Vizij-compatible GLB files (as produced by `demo-vizij-render`) and the corresponding low-level graph spec (`*.graph.json`). Importing the optional summary (`*.summary.json`) enables binding diagnostics, but all playback now runs through the graph runtime.
