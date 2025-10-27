# Import Reconstruction

This document tracks how we can fully restore the demo-vizij-authoring state from an exported Vizij GLB and the accompanying rig graph, without depending on the soon-to-be-removed summary artifact.

## Goal

Rehydrate the authoring application (bindings, standard inputs, feature metadata, expressions, and override values) using only:

1. The Vizij GLB containing the robot hierarchy and baked defaults.
2. The rig graph JSON describing animatable → input wiring.

The restored state should match what the author saw pre-export, aside from deliberate normalisations (e.g., regenerated labels derived from canonical paths).

## Desired Architecture

1. **Load GLB**
   - Import the Vizij hierarchy and baked animatable defaults.
   - Apply feature label overrides directly from embedded RobotData so they persist with the asset.
2. **Parse Rig Graph**
   - Reconstruct standard input declarations and their bindings by walking node/edge relationships.
   - Recover binding expressions and slot definitions from the arithmetic subgraph, populating aliases with stable defaults (`s1`, `s2`, …) when original labels are unavailable.
3. **Initialise Authoring Store**
   - Seed `bindings`, `inputBindings`, `standardInputs`, `inputValues`, and selection state from the recovered data.
   - Backfill derived metadata (auto-input grouping, feature catalogues) using existing hooks.
4. **Validate Round-trip**
   - Rebuild a graph spec from the hydrated store and diff against the imported JSON to catch drift before editing resumes.
5. **Persist Upgrades**
   - When the author re-exports, ensure any additional metadata we introduce (new feature labels, custom standard inputs, etc.) is baked into the GLB/graph pair so the next import remains lossless.

## Issues and Mitigations

### 1. Node identifier sanitisation happens late

- **Impact** – Node ids are currently normalised during graph export, so ids seen at runtime may not match author-time references, complicating import heuristics.
- **Mitigation** – Normalise ids when components and standard inputs are created so the authoring store, UI, and exporter all share the same canonical identifiers. Add an audit step when loading legacy state: if a persisted id sanitises to a different value, surface the mismatch to the author with options to accept the new id or revisit the asset before import continues.

### 2. Binding expressions lose authoring context after export

- **Impact** – The exporter materialises expressions into compute nodes and constant folds intermediates, erasing slot aliases and explicit expression text. Reconstructing readable expressions from the graph becomes lossy.
- **Mitigation** – During import, rebuild expressions by traversing the arithmetic nodes, normalising to canonical infix forms, and regenerating slot identifiers on the fly (`s1`, `s2`, …). We will drop the distinct “alias label” concept—authors will edit slot labels directly and those will persist independently of the expression reconstruction.

### 3. Derived standard input hierarchies are implicit

- **Impact** – Parent/child relationships between inputs (self slots, derived slots) collapse into generic nodes, making it non-trivial to recover which inputs fed others.
- **Mitigation** – Extend the importer to detect `input_raw_*` nodes, which the exporter emits whenever a derived input references `SELF`. Those nodes flow into remap chains leading back to the owning input’s graph path. We only fall back to constants if the exporter could not materialise a self-reference, which we will treat as an error during import. By tracing from each derived output through its remap parents and checking for `input_raw_*` sources, we can reliably rebuild the parent binding tree without additional metadata.

### 4. Remap parameter recovery

- **Impact** – Remap nodes store parameters as `input_defaults`. Missing or malformed defaults would break rehydrated bindings.
- **Mitigation** – Enforce during export that every remap node carries fully populated defaults, even when they match canonical values, then read them back verbatim on import. Add a pre-export validation pass that rejects graph specs with incomplete remap defaults so invalid assets never leave the tool.

### 5. Feature label overrides are not baked into RobotData

- **Impact** – Overrides currently live only in React state, so re-importing the GLB loses the author’s customised labels.
- **Mitigation** – During export, write the resolved labels into the RobotData features that ship with the GLB so they travel with the asset. RobotData currently stores animated features as `{ animated: true, value: AnimatableValue }`, and `AnimatableValue` already exposes a `name` field; for vector features the label derives from the surrounding feature metadata rather than the animatable name. To carry feature-level overrides we will add an optional `label` property alongside each stored feature (e.g., `{ animated: true, value, label?: string }`). Loader code needs to: (a) read the new `label` if present and seed feature catalogues with it, and (b) default to the generated label when the field is absent. Exporters targeting older assets can omit the property with no schema break because the new field is additive.

### 6. Custom standard inputs disappear when unused

- **Impact** – Inputs created by the author but not wired into any binding vanish because they never reach the graph spec.
- **Mitigation** – Always materialise custom inputs in the graph (e.g., emit placeholder `output` nodes keyed by their typed paths) so they can be rediscovered on import. If an input has no bindings, the importer can recreate it directly from the path using the default range/value conventions. Disabled state will be removed: authors will delete unused inputs instead of toggling a flag, eliminating the need to persist that bit.

### 7. Standard input metadata normalisation

- **Impact** – Input labels and groups can be regenerated from paths, but overrides to defaults, ranges, or disabled flags are not represented anywhere in the GLB/graph pair.
- **Mitigation** – Remove disabled flags entirely. Treat path-derived labels/groups as canonical and regenerate them on import. Any remap range or default overrides already live on the remap nodes, so the importer can read those parameters directly. Animatable defaults, mins, and maxes remain sourced from the GLB’s RobotData, making the graph + GLB pair the single source of truth without extra metadata.

### 8. Round-trip validation gap

- **Impact** – Without comparing the imported graph to a re-exported version, we cannot guarantee reconstruction fidelity, making silent divergence likely.
- **Mitigation** – Implement a signature check (e.g., JSON hash) immediately after import to verify the hydrated state re-emits the same graph. If the signatures diverge, block the session load, present the diff summary, and let the author explicitly choose between accepting the reconstructed version or cancelling to make manual corrections first.

---

With these decisions captured, we can now derive concrete implementation milestones for the importer, metadata writer, and validation pipeline.

## Implementation Plan (Draft)

### Phase 1 – Data Model Foundations
- **Sanitised identifiers**  
  - Update `extractAnimatableComponents`, standard-input factories, and binding creators to generate canonical, sanitised ids up front.  
  - Add an audit helper that runs during legacy state load (localStorage, imported graph) and reports any id mismatch before continuing.
- **RobotData label support**  
  - Extend the RobotData feature schema to accept an optional `label` field and update type definitions/tests.  
  - Modify GLB export helpers to write resolved labels, and adjust GLB loaders to prefer baked labels when present.
- **State clean-up**  
  - Remove the “disabled” flag from managed standard inputs, UI, and persistence.  
  - Rename slot “alias” editing surfaces to simple “label” editors so the UI matches the new expression model.

### Phase 2 – Export Path Enhancements
- Ensure `buildRigGraphSpec` emits remap nodes with fully populated defaults; add validation that blocks export if any defaults are missing.  
- When custom standard inputs exist without bindings, emit placeholder graph nodes (e.g., constant → output) so they can be discovered during import.  
- Bake feature labels into RobotData during GLB export and continue cloning animatable defaults exactly once sanitised ids are applied.

### Phase 3 – Import Pipeline
- **GLB ingestion**  
  - Load the Vizij hierarchy, animatable defaults, and baked feature labels from RobotData.  
  - Run the id audit and prompt the author if legacy ids sanitise differently.
- **Graph parsing**  
  - Enumerate graph inputs/outputs to rebuild the standard input registry (path, label/group from path, remap defaults from nodes).  
  - Trace derived input relationships by following `input_raw_*` nodes and remap chains to reconstruct parent bindings.  
  - Rebuild binding expressions by traversing arithmetic nodes, emitting canonical infix expressions, and regenerating slot identifiers (`s1`, `s2`, …).  
  - Recreate custom-but-unwired inputs directly from their placeholder outputs when encountered.
- **Authoring store hydration**  
  - Seed `bindings`, `inputBindings`, `standardInputs`, `inputValues`, feature catalogues, and selection state using the reconstructed data.  
  - Regenerate auto-input metadata (groups, catalogue entries) via the existing hooks now that canonical ids/labels are in place.

### Phase 4 – Round-trip Validation
- Rebuild a graph spec from the hydrated store.  
- Compare against the imported graph using a normalised JSON signature; if mismatched, block the session and present the diff/accept-new flow.  
- Cache the accepted signature so subsequent edits do not re-trigger the prompt unless the graph diverges again.

### Phase 5 – Migration & Compatibility
- Provide a one-time migration for persisted localStorage data: apply sanitisation, remove disabled flags, and rewrite bindings/slot labels if needed.  
  - Surface any automatic changes to the author via a toast/log entry.  
- Maintain compatibility with legacy exports by allowing the importer to fall back to path-derived labels when GLB features lack the new `label` field.

### Phase 6 – Tooling & Tests
- Add unit tests for the new sanitisation helpers, RobotData label persistence, placeholder input emission, and graph parsing utilities.  
- Create integration tests that export a project, import it, and assert the re-exported graph matches the original signature.  
- Document the new workflow (import/export expectations, mismatch handling) in demo-vizij-authoring docs and user-facing README sections.

## Progress Update

- **Completed**
  - Added optional `label` metadata to animated and static feature types and wired it through GLB export/import (RobotData now records applied feature label overrides and loaders consume the baked labels).
  - Export flow passes authoring label overrides into RobotData before writing the GLB, ensuring overrides become part of the asset.
  - Feature catalogue construction now honours labels hydrated from RobotData, falling back to overrides or generated defaults when needed.
  - Sanitised animatable component ids up front and surface id mismatches detected during legacy-load.
  - Removed the managed “disabled” flag from standard inputs and updated the UI to reflect the new always-on model.
  - Embed Vizij metadata (standard input descriptors and binding summaries) directly inside the exported graph spec.
  - Added remap-default validation to the exporter to block incomplete specs.
  - Implemented graph rehydration (parsing embedded metadata, rebuilding standard inputs/bindings, and wiring auto/custom inputs) together with round-trip signature validation and an interactive mismatch prompt.
  - Auto-populate export filenames from the current face id (stripping `_vizij` from assets) so authoring exports remain consistent.
- **Outstanding (Phases 1–3)**
  - Broaden automated coverage for the new importer/exporter path (unit tests plus end-to-end regression) and tighten error reporting for partial metadata.
  - Update user-facing docs/README with the new import workflow and metadata expectations.
  - Investigate fallback behaviour for legacy graphs without embedded metadata (e.g., provide a clearer error or migration helper).
- **Next Steps**
  1. Author automated tests validating graph metadata round-trips and importer fidelity.
  2. Refresh demo documentation to reflect the new import flow and removal of the disabled toggle.
  3. Evaluate migration tooling for legacy exports that lack embedded metadata.
