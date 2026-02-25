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

with these constraints:

1. Parent, pose, and direct input are optional source branches.
2. Direct input is explicit opt-in (not auto-enabled).
3. Override is compiler-injected and outside authored binding expressions.
4. Parent/child scale+offset are one shared link-owned parameter set.

## Dependencies and Decisions (Must Lock First)

1. Default `parentBlend` mode.
2. Default multi-source `sourceBlend` mode.
3. Fallback policy when no sources exist.
4. Migration policy for legacy `self` expressions.
5. Runtime path contract for direct-input enable and override paths.

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
   1. direct-input enabled,
   2. override enabled/value,
   3. pose/control (existing).
3. Frozen blend math definitions and fallback rules.

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
   3. direct branch gated by `directInput.enabled`.
3. Implement compiler-injected override wrapper.
4. Keep final clamp as terminal stage.
5. Ensure no expression mutation required for override logic.

Tests:

1. Unit tests for each source combination.
2. Unit tests for each blend mode.
3. Unit tests for override on/off in every source combination.
4. Regression tests for legacy `self` graphs.

Exit criteria:

1. Typecheck and tests pass.
2. Golden graph snapshots updated and reviewed.

## Phase 2: Data Model, Import/Export, and Link Ownership (2-4 days)

Deliverables:

1. Staged config serialized in `metadata.vizij.bindings`.
2. Import/export round-trip preserved.
3. Parent/child link-owned parameters implemented once and referenced from both sides.

Tasks:

1. Add schema fields for:
   1. parents,
   2. children reverse links,
   3. direct-input settings,
   4. sourceBlend settings,
   5. override settings.
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
6. Add read-only pipeline diagnostics row:
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

Exit criteria:

1. Manual smoke tests pass for authoring variables, drivers, pose targets, and live control.

## Phase 4: Migration UX and Backward Compatibility (2-4 days)

Deliverables:

1. Legacy binding detector and migration assistant.
2. Safe fallback mode for non-convertible legacy expressions.

Tasks:

1. Detect canonical `self + parent` patterns and auto-map to staged config.
2. Flag complex legacy expressions for manual migration.
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
2. Feature flag rollout plan.

Tasks:

1. Profile node count and runtime staging overhead.
2. Optimize hot paths (memoization/selectors) in inspector sections.
3. Validate FPS and interaction smoothness with sidebars open.
4. Roll out behind flag, then flip default after stability window.

Acceptance checks:

1. No regressions in:
   1. variable authoring,
   2. driver linking,
   3. pose target creation/editing,
   4. live preview motion.
2. Export remains valid and internally consistent.

## Suggested Execution Order

1. Phase 0 + 1 first (compiler truth).
2. Phase 2 next (schema + persistence).
3. Phase 3 (UI) once compiler/schema are stable.
4. Phase 4 (migration) before default flip.
5. Phase 5 final for rollout confidence.

## Tracking

Create one tracker issue per phase and link PRs to phase IDs:

1. `OP-0 Contract Lock`
2. `OP-1 Compiler`
3. `OP-2 Schema/Serialization`
4. `OP-3 Inspector/Editor`
5. `OP-4 Migration`
6. `OP-5 Perf/Rollout`
