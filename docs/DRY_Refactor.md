# DRY Workstream – Demo Consolidation

## Snapshot
We have eliminated the most painful duplication between `demo-vizij-authoring` and `demo-vizij-rigging` and documented the remaining consolidation tasks. The immediate focus is migrating durable primitives into `@vizij/utils` / `@vizij/render` so both demos share graph, binding, and rig metadata logic without drift.

## Completed
- **Standard inputs** – Normalisation helpers, id/path derivation, cloning utilities, and parent-binding metadata now live in `@vizij/utils/src/rig/standard-inputs.ts`. Both demos can build on the same shape.
- **Remap/binding core** – `BindingTarget`, binding creation, slot management, and remap sanitisation are unified inside authoring’s rig state module, ready to promote once rigging migrates.
- **Graph helpers** – Expression parsing plus remap/aggregator materialisation sit in `buildRigGraphSpec`; tests cover parent blending, nested remaps, and cycle detection.
- **Shared UI primitive** – `BindingEditor` encapsulates slot/remap/expression editing and is reused by animatable and derived controls. Rigging can adopt it with minimal glue.

## Current Focus
| Theme | Actions |
| ----- | ------- |
| Asset loading | Extract `useVizijAssetLoader` + helper utilities into `@vizij/render`, with knobs for namespace stripping and store reset so rigging can drop bespoke loader code. |
| Animatable metadata | Promote bounds + metadata builders from authoring into `@vizij/utils`, delete the rigging copy, and add coverage to protect the migration. |
| Remap strategy | Publish the centered remap helpers as the canonical implementation; provide a compatibility adapter for rigging’s linear remaps (or migrate rigging outright). |
| Graph utilities | Move shared pieces (`buildRigInputPath`, constant lifting, join wiring) under `@vizij/utils/node-graph` so pose/rig builders compose common primitives. |
| Driver schema | Finalise a shared `RigDriver` contract plus adapters from each app’s state; this unlocks a configurable graph builder in a follow-up PR. |

## Roadmap
1. **Module extraction** – Ship the shared helpers (standard inputs, animatable metadata, remap logic) as reusable packages; update both demos to consume them.
2. **Driver unification** – Introduce a shared driver schema + adapters and ensure exports/tests consume it.
3. **Configurable builder** – Layer a pluggable graph builder on top of the driver schema so demos supply configuration instead of bespoke implementations.
4. **UI convergence** – Adopt the shared binding/editor components across demos; consolidate styling/validation.
5. **Cleanup** – Remove legacy code paths, align documentation, and wire CI to the new shared modules.

Keep this note updated as milestones land—the table above should always reflect the next actionable DRY tasks.
