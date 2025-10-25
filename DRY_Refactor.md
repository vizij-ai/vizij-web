# DRY Opportunities: `demo-vizij-authoring` & `demo-vizij-rigging`

## Overview
- Audited both apps with a focus on loader flows, rig metadata, graph generation, and utility helpers.
- Identified overlapping logic that can migrate into `@vizij/render` (render runtime + store integration) and `@vizij/utils` (pure data helpers).
- Below captures the concrete duplicates, the target shared modules, and a phased migration plan that keeps both demos aligned while reducing maintenance surface.

## Shared Modules & Utilities to Extract

### Asset loading & store hygiene
- `useVizijAssetLoader` centralises GLB loading, store reset, and root detection in `apps/demo-vizij-authoring/src/hooks/useVizijAssetLoader.ts:9-84`.
- `apps/demo-vizij-rigging/src/App.tsx:61-120` reimplements `findRootId`, download helpers, namespace stripping, and loader state (`loadAsset` at `apps/demo-vizij-rigging/src/App.tsx:693-739` mirrors the hook’s responsibilities).
- **Proposal:** Move `findRootId` plus a configurable asset loader hook into `@vizij/render`. The hook should accept options for namespace stripping (`stripNamespaceValues` at `apps/demo-vizij-rigging/src/App.tsx:68-81`), initial `values` reset, and success callbacks so both demos can share the same flow while preserving rigging’s extra bookkeeping.

### Standard rig input metadata
- Both apps define the `StandardRigInput` shape and derive ids/paths:
  - Normalisation helpers live in `apps/demo-vizij-authoring/src/rig/standardRigInputs.ts:24-127`.
  - Rigging hard-codes the same type plus a static catalogue in `apps/demo-vizij-rigging/src/low-level/standardRigInputs.ts:1-167`.
- **Proposal:** Create `@vizij/utils/rig-inputs` exporting:
  1. Normalisation + label/group derivation.
  2. A shared `STANDARD_RIG_INPUTS` seed list and lookup map (hydrated via the same helpers).
  3. Factory helpers (`createStandardRigInput`, `createStandardRigInputFromPath`) so authoring can still add custom paths while rigging consumes the vetted catalogue.

### Animatable metadata & bounds calculation
- Both apps derive component metadata, fallbacks, and ranges:
  - Authoring version (with refactored bounds) sits in `apps/demo-vizij-authoring/src/rig/animatableMetadata.ts:1-408` plus `apps/demo-vizij-authoring/src/rig/bounds.ts:1-68`.
  - Rigging ships an earlier copy in `apps/demo-vizij-rigging/src/low-level/animatableMetadata.ts:1-408`, including redundant logging and duplicated math.
- **Proposal:** Promote the authoring implementation (split into bounds + metadata) to `@vizij/utils/rig-animatables`. Rigging can consume it directly, dropping custom console logging while guaranteeing both apps emit identical component ranges and value builders.

### Remap state & binding defaults
- Both demos track `BindingMap`, `RemapSettings`, and default rig input values:
  - Authoring’s extended remap model (anchors + in/out spans) lives in `apps/demo-vizij-authoring/src/rig/state.ts:1-296`.
  - Rigging keeps a simplified `inMin/inMax` variant in `apps/demo-vizij-rigging/src/low-level/state.ts:1-120`.
- **Proposal:** Consolidate into a single shared module that exposes two strategies:
  1. **Centered remap** (authoring) with anchor awareness.
  2. **Legacy linear remap** (rigging) kept as a thin adapter or migrated to the centered form by adjusting rigging UI expectations.
- Shared exports would cover `createDefaultBindings`, `createDefaultInputValues`, `updateBindingWithInput`, `remapValue`, and `reconcileBindings`, keeping one authoritative implementation and eliminating divergent logic.
- Aligning on this shared remap contract is a prerequisite for the longer-term generic rig graph builder (see below) so every consumer can pass the same `BindingMap` + strategy flag and receive consistent node graphs.

### Graph generation helpers
- Both apps build `GraphSpec`s and duplicate helper logic:
  - Authoring: `buildRigGraphSpec` in `apps/demo-vizij-authoring/src/rig/graphBuilder.ts:38-314` redefines `buildRigInputPath`, `sanitizeNodeId`, join-node creation, and constant lifting.
  - Rigging: `buildPoseGraphSpec` in `apps/demo-vizij-rigging/src/rigging/graphBuilder.ts:11-217` repeats `buildRecordValue`, `sanitizeId`, and path construction via `buildRigInputPath`.
- **Proposal:** Extract foundational helpers into `@vizij/utils/node-graph`:
  1. Path sanitation (`buildRigInputPath`, `sanitizePathSegment`).
  2. Constant record builders (`buildRecordValue`).
  3. Shared node/edge utilities (join wiring, constant lifting) as composable functions both builders call.
- Longer-term, consider a generic “rig graph builder” that accepts bindings + pose definitions, allowing authoring and rigging to specialise via config rather than bespoke implementations.

#### Longer-term: configurable rig graph builder
- Envision a shared builder (likely exported from `@vizij/utils/rig-graph`) that consumes a normalised rig descriptor:
  ```ts
  interface RigGraphConfig {
    faceId: string;
    inputs: StandardRigInput[];
    bindings: BindingMap;
    remapStrategy: "centered" | "linear" | RemapStrategyFn;
    poses?: PoseDefinition[]; // optional for authoring-style exports
    options?: {
      emitBindingSummary?: boolean;
      neutralInputs?: Record<string, number>;
      namespace?: string;
    };
  }
  ```
- The builder would orchestrate several stages:
  1. **Input stage:** ensure every `StandardRigInput` becomes an `input` node (using `buildRigInputPath`), applying the configured remap strategy to produce either `centered_remap` nodes or whatever mapping primitive we standardise on.
  2. **Animatable stage:** group bindings by animatable, emit constants for untouched components, and wire joins/output nodes. This encapsulates logic currently duplicated in `buildRigGraphSpec`.
  3. **Pose layering stage (optional):** when `poses` are present, compose the neutral record, zero offset, pose constants, weight inputs, and blend network currently handcrafted in `buildPoseGraphSpec`. Consumers can opt-in or provide a custom composer for future workflows (e.g., viseme banks).
  4. **Summary stage:** produce a normalised summary payload (bindings, input path list, pose deltas) so UIs and exporters read a single shape regardless of caller.
- Configuration points (e.g., `remapStrategy`, `poses`, `namespace`) let authoring and rigging feed tailored data while sharing 90% of the builder implementation. Future demos (minimal rigs, automated QA tooling) would get graph export “for free” by filling the same config object.

#### Impact on remap state & defaults
- A single graph builder demands a shared contract for remap values. Consolidating remap logic (see the previous section) becomes a prerequisite so both apps hand the builder the same `BindingMap` structure.
- The builder can internally resolve remap behaviour by invoking a strategy function (`centered` vs `linear`). That means legacy rigging behaviour becomes just another strategy implementation—no bespoke node wiring required in the app.
- Centralising remap handling allows us to:
  - Persist one canonical default factory (`createDefaultRemap`) that guarantees the builder and UI remain in sync.
  - Support multi-profile exports (e.g., “authoring preview” vs “runtime clamp”) by swapping strategy functions without rewriting node composition logic.
  - Embed validation (clamping ranges, ensuring `inLow < inHigh`) at graph-build time so both demos surface consistent errors before writing files.

### Download & file helpers
- Authoring exports `downloadBlob` (`apps/demo-vizij-authoring/src/utils/download.ts:1-11`), while rigging inlines `downloadJSON` (`apps/demo-vizij-rigging/src/App.tsx:116-124`).
- **Proposal:** Add `@vizij/utils/browser/download` helpers covering blob + JSON downloads (filename normalisation, `URL.revokeObjectURL`, etc.) so both demos call the same utility.

### Face & asset naming utilities
- Authoring provides `sanitizeFaceId`, `normaliseAssetLabel`, and `deriveAutoFaceId` in `apps/demo-vizij-authoring/src/utils/faceId.ts:1-38`.
- Rigging reimplements slugging via `sanitizeSlug` (`apps/demo-vizij-rigging/src/App.tsx:84-91`) and face-id derivation when exporting configs (`apps/demo-vizij-rigging/src/App.tsx:1009-1015`).
- **Proposal:** Move the authoring helpers into `@vizij/utils/rig-ids`, expose slug/label helpers, and make rigging reuse them to avoid inconsistent naming.

### Raw value cloning & equality
- Authoring’s `cloneRawValue` and `rawValuesEqual` live in `apps/demo-vizij-authoring/src/utils/rawValue.ts:3-25`.
- Rigging duplicates the deep clone in-place when converting staged graph values (`apps/demo-vizij-rigging/src/App.tsx:579-583`).
- **Proposal:** Export these helpers from `@vizij/utils` so both apps share identical deep-clone semantics (important for GLB export and pose capture).

### Namespace cleanup during loads
- `stripNamespaceValues` in `apps/demo-vizij-rigging/src/App.tsx:68-81` is specific to multi-graph usage but generally applicable whenever we isolate demo namespaces.
- **Proposal:** Fold this into the shared asset loader hook (see above) as an optional configuration flag so rigs don’t maintain bespoke store hygiene.

## Migration Plan
1. **Stabilise shared APIs**
   - Define TypeScript contracts for rig inputs, animatable components, remap settings, and graph helpers inside `@vizij/utils`.
   - Write unit tests mirroring existing coverage (`apps/demo-vizij-authoring/src/rig/state.test.ts:1-47`, `apps/demo-vizij-rigging/src/rigging/graphBuilder.test.ts:1-178`) before moving code.

2. **Extract rig metadata helpers**
   - Move `standardRigInputs`, bounds calculators, and animatable metadata into `@vizij/utils`, exporting factories plus the default catalogue.
   - Update both apps to import from the shared module; delete local copies.

3. **Unify remap state**
   - Implement a shared remap module accommodating centered + linear behaviour behind configuration flags (default to centered and keep a `legacyLinear` helper temporarily).
   - Migrate rigging to the new API, adjust UI clamps if legacy behaviour changes, and expand unit tests to cover both modes.

4. **Centralise asset loading**
   - Lift `findRootId` and the loader hook into `@vizij/render`.
   - Enhance the hook with options for namespace stripping, selection reset, and post-load callbacks so rigging can reuse it without losing custom behaviour.
   - Replace `loadAsset` + `stripNamespaceValues` in rigging with the shared hook.

5. **Share graph builder utilities**
   - Extract `buildRigInputPath`, `sanitize*`, and record/constant helpers into a shared module.
   - Refactor both `buildRigGraphSpec` and `buildPoseGraphSpec` to consume the shared utilities; keep app-specific orchestration (pose blending vs. binding remap) close to the respective apps.

6. **Consolidate browser helpers**
   - Publish `downloadBlob`/`downloadJSON`, face-id utilities, and raw value cloning from `@vizij/utils`.
   - Update exporting flows (GLB, graph, rig config) to use the shared helpers and remove inline implementations.

7. **Documentation & verification**
   - Update package READMEs to describe the new exports.
   - Re-run existing demo tests plus `pnpm run prep` to ensure the shared modules do not break current behaviours.

## Considerations & Follow-ups
- Keep API surface stable: introduce helpers as additive exports, then deprecate app-local copies once both demos migrate.
- Coordinate any behaviour changes (e.g., adopting centered remaps in rigging) with UX expectations; adjust UI copy and tests accordingly.
- After consolidation, consider wiring these helpers into the minimal demos so future features (like graph exports) automatically benefit from shared fixes.

## Unified Rig Graph Vision

### Long-term outcome
- Treat “inputs” as graph authoring primitives rather than app-specific concepts. Whether an author maps a controller to an animatable, to a higher-level rig channel, or to a pose blend node becomes a configuration choice driven by graph topology.
- Allow any node to feed any other node, with shared tooling to detect conflicts (multiple writers to the same target path) and resolve them via blend strategies (additive, equal-weight, user-weighted).
- Enable authoring UIs to mix remap-style driven animatables and pose blends in the same workspace. For example, craft a pose that targets animatables directly, then add another layer that remaps a joystick to those same animatables, letting the user choose how they co-exist.
- Deliver graph exports that describe this composition in a single spec, so downstream runtimes do not care which demo produced it.

### Implications for stage 1 (modularisation)
- Stage 1 still holds: extracting shared helpers into `@vizij/utils`/`@vizij/render` is a prerequisite. Unifying remap types, graph utilities, and loader flows reduces the surface area when we layer advanced behaviour later.
- While refactoring, prefer neutral terms (`RigNode`, `Binding`, `Driver`) and avoid hard-coding assumptions (e.g., “binding -> animatable only”) so the APIs remain extensible.
- Shared modules should expose data structures that can represent both current flows and future mixed-mode workflows. For instance:
  ```ts
  interface DriverBinding {
    sourceId: string;        // standard input, pose weight, higher-level node
    targetPath: string;      // animatable path or intermediate node
    transform?: RemapSettings | PoseBlendSettings;
    priority?: number;       // future conflict resolution hook
  }
  ```
  Even if we initially populate `transform` with remap settings only, keeping the shape flexible saves rework.

### Additional considerations
- **Conflict detection & resolution:** Today, only one binding targets a given animatable. Unified graphs must allow multiple drivers. Plan for a resolver that:
  1. Scans bindings, groups by `targetPath`.
  2. Emits blend nodes automatically when >1 driver exists.
  3. Applies strategy metadata (additive vs weighted) that authors configure per conflict cluster.
- **Pose vs remap parity:** Poses currently manipulate rig inputs, while remaps target animatables. To converge:
  - Normalise pose definitions so they can reference animatable ids or standard input ids interchangeably.
  - Ensure graph builders can emit either `default-blend` nodes or `centered_remap` nodes for any target, depending on author tooling.
- **Graph abstractions:** Consider expressing the graph builder as a pipeline that accepts:
  1. **Drivers:** raw author intents (pose definitions, remap bindings, keyed animation clips, etc.).
  2. **Resolution policies:** strategies for conflicts, namespaces, and default fallbacks.
  3. **Output templates:** which node patterns to use (e.g., blend node type, remap node type).
  This separation allows us to add new driver types (e.g., audio-reactive inputs) without rewriting the core builder.
- **UI/authoring model:** Both apps will need consistent editing metaphors:
  - Selection view that shows which drivers affect a given target.
  - Ability to create a new input that pipes into a pose blend or directly into animatables.
  - Visualization of resulting blend stacks for debugging.

### Roadmap towards convergence
1. **Stage 1 (in-flight):** Extract shared modules (standard inputs, animatable metadata, remap logic, graph helpers) and align data contracts.
2. **Stage 1.5:** Introduce a shared “graph driver” schema plus conversion utilities to translate existing authoring and rigging state into it. This can live alongside existing structures until migration is complete. *(Implemented: `@vizij/utils` now exports the driver model, and both demos expose adapters that emit `RigDriverGraph` snapshots.)*
3. **Stage 2:** Build the configurable graph builder that consumes the driver schema, supports both remap and pose transforms, and emits conflict-free graphs with automatic blend insertion. Both apps gradually switch to this builder. *(Implemented: `@vizij/utils/src/rig/graph-builder.ts` generates scalar blend graphs from `RigDriverGraph`; adapters include tests to ensure compatibility. Next step is to wire it into the runtime export paths once vector targets are covered.)*
4. **Stage 3:** Unify UI workflows:
   - Allow rigging to create remaps and custom inputs.
   - Allow authoring to capture poses that operate on animatables or rig inputs interchangeably.
   - Offer a shared inspector for conflict resolution strategies.
5. **Stage 4:** Deprecate legacy builders/state once both apps rely on the shared driver schema and builder. Extend support to additional demos/tests to validate the generalized flow.

By structuring the work this way, today’s modularisation efforts directly feed the larger vision, while keeping the surface area of future changes manageable.
