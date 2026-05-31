# Runtime and Authoring Arora Migration Plan

Date: 2026-05-30
Status: In progress; remaining target shape proposed for approval
Scope: `apps/vizij-authoring`, `@vizij/runtime-react`, `@vizij/studio-support`, Arora-backed Vizij modules

## Executive Summary

The target architecture should split Vizij into three clear responsibility bands:

1. `vizij-authoring` remains the UI host for editing, selection, panels, and user workflow state.
2. `@vizij/studio-support` becomes the Studio-support backend layer for authoring semantics: migration, validation, canonical asset assembly, IR compilation, diagnostics, and export-ready bundles.
3. The Arora engine path executes canonical animation, node graph, and orchestration modules. React runtime code should become a thin adapter that loads assets, manages playback sessions, and bridges values to the renderer.

The next implementation should focus on moving compile and asset-assembly responsibility out of React runtime/UI code while preserving the current composed-Arora execution path. Performance-sensitive compilers should be designed as Rust-first candidates, with browser Wasm and future native execution both supported from the same core implementation.

## Current Proof Point

The current branch now proves the end-to-end shape we need:

1. The authoring app loads a face through the composed Arora Web engine path.
2. A UI-edited animation keyframe and interpolation mode are applied through the animation editor.
3. The edited animation executes through Arora-backed animation transport with no host sampling fallback.
4. A UI-edited node graph default is registered through Arora `graph.register` with the exact edited graph spec.
5. Exported GLB data carries the exact edited animation and graph values.
6. Existing Arora load, reference face, export, and reimport workflows still pass.

This is a sufficient proof to begin the real migration work, with one caveat: the proof is browser-first. Native/desktop execution remains compatible with the direction, but is not part of the next priority slice.

## Validation And Hardening Status

As of the 2026-05-30 validation pass, the current Studio-support promotion slice is complete:

1. `runtimeBundle`, `standardInputRemap`, `graphDiff`, `bundleAudit`, graph import metadata helpers, pose graph import helpers, and motion graph spec/import helpers moved from `apps/vizij-authoring` into `@vizij/studio-support`.
2. Authoring callers now import those helpers from the Studio-support package instead of local UI utilities.
3. App-local graph diff type ownership was removed; authoring discrepancy state re-exports the package-owned graph diff types.
4. Motion graph compiler/import behavior is now package-owned: reachable-node filtering, editor handle translation, runtime namespace application, export namespace omission, layout preservation, and synthetic default constants.
5. The UI motion graph node components now re-export the Studio-support synthetic node/handle constants, so UI handles and compiler handles share one canonical source.
6. The moved helpers have package-level tests, including graph-import coverage, pose-graph import coverage, motion graph spec coverage, and motion graph import/default restoration coverage.

Latest validation:

1. `pnpm --filter @vizij/studio-support lint`
2. `pnpm --filter @vizij/studio-support typecheck`
3. `pnpm --filter @vizij/studio-support test` - 20 files, 82 tests passed.
4. `pnpm --filter @vizij/studio-support build`
5. `pnpm --filter @vizij/studio-support prettier:check`
6. `pnpm --filter @vizij/runtime-react lint`
7. `pnpm --filter @vizij/runtime-react typecheck`
8. `pnpm --filter @vizij/runtime-react test` - 8 files, 32 tests passed.
9. `pnpm --filter @vizij/runtime-react build`
10. `pnpm --filter @vizij/runtime-react prettier:check`
11. `pnpm --filter vizij-authoring lint`
12. `pnpm --filter vizij-authoring typecheck`
13. `pnpm --filter vizij-authoring prettier:check`
14. `pnpm --filter vizij-authoring test` - 99 files passed, 698 tests passed, 1 perf test skipped.
15. `pnpm --filter vizij-authoring exec playwright test --config=playwright.config.ts e2e/load-order.workflow.pw.ts e2e/pose-lifecycle.workflow.pw.ts e2e/pose-roundtrip.workflow.pw.ts e2e/runtime-sessions.workflow.pw.ts --project=workflow --workers=1` - 5 workflow tests passed.
16. `pnpm --filter vizij-authoring exec playwright test --config=playwright.config.ts --project=smoke --workers=1` - 4 smoke tests passed across app load, export dialog, reference-face copy/reset, and motiongraph.
17. `pnpm --filter vizij-authoring test:e2e:arora` - 3 workflow tests passed, including UI-edited animation and graph execution through Arora Web composed runtime and exported GLB round-trip.

The 2026-05-31 hardening pass also corrected stale browser assertions in the authoring E2E suite: tab counts now read the stable accessible labels, the delayed-load workflow verifies the current `quori:basic` program target from the rendered Programs panel, and runtime-session tests target concrete animation/program rows instead of page-global button titles.

This means the current branch is past the weekend-demo proof point for browser authoring execution. The remaining work is no longer about proving that edited assets can reach Arora; it is about finishing the responsibility migration cleanly and reducing duplicate compile semantics.

## Target Responsibility Model

### Authoring UI Host

Owned by `apps/vizij-authoring`.

Responsibilities:

1. User interactions: timeline edits, graph edits, inspectors, panels, selection, drag/drop, playback controls.
2. UI-only state: active tabs, panel visibility, selection focus, local gesture state.
3. Visualization: canvas, timeline, graph editor, diagnostics display, dirty/compiled status.
4. Calls into Studio support for compile/migrate/validate/export operations.
5. Calls into runtime adapter for preview playback and live authoring execution.

Non-responsibilities:

1. Canonical animation math.
2. Node graph semantic normalization.
3. Runtime registration plan construction.
4. Long-term IR compilation hot paths.

### Studio Support Layer

Owned by `@vizij/studio-support`.

Responsibilities:

1. Canonical Vizij asset model for animations, graph programs, pose/rig data, and runtime bundles.
2. Migration from legacy Vizij animation data into Studio-compatible animation assets.
3. Animation normalization, validation, and transport conversion.
4. Graph spec normalization, default restoration, input/output path indexing, and registration plan preparation.
5. IR compilation facade for pose, rig, animation, and program assets.
6. Structured diagnostics suitable for UI display and test assertions.
7. Export/import assembly rules shared by authoring and runtime.

Likely Rust/Wasm candidates:

1. Animation curve sampling and migration validation.
2. Node graph normalization and graph diffing.
3. Rig/pose IR compilation once semantics stabilize.
4. Registration-plan construction if JS profiling shows it on the hot path.

### Runtime React Adapter

Owned by `@vizij/runtime-react`.

Responsibilities:

1. Load a Vizij asset bundle into runtime state.
2. Initialize the selected backend, currently composed Arora Web for browser execution.
3. Register compiled graph and animation assets produced by Studio support.
4. Manage preview playback sessions: play, pause, stop, seek, loop, program activation.
5. Bridge Arora frame writes into renderer values.
6. Expose debug diagnostics for acceptance tests and local investigation.

Migration direction:

1. Keep runtime APIs stable for UI callers.
2. Remove compile and asset-shaping logic from React hooks/providers as it is promoted into Studio support.
3. Keep fallback compatibility only where it protects known migration paths.
4. Avoid adding new behavior-tree work here until the composed module boundary is clean.

### Arora Engine Modules

Owned by the Arora module path and Vizij module crates.

Responsibilities:

1. `vizij-animation`: canonical animation playback/sampling.
2. `vizij-node-graph`: canonical graph normalization/evaluation.
3. `vizij-orchestrator-composed`: orchestration module consuming animation and graph modules.
4. Browser loading via Arora Web module manifest and module imports.
5. Future native execution using the same Rust core implementations, not browser-only Wasm wrappers.

Constraint:

The migration should add or consume modules without requiring Arora engine changes unless a missing engine contract is proven.

## Implementation Phases

### Phase 1: Lock The Proof Harness

Goal: keep the current browser proof stable and make failures actionable.

Work:

1. Keep the Arora workflow E2E that edits animation and graph values through the UI.
2. Keep runtime debug samples for actual frame/renderer writes.
3. Keep Arora debug request capture for proving exact graph registration payloads.
4. Add targeted regressions when import/export semantics reveal hidden editor handles or defaults.

Acceptance:

1. Arora workflow passes.
2. Smoke E2E passes.
3. Authoring unit suite passes.

### Phase 2: Promote Studio Support As The Authoring Backend Layer

Goal: move canonical asset assembly and validation out of UI/runtime React code.

Current state:

1. Runtime registration-plan construction and runtime update planning are already in `@vizij/studio-support`.
2. Generic graph import metadata helpers are already in `@vizij/studio-support`.
3. Pose graph import mutation helpers are already in `@vizij/studio-support`.
4. Motion graph editor/spec conversion is already in `@vizij/studio-support` as an editor-support DTO boundary. This keeps import/export/live preview semantics package-owned now, while leaving a later option to split a stricter engine-neutral DTO from the ReactFlow adapter if the package API starts carrying too much UI shape.

Work:

1. Inventory the remaining `runtime-react` and authoring helper functions by responsibility.
2. Move remaining pure compile, migration, path-index, audit, export-assembly, and diagnostic functions into `@vizij/studio-support`.
3. Leave UI hooks as orchestration shells around Studio-support functions.
4. Add or preserve function-level tests in Studio support for every promoted behavior.
5. Keep TypeScript contracts stable for authoring callers during the move.

Acceptance:

1. Authoring UI can edit animation and graph assets without owning compile semantics.
2. Runtime provider receives already-normalized bundle updates.
3. Export/import use the same Studio-support assembly path as live preview.

### Phase 3: Make Animation And Node Graph First-Class Independent Modules

Goal: make the composed orchestrator consume promoted independent modules rather than a monolithic Vizij facade.

Work:

1. Treat `vizij-animation` and `vizij-node-graph` as separately testable Arora modules.
2. Keep `vizij-orchestrator-composed` as the integration module that consumes both.
3. Add module-level fixture tests for animation registration/playback and graph registration/evaluation.
4. Keep the browser module manifest as the loader source of truth.
5. Do not require behavior-tree orchestration yet.

Acceptance:

1. The composed runtime path preloads and calls independent animation and graph modules.
2. The authoring app test proves animation and graph edits register through the composed module path.
3. Compatibility orchestrator remains available but is no longer the ideal target.

### Phase 4: Thin The Runtime Adapter

Goal: make `@vizij/runtime-react` a bridge, not a compiler.

Current state:

1. `prepareRuntimeRegistrationPlan`, `applyRuntimeGraphBundle`, and `resolveRuntimeUpdatePlan` are already support-owned.
2. The remaining runtime-react concentration is plan application, controller registration, playback session state, backend selection, and renderer frame-write bridging.

Work:

1. Move plan-derived controller application helpers into Studio support where they can stay backend-agnostic.
2. Keep host calls, backend loading, playback session state, and renderer writes in runtime React until there is a clear engine/module home for them.
3. Keep Arora backend loading in `@vizij/orchestrator-react`.
4. Add debug counters only for execution evidence, not business logic.
5. Avoid moving renderer frame-write bridging until profiling or native-service requirements justify it.

Acceptance:

1. Runtime provider code is smaller and mostly concerned with loading, playback sessions, and renderer writes.
2. No duplicate animation or graph compile paths remain between authoring and runtime.
3. Existing public runtime APIs still work for authoring and standalone preview surfaces.

### Phase 5: Add Realish-Time Compile Feedback

Goal: make the authoring UI clearly reflect edited, compiling, compiled, and runtime-applied state.

Work:

1. Add a compile state model: dirty, compiling, compiled, registered, runtime error.
2. Batch/debounce graph and animation updates from editors.
3. Use stable asset hashes to avoid redundant registrations.
4. Show diagnostics in existing inspector/status surfaces.
5. Move heavy compile work to a worker or Rust/Wasm where profiling justifies it.

Acceptance:

1. Timeline and graph edits update the runtime in realish time without UI stalls.
2. Failed compiles show actionable diagnostics.
3. Successful compiles register exact edited assets through Arora.

### Phase 6: Rust/Wasm Performance Promotion

Goal: migrate hot, portable, deterministic execution-support code into Rust cores without losing browser support.

Work:

1. Profile authoring compile/update paths under realistic graph and animation size.
2. Promote the hottest deterministic functions first.
3. Compile promoted crates for browser Wasm and future native service use.
4. Keep JavaScript wrappers as typed adapters, not duplicate implementations.
5. Add parity tests between JS fixtures and Rust/Wasm outputs during transition.

Acceptance:

1. Browser authoring uses the faster Rust/Wasm path where available.
2. Native execution can consume the same Rust core later.
3. JS fallback exists only temporarily during migration and is explicitly tracked.

### Phase 7: Cleanup And Compatibility Reduction

Goal: make the integration reviewable and avoid migration bloat.

Work:

1. Remove redundant tests once higher-level proof covers the behavior.
2. Delete compatibility branches that are no longer part of supported migration input.
3. Keep only one canonical animation implementation: the Studio-compatible version plus legacy migration.
4. Keep one canonical graph assembly path.
5. Update architecture docs and package READMEs to match the final ownership model.

Acceptance:

1. Minimal durable diff for the new architecture.
2. Legacy assets migrate into canonical assets rather than running forever on parallel implementations.
3. Reviewers can understand the feature without walking multiple duplicate paths.

## Approval Gates

Approve the migration if we accept these gates:

1. Browser-first is the priority; desktop/native stays compatible but is deferred.
2. Studio-compatible animation is the single canonical animation model.
3. Animation, node graph, and orchestration should be independently promoted modules.
4. `@vizij/studio-support` is the home for authoring backend semantics.
5. React runtime code should thin out over time.
6. Rust/Wasm promotion is performance-driven, not speculative.

## Open Decisions

1. Which compiler moves to Rust first: animation migration/sampling, graph normalization, or pose/rig IR compilation.
2. Whether compile work should run in a dedicated browser worker before Rust promotion.
3. How much playback session state eventually belongs in the composed orchestrator versus the React adapter.
4. How much compatibility support remains after legacy animation migration is proven.

## Recommended Next Slice

The next approvable slice should finish the authoring-backend promotion and take the highest-value part of runtime thinning:

1. Promote plan-derived controller application helpers out of `@vizij/runtime-react` where they can stay backend-agnostic: merged graph id handling, program registration bookkeeping, output/input path sets, rig input maps, and initial input staging results.
2. Keep the actual host calls in the runtime adapter unless the extracted helper can remain cleanly typed as a host adapter without importing React or browser concerns.
3. Promote remaining import/export audit and normalization helpers out of `apps/vizij-authoring` where they are not UI-specific. Highest-value candidates are `rigRoundtripAudit`, `standardInputResolutionIndex`, `standardInputPaths`, `graphPaths`, and the pure bundle/metadata helpers currently embedded in `useVizijExport`.
4. Route live graph/animation edits through a single Studio-support asset assembly path before registration. The UI may still own immediate gesture state, but the compiled asset handed to Arora should come from the same support-layer compiler used for export/import.
5. Add compile-status plumbing in authoring: dirty, compiling, compiled, registered, runtime error.
6. Add debounced live-update plumbing for animation and graph edits using stable asset hashes so repeated edits do not cause redundant Arora registrations.
7. Profile the compile/update loop before Rust promotion. Treat animation sampling/migration, graph normalization/diffing, and pose/rig IR compilation as the first Rust/Wasm candidates, but move them only when profiling or portability makes the benefit concrete.
8. Keep the Arora E2E workflow, smoke E2E, full authoring unit suite, runtime tests, and support package tests as the approval gate.

Acceptance for this next slice:

1. Loading a face, editing animation handles/keyframes, editing graph defaults/connections, exporting the face, and reloading the export all use the same Studio-support asset assembly path.
2. Runtime React does not contain duplicate graph or animation compile semantics.
3. Authoring UI still owns only interaction state, selection, panels, diagnostics display, and preview controls.
4. The Arora composed runtime receives exact edited animation and graph assets and executes them without host-sampling fallback.
5. Compile-status UI reports whether the latest editor state is dirty, compiling, compiled, registered, or failed.
6. Any remaining compatibility path is named, tested, and tied to a known legacy input instead of being an open-ended duplicate implementation.

This is the largest next chunk that improves architecture without reopening the engine/module design or behavior-tree question.
