# Vizij Authoring Goal

Last updated: 2026-02-17
Owner: Vizij Authoring (Chris infra/runtime, Saad UX)

## North Star

Make `vizij-authoring` a runtime-truthful authoring app where the main face executes through `@vizij/runtime-react`, authoring edits flow through IR -> GraphSpec, and bundled GLB export is reliable for real runtime use.

## Product Goal

Deliver a fast, correct end-to-end loop:

1. Import (`.glb`, GraphSpec JSON, IR, bundled GLB).
2. Rig/bind/edit expressions.
3. Author and blend poses.
4. Validate compile/runtime health.
5. Export bundled GLB with required Vizij graph artifacts.

## Success Criteria

1. Main face execution is runtime-react based (no legacy eval path for main-face staging).
2. Graph updates use incremental graph-tier updates (no routine full asset reload churn).
3. IR-first behavior is enforced for runtime apply (fatal compile errors block apply; warnings are surfaced).
4. Pose authoring and blending produce runtime-valid pose graph behavior.
5. Bundled export is blocked on invalid GraphSpec and includes runtime-required graph metadata.
6. `pnpm --filter vizij-authoring typecheck` and target regression tests pass.
7. Face Variables are separated from rig metadata (`/autorig`) and exposed in dedicated control panes.
8. Pose authors can inspect all poses independently of groups, edit pose/group membership, and configure group blend modes without leaving the main authoring flow.
9. Inputs are a dedicated inspector-adjacent surface for what each item drives and what drives it.
10. Variables pane targets true external inputs only (not generated `/autorig` controls), and pose editing is centered on primary-face pose definitions first.

## Non-Goals (Current Phase)

1. Full undo/redo productization.
2. Final UI polish/theme decisions.
3. Multi-face unified runtime architecture.
4. Broad telemetry/perf instrumentation suite.
5. Website/ecosystem launch work.

## Current Phase (2026-02-17)

P0 is complete and prior P1 routing/parity tranche is complete. P1 now includes a user-experience refactor for control-surface decomposition (Variables, Poses, Pose Groups, Inputs) plus rig metadata aliasing (`/autorig`) so face control editing stays focused. Remaining scope is still aggregate pose-output binding surfacing, input-surface contract finalization, import/diagnostic completeness, and import grouping controls before moving fully into P2.
