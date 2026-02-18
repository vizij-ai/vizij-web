# Vizij Authoring Architecture

Last updated: 2026-02-18
Audience: engineers working on `apps/vizij-authoring`

This file defines system boundaries and technical invariants.

## Source Hierarchy

1. Product and stage goals: `plans/GOAL.md`
2. Execution ordering: `plans/ROADMAP.md`
3. Implementation tasks: `plans/BACKLOG.md`
4. UI behavior contract: `UI_DESIGN.md`
5. Layer/data contract: `Authoring_Blueprint.md`

## Core System Intent

`vizij-authoring` must be runtime-truthful: authored state, compiled graph state, and runtime-applied values should remain semantically aligned.

## Domain Layers

1. Animatable layer: render-facing leaves.
2. Autorig layer: low-level rig variables that can write animatables.
3. Abstract rig layer: authored control layer that drives abstract/autorig inputs.
4. Pose layer: semantic pose definitions and grouped blends.
5. Binding layer: directed input relationships across rig layers.

## Runtime Pipeline (High-Level)

1. Load asset/bundle into render state.
2. Import/normalize rig and pose authoring state.
3. Build runtime graph spec from authoring state.
4. Compile/register runtime graph.
5. Stage input changes to graph inputs.
6. Apply evaluated outputs to scene targets.

## Store and Responsibility Boundaries

### Render store (`@vizij/render`)

Owns scene graph, animatables, and scene-facing state.

### Rig/binding authoring state

Owns standard input maps, bindings, mutations, and rig graph generation.

### Pose authoring state

Owns pose definitions, group state, and pose graph/config authoring outputs.

### Runtime graph state

Owns graph status, runtime diagnostics, and compiled graph references.

### UI/workspace state

Owns tab/layout/visibility and non-domain presentation state.

### Selection state

Owns selected entity context and traversal focus.

## Technical Invariants

1. Runtime truth:
   Current values shown in inspector resolve from runtime/autorig authority.
2. Boundary correctness:
   Abstract-rig inputs do not directly write animatables.
3. Deterministic canonicalization:
   Input path/id resolution remains stable and idempotent.
4. Import determinism:
   Migration/retarget behavior is deterministic and repeatable.
5. Selection coherence:
   One global selected item across surfaces.

## Import/Export Contract Invariants

1. Import normalizes safe face-name mismatches.
2. Invalid abstract-rig -> animatable links are remapped to autorig links where possible.
3. Export validates required runtime contract shape.
4. Runtime controls expose both rig inputs and pose-weight controls.

## Performance and Modularity Constraints

1. Heavy surfaces should avoid broad store subscriptions.
2. Hidden surfaces should not execute expensive filter/tree work.
3. Hot-path canonical resolution should rely on indexed/cached lookups.
4. Shared sync loops should be consolidated where possible.

## Change Discipline

1. If behavior contract changes, update `UI_DESIGN.md` and/or `Authoring_Blueprint.md` first.
2. If execution priority changes, update `ROADMAP.md` and `BACKLOG.md`.
3. If validation status changes, update `TRACKER.md` with command evidence.
