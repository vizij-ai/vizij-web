# Vizij Authoring Naming & Control Architecture

This document explains how Vizij authoring keeps renderable objects, animatable
values, and authoring controls aligned. It reflects the current pipeline after
the recent naming improvements.

## Core Entities

### Renderable Objects (Shapes / Groups)
- Defined by `@vizij/render` in the scene graph (`world` store in
  `useRigController`).
- Carry a mutable `name`, `id`, `type`, and a set of feature slots
  (`translation`, `rotation`, `scale`, etc.).
- Users primarily interact with them through the “Animatable Mapping” tree.

### Animatable Values
- Each animated feature on a renderable is an `AnimatableValue`
  (`packages/@vizij/utils`).
- Extraction is done by `extractAnimatableComponents`, which flattens complex
  values into component-level `AnimatableComponent`s used for binding and graph
  nodes.
- Metadata:
  - `id`: stable path used in the GLB graph (`renderableId:feature:component`).
  - `name`: editable label surfaced in the metadata panel.
  - `pub.output`: optional display label (also author-editable).

### Authoring Controls (Standard Inputs)
- Represented by `StandardRigInput` descriptors.
- Come from two sources:
  1. Preset “standard” inputs (`STANDARD_RIG_INPUTS`) shipped with the tooling.
  2. Auto-generated inputs built from the current scene via
     `buildAutoRigInputBlueprints`.
- Each descriptor includes:
  - `path` (e.g. `/border_chinud_c/curve/color`).
  - `group` (first significant path segment).
  - Optional `sourceId` tying the control back to its generating feature.
  - Optional overrides (label, range, default, parent binding metadata).
- Stored in React state (auto + custom maps) and persisted to local storage.

## Generation & Management Pipeline

1. **Scene Load**
   - GLB import populates `world` and `animatables`.
   - `useFeatureCatalogue` builds `FeatureEntry` data combining renderable
     features, labels, and resolved animatable descriptors.

2. **Auto Input Blueprints**
   - `buildAutoRigInputBlueprints` walks entries, generating slug-based paths.
   - Standard inputs use prefixed `/standard/...` paths.
   - Auto inputs map renderable/feature/component to a unique slug string and
     assign a `sourceId` in the form
     `component:<renderableId>:<featureKey>:<animatableId>:<componentId>`.

3. **Controller State (`useRigController`)**
   - Reconciles presets + auto-generated + custom inputs into managed lists.
   - Maintains input bindings, parent/child links, and value overrides.
   - Handles persistence by storing lightweight descriptors in local storage
     keyed by face id.

4. **Export (`buildRigGraphSpec`)**
   - Emits a node graph with authoring metadata:
     - `vizij.faceId`
     - `vizij.inputs[]` (id, path, label, group, default, range, `sourceId`)
     - `vizij.bindings[]` (binding summaries).
   - Graph is canonicalised so reimporting yields the same spec when nothing
     changes.

5. **Import (`rehydrateRigDataFromGraph`)**
   - Rebuilds `StandardRigInput` descriptors from metadata.
   - Matches auto inputs via `sourceId` when present, falling back to path for
     legacy exports.
   - Rehydrates input and animatable bindings, then reconstructs the graph to
     verify equivalence (with an author confirmation when mismatched).

## Naming Behaviour

### Renderable Renames
- Triggered from the Animatable Mapping tree (inline input on the shape row).
- `handleRenameShape` updates the renderable in the store and normalises the
  slug using `normalizeStandardRigGroup`.
- Propagates to controls via `renameInputsForShape`:
  - Auto inputs and custom inputs whose first non-standard path segment matches
    the old slug are regenerated with the new slug.
  - Standard preset inputs (`/standard/...`) are left untouched to preserve the
    canonical mapping expected by the runtime.
  - Input ids are recomputed; bindings, input values, and persisted overrides
    are remapped to use the new ids.
  - Auto-input metadata (root names, source paths) is refreshed so future
    exports/imports remain aligned.
  - Selection filters (`selectedStandardInputRoots`/`Subgroups`) are updated to
    the new slug to keep the UI state consistent.

### Animatable Metadata Renames
- Edits to the “Name” or “Display Label” fields in the metadata panel mutate
  `AnimatableValue.name`/`pub.output` via `updateAnimatableDescriptor`.
- These values influence display labels and the generated default names for
  controls but do not alter the underlying binding ids, keeping graph exports
  stable.

### Control Path Changes
- Manual path edits in the Standard Inputs section call
  `handleUpdateStandardInput`.
  - Custom inputs: path is normalised, uniqueness-checked, and new group slug
    derived. Ids are recomputed consistent with the path.
  - Auto inputs: paths remain derived from the renderable slug. Override edits
    (label/range/default) are persisted, but the pipeline ensures the path
    tracks the scene layout.
- Source IDs are currently managed internally; the inspector no longer exposes
  them to avoid confusion. The rename pipeline keeps them in sync automatically.

## Export / Import Consistency

1. **Deterministic IDs**
   - `StandardRigInput.id` is derived from the normalised path, so once paths
     stabilise every export reuses the same ids.
   - When renames occur, bindings and input maps are remapped to the new ids,
     preventing stale entries from persisting.

2. **Metadata Preservation**
   - Exported `vizij.inputs[].sourceId` lets imports remap controls even if
     paths changed since the graph was authored (e.g. renderable rename).
   - Overrides (labels, ranges, defaults) are stored alongside the path and
     applied on import; values that match regenerated defaults are pruned to
     keep metadata succinct.

3. **Graph Verification**
   - After import, the controller rebuilds the graph via
     `buildRigGraphSpec` and compares the normalised signature to the
     imported spec. Any divergence (e.g. missing blueprint inputs, altered
     bindings) triggers a confirmation prompt so authors can reconcile.

4. **Persistence Migration**
   - Local storage data is keyed per face id. On load, persisted auto-input
     descriptors are migrated to include `sourceId` and normalised paths,
     ensuring legacy saves inherit the new rename logic.

5. **When Renaming Occurs**
   - Renaming renderables or animatable metadata updates both the live store
     and the persisted auto-input map. Subsequent exports reflect the new names.
   - Re-importing the exported graph matches controls via `sourceId` and the
     updated slug, so the imported setup mirrors the exported authoring state.

## Remaining Work & Considerations

- **Legacy Graphs Without Source IDs**: For very old exports, metadata may lack
  `sourceId`. The importer falls back to path matching, which can reintroduce
  duplicates if the path structure diverged significantly. Running the current
  toolchain once and re-exporting updates the metadata to the modern format.

- **Batch Renames / Nested Structures**: The current rename pipeline focuses on
  top-level renderable slugs. If intermediate path segments (subgroups) need
  renaming en masse, additional tooling would be required to rewrite deeper
  segments consistently.

- **UI Feedback**: Inline rename inputs assume valid slugs. We normalise the
  underlying slug but still display the author-entered value; consider surfacing
  an indicator when normalisation alters characters (e.g. spaces → underscores).

- **Automation Hooks**: External scripts (CLI/batch) that mutate renderable
  names should call the same rename handler or mimic its logic to keep controls
  in sync.

With these mechanics, animatable objects, their controls, and their exported
representations stay coherent: rename once, export, re-import, and the graph
rebuild reproduces the same authoring state. Continuous use of the current
import/export pipeline ensures the workspace doesn’t accumulate outdated names
or duplicate inputs.
