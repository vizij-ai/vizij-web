# Override Pipeline Implementation Plan (2026-02-25)

## Scope

Implement the variable evaluation model defined in:

- `docs/reports/override-pipeline-binding-editor-proposal-2026-02-25.md`

Target behavior per variable:

```text
effective = clamp(
  if(overrideEnabled, overrideValue, blend(parent?, pose?, direct?))
)
```

with per-variable clamp toggle:

```text
effective = if(clampEnabled, clamp(selected), selected)
```

with these constraints:

1. Parent, pose, and direct input are optional source branches.
2. Direct input is explicit opt-in (not auto-enabled).
3. Override is compiler-injected and outside authored binding expressions.
4. Parent/child scale+offset are one shared link-owned parameter set.

## Locked Contract (Approved 2026-02-25)

1. Legacy `self` migration:
   1. canonical `self + parent(s)` graphs auto-migrate to staged metadata,
   2. migrated direct/self control is represented as explicit direct-input behavior,
   3. direct-input defaults to disabled on staged variables,
   4. non-convertible legacy expressions stay legacy + read-only + flagged.
2. Source and override control behavior:
   1. `directInput.enabled` is compile-time metadata,
   2. override enabled/value are runtime-stageable controls,
   3. direct/override controls are inspector settings and do not appear in Inputs pane.
3. Runtime path contract:
   1. direct value path remains existing variable input path (`rig/<face>/<input.path>`),
   2. no runtime direct-enabled path is required,
   3. override paths are:
      1. `rig/<face>/override/<inputId>/enabled`,
      2. `rig/<face>/override/<inputId>/value`.
4. Blend and baseline:
   1. default `parentBlend` is `normalized-additive`,
   2. default `sourceBlend` is `normalized-additive`,
   3. baseline is always `input.defaultValue`.
5. Clamp policy:
   1. clamp is on by default for every variable,
   2. clamp is per-variable configurable; when disabled, output is unbounded.
6. Parent expression scope:
   1. staged parent expression remains arbitrary math,
   2. `blendParents(...)` is the default authored template.
7. Pose integration:
   1. existing pose compose behavior remains as-is to produce `poseContribution`,
   2. staged source-blend combines `parentContribution?`, `poseContribution?`, and `directContribution?`.
8. Metadata contract:
   1. staged config is stored in top-level `metadata.vizij.pipelineV1`,
   2. shared parent-child link params are stored once via deterministic `linkId` records.

## Workstreams

1. Compiler and Runtime Graph Semantics
2. Data Model and Serialization
3. Inspector/Binding Editor Redesign
4. Migration Tooling and Compatibility
5. Validation, Performance, and Rollout

## Phase 0: Contract Lock (1-2 days)

Deliverables:

1. Frozen v1 schema for staged binding config.
2. Frozen path naming for:
   1. override enabled/value,
   2. pose/control (existing),
   3. direct value path contract (existing variable input path).
3. Frozen blend math definitions and fallback rules.
4. Frozen clamp toggle contract.

Tasks:

1. Add short ADR section to proposal doc with final decisions.
2. Update type definitions for staged config contracts.
3. Add fixtures for canonical expected equations (no-source, parent-only, pose-only, direct-only, mixed).

Exit criteria:

1. Team sign-off on contract and formulas.

## Phase 1: Compiler Dual-Read and Core Semantics (3-5 days)

Deliverables:

1. Compiler supports both legacy and staged models.
2. Compiler emits source-branch blend + override selection + clamp pipeline.
3. Legacy behavior preserved where staged metadata is absent.

Tasks:

1. Add staged metadata parsing in graphBuilder.
2. Implement source branch assembly:
   1. parent branch from parent links + per-link scale/offset,
   2. pose branch from pose/control path,
   3. direct branch gated by compile-time `directInput.enabled`.
3. Implement compiler-injected override wrapper.
4. Keep final clamp as terminal stage when `clamp.enabled=true`.
5. Ensure no expression mutation required for override logic.
6. Preserve existing pose compose semantics and feed resulting `poseContribution` into staged source blend.

Tests:

1. Unit tests for each source combination.
2. Unit tests for normalized-additive defaults.
3. Unit tests for override on/off in every source combination.
4. Unit tests for clamp enabled/disabled behavior.
5. Regression tests for legacy `self` graphs.

Exit criteria:

1. Typecheck and tests pass.
2. Golden graph snapshots updated and reviewed.

## Phase 2: Data Model, Import/Export, and Link Ownership (2-4 days)

Deliverables:

1. Staged config serialized in `metadata.vizij.pipelineV1`.
2. Import/export round-trip preserved.
3. Parent/child link-owned parameters implemented once and referenced from both sides.

Tasks:

1. Add schema fields for:
   1. parents,
   2. children reverse links,
   3. direct-input settings,
   4. sourceBlend settings,
   5. override settings,
   6. per-variable clamp settings.
2. Add link-id abstraction for parent-child parameter ownership.
3. Ensure children panel resolves and edits same link record as parent rows.
4. Implement migration adapter for legacy input bindings.

Tests:

1. Round-trip metadata tests.
2. Legacy import compatibility tests.
3. Link ownership invariants (edit parent -> child reflects; edit child -> parent reflects).

Exit criteria:

1. Exported GraphSpec + IR + metadata remain consistent.

## Phase 3: Inspector and Binding Editor Redesign (4-7 days)

Deliverables:

1. New variable inspector with five groups:
   1. Parents,
   2. Children,
   3. Poses,
   4. Direct Input,
   5. Override.
2. Two explicit expression views:
   1. authored parent expression (editable),
   2. compiled effective equation (read-only).

Tasks:

1. Build stage-oriented UI sections.
2. Add parent and child link editors wired to shared link params.
3. Add pose target weights section.
4. Add direct-input enable + slider section.
5. Add override enable + value section.
6. Add per-variable clamp toggle section.
7. Ensure direct/override controls are inspector-only (not Inputs pane rows).
8. Add read-only pipeline diagnostics row:
   1. parent contribution,
   2. pose contribution,
   3. direct contribution,
   4. blended result,
   5. override-selected result,
   6. clamped effective result.

Tests:

1. Component tests for section visibility and empty states.
2. Interaction tests for shared link param edits.
3. Interaction tests for direct-input opt-in behavior.
4. Interaction tests for override behavior.
5. Interaction tests for clamp toggle behavior.

Exit criteria:

1. Manual smoke tests pass for authoring variables, drivers, pose targets, and live control.

## Phase 4: Migration UX and Backward Compatibility (2-4 days)

Deliverables:

1. Legacy binding detector and migration assistant.
2. Safe fallback mode for non-convertible legacy expressions.

Tasks:

1. Detect canonical `self + parent` patterns and auto-map to staged config.
2. Flag complex legacy expressions and keep them read-only in legacy section.
3. Add one-click migration action per variable and batch migration mode.
4. Add migration report summary panel.

Tests:

1. Migration fixture suite covering simple and complex legacy graphs.
2. No-regression tests for non-migrated assets.

Exit criteria:

1. Existing bundles load and evaluate correctly.

## Phase 5: Performance Pass and Rollout (2-3 days)

Deliverables:

1. Performance report (before/after) for inspector-open and variable-edit paths.
2. Merge-readiness checklist for parity + performance.

Tasks:

1. Profile node count and runtime staging overhead.
2. Optimize hot paths (memoization/selectors) in inspector sections.
3. Validate FPS and interaction smoothness with sidebars open.
4. Validate behavior parity against representative existing authoring assets before merge.

Acceptance checks:

1. No regressions in:
   1. variable authoring,
   2. driver linking,
   3. pose target creation/editing,
   4. live preview motion.
2. Existing faces and pose playback continue to behave as before unless direct-input/override/clamp settings are intentionally changed.
3. Export remains valid and internally consistent.

## Suggested Execution Order

1. Phase 0 + 1 first (compiler truth).
2. Phase 2 next (schema + persistence).
3. Phase 3 (UI) once compiler/schema are stable.
4. Phase 4 (migration) before default flip.
5. Phase 5 final for rollout confidence.

## Tracking

Create one tracker issue per phase and link PRs to phase IDs:

1. `OP-0 Contract Lock`

## Execution Log (2026-02-25)

### Phase 0 + 1

Status: Completed

Commits:

1. `475934f feat(node-graph): implement staged override pipeline v1 compiler`

Changes:

1. Added `pipeline-v1` schema/types + canonical path/default resolvers in `@vizij/utils`.
2. Updated `buildRigGraphSpec` dual-read semantics in `@vizij/node-graph-authoring`:
   1. legacy path when staged metadata is absent,
   2. staged parent/pose/direct branch assembly,
   3. compiler-injected override selection,
   4. per-input clamp toggle.
3. Added source-combination tests (no-source, parent-only, pose-only, direct-only, mixed) + override/clamp toggles.

Validation:

1. `pnpm --filter "@vizij/utils" test`
2. `pnpm --filter "@vizij/utils" typecheck`
3. `pnpm --filter "@vizij/node-graph-authoring" test`
4. `pnpm --filter "@vizij/node-graph-authoring" typecheck`

Learnings / adjustments:

1. Kept staged path strict to explicit metadata presence to preserve legacy behavior by default.
2. Reused existing pose control path (`rig/<face>/pose/control/<inputId>`) as staged pose contribution.

### Phase 2

Status: Completed (core serialization + round-trip)

Commits:

1. `da114e9 feat(vizij-authoring): round-trip pipeline v1 metadata across import export and compile`

Changes:

1. Added `pipelineV1` metadata extract/normalize/reattach helpers in graph import utilities.
2. Wired pipeline metadata through:
   1. rig compile path,
   2. bundle export and graph export,
   3. graph import rebuild path,
   4. rig persistence + binding authoring store.
3. Added regression tests for compiler wiring, import metadata helpers, and export payload preservation.

Validation:

1. `pnpm --filter vizij-authoring test -- src/hooks/__tests__/rigGraphCompiler.test.ts src/hooks/__tests__/useVizijExport.test.tsx src/utils/graphImport.test.ts`
2. `pnpm --filter vizij-authoring exec eslint <touched files>`

Learnings / adjustments:

1. Unified compile/build wiring to `pipelineV1` option expected by `buildRigGraphSpec`.
2. Added normalization that injects missing `inputId` in pipeline entries when authored data is partial.

### Phase 3 + 4

Status: Completed (first-pass UI and migration UX)

Commits:

1. `4a47fab feat(vizij-authoring): add stage-oriented pipeline inspector and migration UX`

Changes:

1. Added stage-oriented inspector surface:
   1. Parents,
   2. Children,
   3. Poses,
   4. Direct Input,
   5. Override,
   6. Clamp,
   7. compiled-equation diagnostics row.
2. Added pipeline helper module for:
   1. diagnostics math,
   2. compiled equation display,
   3. legacy canonical-expression detection.
3. Added migration UX:
   1. one-click migrate for canonical `self + parent` forms,
   2. read-only fallback banner for non-convertible legacy expressions.
4. Added binding-editor read-only mode for legacy fallback paths.

Validation:

1. `pnpm --filter vizij-authoring test -- src/components/inspector/pipelineStages.test.ts src/components/inspector/VariablePipelineStages.test.tsx src/components/binding/BindingEditor.test.tsx`
2. `pnpm --filter vizij-authoring exec eslint <touched files>`

Learnings / adjustments:

1. Stored migration stage controls in binding metadata as an incremental bridge while preserving legacy expressions.
2. Kept direct/override controls inspector-only.

### Phase 5

Status: Completed (validation pass) with rollout gaps called out

Validation run:

1. `pnpm --filter vizij-authoring test -- src/components/inspector/panelPerformanceContracts.test.ts src/components/panels/VariablesPanel.perf.test.tsx src/__tests__/graphAuthoringSmoke.test.ts src/hooks/__tests__/runtimeInputRoutes.test.ts src/hooks/__tests__/runtimeInputStaging.test.ts src/hooks/__tests__/poseControlInputContracts.test.ts`
2. `pnpm run prep`

Notes:

1. `VariablesPanel.perf.test.tsx` remained skipped (existing test gate).
2. Full `pnpm --filter vizij-authoring typecheck` still reports pre-existing workspace resolution issues unrelated to this change set.

### Phase 2 + 3 + 4 Completion Pass (2026-02-25, follow-up)

Status: Completed (remaining implementation gaps closed)

Changes:

1. Canonical shared link ownership is now fully wired through `metadata.vizij.pipelineV1.links`:
   1. import/persistence extraction for `links`,
   2. compiler/runtime resolution preferring link records for scale/offset/enabled,
   3. inspector parent/child rows editing the same deterministic `linkId` records.
2. Override enabled/value controls now stage live runtime writes on dedicated override paths:
   1. `rig/<face>/override/<inputId>/enabled`,
   2. `rig/<face>/override/<inputId>/value`.
3. Legacy migration parser now supports signed additive factors, including canonical forms like `self - blink*2` and `self + 2*blink`.
4. Migration UX now includes:
   1. one-click per-variable migration (existing),
   2. batch migration action,
   3. migration summary panel with convertible/non-convertible counts.
5. Inspector UI pass completed:
   1. parent/child link scale controls include sliders,
   2. pose weights include sliders,
   3. override value includes slider,
   4. number fields retained for precise entry.

Validation:

1. `pnpm --filter "@vizij/utils" test -- src/rig/pipeline-v1.test.ts`
2. `pnpm --filter "@vizij/node-graph-authoring" test -- src/__tests__/graphBuilder.test.ts`
3. `pnpm --filter vizij-authoring test -- src/components/inspector/pipelineStages.test.ts src/components/inspector/VariablePipelineStages.test.tsx src/hooks/__tests__/runtimeInputRoutes.test.ts src/utils/graphImport.test.ts`
4. `pnpm --filter vizij-authoring typecheck`
5. `pnpm --filter "@vizij/utils" typecheck`
6. `pnpm --filter "@vizij/node-graph-authoring" typecheck`
7. `pnpm run prep`

Learnings / adjustments:

1. Normalizing local pipeline edits through import utility map normalizers avoided fragile cross-casting between strict config types and generic metadata records.
2. For migration safety, additive-expression conversion remains intentionally strict:
   1. only alias terms with optional numeric factors,
   2. `self` coefficient must remain `+1`,
   3. unsupported math still routes to read-only legacy fallback.

### Remaining Follow-ups

1. Run and record Phase 3 manual smoke checks (authoring variables, drivers, pose targets, live control) against representative assets.
2. Optional pre-merge: capture explicit before/after perf measurements for inspector-open + variable-edit hot paths.
3. `OP-1 Compiler`
4. `OP-2 Schema/Serialization`
5. `OP-3 Inspector/Editor`
6. `OP-4 Migration`
7. `OP-5 Perf/Rollout`
