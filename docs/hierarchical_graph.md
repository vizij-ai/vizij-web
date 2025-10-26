# Hierarchical Standard Input Remaps

## Overview
The authoring surface now supports *derived* standard inputs: virtual controls that remap one or more upstream inputs (or other derived controls) before values reach animatable slots. Authors can layer expressions, slot remaps, and aliases using the same tooling already available for animatables, enabling richer control hierarchies without editing the underlying rig graph by hand.

Key goals delivered:

- Chainable derived controls with full remap + expression metadata.
- Consistent editing experience between animatable bindings and input remaps via a shared binding editor.
- Graph exports that capture lineage so downstream runtimes understand which inputs ultimately drive each animatable target.
- Automatic persistence/migrations that keep existing rig saves valid while adding new derived mappings.

## Data Model
- `StandardRigInput` (packages/@vizij/utils/src/rig/standard-inputs.ts) now carries:
  - `parentBinding` – optional `AnimatableBinding`-shaped data describing how upstream parents (plus the local slider) blend to produce the input value.
  - `derivedChildren` – cached ids for quick UI traversal (populated in the controller).
  - Helper utilities (`cloneRemapSettings`, `cloneRigBindingDefinition`) ensure remap objects remain immutable across state updates.
- `BindingTarget` (apps/demo-vizij-authoring/src/rig/state.ts#L54) abstracts “things that can be remapped” so animatable and parent bindings share implementation.
- Parent/child bindings live alongside animatable bindings in controller state (`inputBindings: Record<string, AnimatableBinding>`).
- Persistence (`apps/demo-vizij-authoring/src/rig/persistence.ts`) stores `inputBindingDefinitions` (and a legacy `derivedStandardInputs` mirror) keyed by input id. A `schemaVersion` guard enables future migrations.

## Controller & Persistence
- `useRigController` exposes CRUD helpers for parent bindings (`handleEnsureParentBinding`, `handleParentBindingInputChange`, etc.) alongside derived-input creation. A dependency map keeps child inputs in sync when parents change or disappear.
- Parent bindings are merged into the managed input list, allowing the panel to surface lineage, controller summaries, and validation issues.
- When inputs are deleted or auto inputs disabled, the controller prunes derived chains and rebuilds the graph on the next tick.
- Loading legacy rig saves (without parent metadata) yields empty binding maps; saving re-emits the new structure transparently.

## Graph Builder & Validation
- `buildRigGraphSpec` accepts an `inputBindings` map, materialises parent aggregators (self + parents) before animatable bindings execute, and injects derived controls as discrete nodes.
- Graph summaries now include both parent and child slots so exports convey full ancestry. Cycles between derived controls are detected and reported to the UI through `bindingIssues`.
- New tests (`graphBuilder.test.ts`) cover nested remaps, parent aggregation, and cycle detection to protect against regressions.

## Authoring UI
- `BindingEditor` encapsulates slot editing, remap matrices, and expression editing. Both animatable properties and derived inputs render through this component to stay visually consistent.
- `StandardInputsSection` adds:
  - Inline parent editors (via the shared `BindingEditor`) that ensure a parent aggregator exists before exposing slots.
  - One-click creation of derived inputs seeded from an existing control, auto-opening the new child’s parent editor.
  - Child lineage display and usage chips so parents show where their value flows.
  - Slider summaries that list controlling parents and automatically disable manual overrides when the aggregator drops the `self` slot.
- Animatable editors continue using `BindingEditor`, so authoring muscle-memory transfers between panels.

## Usage Notes
1. **Create a derived input** – In the Standard Inputs panel, select *Add child* on the source control. A new custom input is generated, its parent editor opens automatically, and the source control is pre-wired as the first parent slot.
2. **Layer multiple sources** – In any parent editor, add slots for additional inputs, adjust remap ranges/expressions, and optionally keep the `self` slot to blend in the manual slider.
3. **Reference derived controls downstream** – Animatable properties can target primitive or aggregated inputs; the graph builder routes parent aggregators so downstream bindings always see the blended value.

## Testing & Validation
- Unit tests: `pnpm --filter demo-vizij-authoring test` exercises state, graph, and derived workflow coverage.
- Workspace validation: run `pnpm run prep` before committing/pushing to execute lint, type-check, build, and tests across the monorepo.

## Outstanding Follow-ups
- UX polish for nested tree visualisation and badge styling in the Standard Inputs panel.
- Documentation refresh for app READMEs and screenshots.
- Explore sharing the new binding editor with `demo-vizij-rigging` once the underlying state module migrates.
