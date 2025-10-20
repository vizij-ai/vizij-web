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

## Pose Graph Export

Authoring poses in the demo produces a graph spec that the runtime can load directly:

- **Pose inputs** – Every captured pose adds an `input` node with a typed path `rig/<faceId>/poses/<pose>.weight` plus a matching `constant` node holding that pose's channel record (`pose_record_<pose>`).
- **Neutral context** – `pose_neutral_record` and `pose_offset_zero` are `constant` records that share the channel layout; the offset is a zeroed record so all operands, baseline, and offset use identical value types.
- **Blending** – All pose records feed a single `default-blend` node (`pose_blend`). Pose weight inputs are optionally gathered by `pose_weights_join` (when more than one pose is present) to drive the blend node's `weights` vector input.
- **Channel outputs** – Each standard rig channel emits through an `output` node (`out_<channelId>`) targeting `rig/<faceId>/<channel path>`. Outputs select their channel using the selector `[{ field: "values" }, { field: "<channelId>" }]` against the blended record.

The summary JSON exported alongside the graph lists the neutral values and pose deltas per channel so tooling can present the blend setup without parsing the graph spec.
