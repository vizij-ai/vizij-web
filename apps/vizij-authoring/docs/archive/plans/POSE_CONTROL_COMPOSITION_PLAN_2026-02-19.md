# Pose-Control Composition Execution Plan

Last updated: 2026-02-19
Status: `done`

## Goal

Implement deterministic direct+pose channel composition while preserving IR-first authoring:

1. Pose graph outputs target internal paths: `rig/<face>/pose/control/<inputId>`.
2. Rig graph computes effective channel values per target:
   - `effective_i = clamp(compose(direct_i, pose_i), min_i, max_i)`.
3. Per-channel compose mode is authorable in UI/IR (`add` default, `average` optional).
4. Inputs pane hides internal pose-control channels from user-facing editing.

## Scope

In scope:

1. Pose IR/types/config projection updates for per-channel compose mode.
2. Pose graph/rig graph compiler contract updates for pose-control and effective composition.
3. Inputs pane filtering and inspector/input control consistency.
4. Regression tests for pathing, composition behavior, and UI filtering.

Out of scope:

1. Weighted direct+pose composition.
2. Priority direct+pose composition.
3. Monolithic rig+pose graph refactor.

## Commit-Sized Work Chunks

### Chunk 1 — Path Contract + Runtime Routing Guardrails (`A0.4`) [completed]

1. Confirm and enforce pose graph outputs to `rig/<face>/pose/control/<inputId>`.
2. Add/adjust lookup/routing utilities to treat pose-control paths as internal aliases, not editable user inputs.
3. Add tests for path normalization/resolution stability.

Acceptance:

1. Pose graph output topology contains only pose-control output paths for driven channels.
2. Canonical direct paths remain unchanged.
3. Tests pass for path contract.

### Chunk 2 — Rig Effective Composition (`A0.5`) [completed]

1. Add rig-graph-level effective channel composition nodes (`add`/`average` + clamp).
2. Route downstream bindings to effective channel output per targeted input.
3. Preserve existing behavior for unaffected channels.

Acceptance:

1. Direct + pose values combine deterministically.
2. Clamp is applied post-compose.
3. Regression tests verify additive default behavior.

### Chunk 3 — Per-Channel Compose Mode in IR/UI (`A0.6`) [completed]

1. Extend pose channel data contracts with compose mode field (`add` default).
2. Add UI control in pose "What I Drive" rows.
3. Ensure import/export/projection round-trips compose mode.

Acceptance:

1. New channels default to `add`.
2. `average` is selectable and persisted.
3. Tests cover serialization and projection stability.

### Chunk 4 — Inputs Pane Filtering + End-to-End Sync (`A0.7`) [completed]

1. Filter internal `rig/<face>/pose/control/<inputId>` from editable Inputs rows.
2. Keep pose inspector, pose-group inspector, and Inputs controls synchronized.
3. Add integration tests for visibility and behavior.

Acceptance:

1. Internal pose-control channels are hidden in default Inputs pane.
2. Direct and pose-weight controls remain visible and editable.
3. Inspector/Inputs interactions stay coherent under rapid edits.

## Progress Log

- 2026-02-19: Plan created; starting Chunk 1 implementation.
- 2026-02-19: Chunk 1 completed.
  1. Pose graph outputs now compile to `rig/<face>/pose/control/<inputId>`.
  2. Runtime input-route mapping explicitly excludes internal pose-control paths from editable direct-input routing.
  3. Inputs pane now filters internal pose-control channels from managed editable rows.
  4. Added/updated tests:
     - `src/poseRig/graphBuilder.test.ts`
     - `src/poseRig/topologyGolden.test.ts`
     - `src/poseRig/utils.test.ts`
     - `src/components/panels/VariablesPanel.test.tsx`
     - `src/hooks/__tests__/poseControlInputContracts.test.ts`
     - `packages/@vizij/utils/src/rig/standard-inputs.test.ts`
  5. Validation evidence:
     - `pnpm --filter @vizij/utils run test -- src/rig/standard-inputs.test.ts`
     - `pnpm --filter vizij-authoring run test -- src/poseRig/graphBuilder.test.ts src/poseRig/topologyGolden.test.ts src/poseRig/services/poseGraphService.test.ts src/poseRig/usePoseRigAuthoring.test.tsx src/poseRig/store.test.ts src/components/panels/VariablesPanel.test.tsx src/hooks/__tests__/poseControlInputContracts.test.ts src/poseRig/utils.test.ts`
     - `pnpm --filter @vizij/utils run typecheck`
     - `pnpm --filter vizij-authoring run typecheck`
     - `pnpm --filter @vizij/utils run lint`
     - `pnpm --filter vizij-authoring run lint`
- 2026-02-19: Chunk 2 completed.
  1. `buildRigGraphSpec` now supports per-input direct+pose composition modes via `inputComposeModesById`.
  2. For composed channels, rig graph now emits:
     - pose-control input node at `rig/<face>/pose/control/<inputId>`,
     - compose operation (`add`, or `average` via divide by `2`),
     - clamp node using input min/max to produce effective channel output.
  3. Added node-graph-authoring tests for additive and average compose topology.
- 2026-02-19: Chunk 3 completed.
  1. Added per-channel compose mode map on pose definitions (`composeModes`) with supported modes `add` and `average`.
  2. Config and IR services now normalize, round-trip, and validate compose-mode maps with diagnostics for invalid entries.
  3. Pose authoring now exposes `setPoseInputComposeMode`, and pose input lifecycle now defaults added channels to `add` and removes compose entries when channels are removed.
  4. Pose inspector `What I Drive` row 1 now includes a `Compose` selector (`Add` / `Average`) per channel.
- 2026-02-19: Chunk 4 completed.
  1. Runtime rig graph compilation now derives per-channel compose mode from pose config (`graphRuntimeStore.poseConfig`) and passes it into rig graph build.
  2. Internal pose-control inputs remain hidden in Inputs pane default UX and excluded from editable route registration.
  3. Added/updated sync contract coverage:
     - `src/hooks/__tests__/poseControlInputContracts.test.ts`
     - `src/components/inspector/poseInspectorSemanticsContracts.test.ts`
  4. Validation evidence:
     - `pnpm --filter @vizij/node-graph-authoring run test -- src/__tests__/graphBuilder.test.ts`
     - `pnpm --filter @vizij/node-graph-authoring run typecheck`
     - `pnpm --filter @vizij/node-graph-authoring run lint`
     - `pnpm --filter vizij-authoring run test -- src/poseRig/store.test.ts src/poseRig/usePoseRigAuthoring.test.tsx src/poseRig/services/poseConfigService.test.ts src/poseRig/services/poseIrService.test.ts src/components/inspector/poseInspectorSemanticsContracts.test.ts src/hooks/__tests__/poseControlInputContracts.test.ts src/poseRig/graphBuilder.test.ts src/poseRig/services/poseGraphService.test.ts src/components/panels/VariablesPanel.test.tsx`
     - `pnpm --filter vizij-authoring run typecheck`
     - `pnpm --filter vizij-authoring run lint`
- 2026-02-19: Plan closed.
  1. Stage `4A` acceptance gates are met end-to-end (path contract, effective composition, compose-mode authoring, Inputs filtering/sync contracts).
  2. Final validation evidence:
     - `pnpm --filter @vizij/node-graph-authoring run test -- src/__tests__/graphBuilder.test.ts`
     - `pnpm --filter @vizij/node-graph-authoring run typecheck`
     - `pnpm --filter @vizij/node-graph-authoring run lint`
     - `pnpm --filter vizij-authoring run validate`
