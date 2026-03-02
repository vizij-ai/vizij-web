# Animation + Orchestrator Integration Plan

Last updated: 2026-03-02
Status: `g7-implemented`

## Objective

Make animation authoring and playback in `vizij-authoring` runtime-truthful and non-hacky by using the orchestrator as the single playback authority.

## G7 Delivery Status (2026-03-02)

1. Runtime-authoritative timeline transport is landed (`play/pause/seek/stop/loop/speed/step`) and panel-local RAF playback authority is removed.
2. Deterministic `AnimationClipIR` contracts + compiler path are landed with deterministic IDs/order and keyframe dedupe semantics.
3. Runtime interpolation support for `linear`, `step`, and `cubic` (Hermite with tangent fallback) is landed in `@vizij/runtime-react`.
4. Authored clip export/import round-trip through existing bundle `animations[]` is landed with canonical authored clip conflict hard-error behavior.
5. Runtime transport lifecycle for authored timeline is decoupled from timeline panel visibility via an always-mounted runtime bridge.

## Why This Plan Exists

Current behavior is split:

1. Timeline playback currently uses local RAF evaluation and direct input writes.
2. Orchestrator-driven graph playback exists as a separate path.
3. Export/import does not yet round-trip authored timeline clips as first-class bundle animation data.

This creates drift risk between what users author, what they preview, and what gets exported.

## Target Architecture Contract

1. UI stages intent only (`setInput` / transport actions), never direct render-state writes.
2. Orchestrator is the single authority for stepping and composition.
3. Renderer consumes orchestrator `merged_writes` only.
4. Animation clips are compiled sources in the same orchestrator domain as rig/pose/motion graph signals.
5. Export/import round-trips authored clip data deterministically.
6. Runtime lifecycle does not depend on panel visibility.

## Current Seams to Remove

1. Local timeline playback path disconnected from orchestrator stepping.
2. No timeline-to-bundle animation serialization path.
3. Motion graph runtime lifecycle coupled to motion-graph panel visibility.
4. Multiple fallback-heavy input routing seams spread across UI/runtime.

## Wave Plan

## Wave 0: Contract Lock + Instrumentation

Goal:

- Freeze architecture contracts and add baseline observability before moving behavior.

Scope:

1. Define `AnimationClipIR` shape and canonical input-path targeting contract.
2. Define orchestrator transport contract for authoring playback (`play`, `pause`, `scrub`, `stop`, `loop`).
3. Add baseline metrics for timeline/orchestrator playback latency and jitter.
4. Add deterministic test fixtures for clip identity and path mapping.

Exit criteria:

1. `AnimationClipIR` contract is documented and approved.
2. Playback transport contract is documented and approved.
3. Baseline metrics are captured in `docs/perf/`.

## Wave 1: Single Playback Authority Cutover

Goal:

- Remove local timeline playback as the authoritative runtime path.

Scope:

1. Route timeline transport actions into orchestrator staging only.
2. Move playback stepping to orchestrator-driven frame flow.
3. Keep a compatibility bridge for existing panel controls while cutover completes.
4. Ensure graph playback controls are wired to active runtime, not no-op stubs.

Exit criteria:

1. Timeline playback preview is produced via orchestrator `merged_writes`.
2. Local RAF timeline-eval path is removed from active playback path.
3. Playback behavior is stable with motion graph enabled.

## Wave 2: Clip IR + Compiler Integration

Goal:

- Make authored clips first-class, deterministic compile inputs.

Scope:

1. Compile `AnimationClipIR` into orchestrator animation source graph/controller spec.
2. Support deterministic clip/channel identity and ordering.
3. Add interpolation mode support in compile path (beyond hardcoded linear assumptions).
4. Add regression tests for clip compile topology and determinism.

Exit criteria:

1. Clip IR compiles into orchestrator-compatible graph/controller payloads.
2. Deterministic compile snapshots pass in CI.
3. Playback parity holds between authored and compiled clip data.

## Wave 3: Bundle Round-Trip + Asset Standardization

Goal:

- Ensure authored animation survives export/import and validate against canonical sample faces.

Scope:

1. Export authored clip data as first-class bundle animation payload.
2. Import bundle animation payload back into `AnimationClipIR` authoring state.
3. Finalize Quori/Hugo/Toasty GLB examples for deterministic playback validation.
4. Define and validate Vizij standard-rig mappings for those sample assets.

Exit criteria:

1. Author -> export -> import round-trip preserves authored animation semantics.
2. Quori/Hugo/Toasty sample packs pass playback smoke tests.
3. Standard-rig coverage report exists for sample assets.

## Wave 4: Workspace UX Convergence

Goal:

- Improve workspace clarity and avoid mode-switch friction while animation authoring matures.

Scope:

1. Move motion graph panes into sidebar surfaces.
2. Reclaim graph workspace area where reference-face pane currently sits for graph-first workflows.
3. Run visual consistency pass across key authoring panes (layout, labels, controls, affordances).
4. Improve pose-group/blending visualization and grouping readability.

Exit criteria:

1. Graph-first workspace supports large graph editing without panel collision.
2. Sidebar organization is consistent across rig/pose/motion-graph workflows.
3. Pose-group/blend visualization is understandable in dense projects.

## Wave 5: Speech + Viseme Integration Backlog (Amazon Polly)

Goal:

- Add speech playback + viseme drive as a first-class pipeline extension after core animation/orchestrator unification is stable.

Scope:

1. Define provider abstraction for speech synthesis and viseme event ingestion.
2. Add Amazon Polly adapter implementation behind provider interface.
3. Map viseme events to standard rig/pose channels through orchestrator inputs.
4. Add timing/sync diagnostics for speech-vs-face playback.

Exit criteria:

1. Speech playback drives viseme channels in orchestrator path.
2. Provider abstraction supports future non-Polly backends.
3. Sync diagnostics are visible and test-covered.

## Dependencies and Sequencing

1. Wave 1 depends on Wave 0 contracts.
2. Wave 2 depends on Wave 1 transport cutover.
3. Wave 3 depends on Wave 2 compiler output stability.
4. Wave 4 can overlap late Wave 2 / early Wave 3, but workspace changes must not fork runtime contracts.
5. Wave 5 starts after Wave 3 baseline stability.

## Validation Gates

Per wave minimum:

1. `pnpm --filter vizij-authoring run test`
2. `pnpm --filter vizij-authoring run typecheck`
3. `pnpm --filter vizij-authoring run lint`

Integration gates (Wave 2+):

1. `pnpm run validate:all`
2. Deterministic compile/export snapshots for animation payloads
3. Quori/Hugo/Toasty playback smoke matrix
