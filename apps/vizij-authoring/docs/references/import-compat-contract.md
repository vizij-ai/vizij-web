# Import Compatibility Contract

Last updated: 2026-02-19  
Status: active source of truth for Block `F5.*` import behavior

This document defines the canonical import compatibility and recovery contract for `apps/vizij-authoring` and `@vizij/render`.

## Scope

This contract covers:

1. Import outcome classes and success classification.
2. Bundle extension alias compatibility adapter behavior.
3. Root resolution fallback and state-mutation safety.
4. Rig persistence migration registry behavior.
5. Pose remap "create missing standard input" behavior.
6. Fixture matrix regression gate used for compatibility ratcheting.

When import behavior changes, update this file and cross-links in:

1. `apps/vizij-authoring/docs/ARCHITECTURE.md`
2. `apps/vizij-authoring/docs/UI_DESIGN.md`
3. `apps/vizij-authoring/docs/plans/ROADMAP.md`
4. `apps/vizij-authoring/docs/plans/TRACKER.md`
5. `apps/vizij-authoring/docs/plans/BACKLOG.md`

## Outcome Classes (`F5.1`)

Canonical statuses:

1. `success`
2. `success_with_repair`
3. `blocked_recoverable`
4. `blocked_fatal`

Source: `apps/vizij-authoring/src/types/importOutcome.ts`.

Success classification rule:

1. `success` and `success_with_repair` are successful outcomes.
2. `blocked_recoverable` and `blocked_fatal` are non-success outcomes.

Rig import mapping:

1. `resolveRigImportSuccessStatus` returns `success_with_repair` if any repair signal is present:
   - discrepancy review opened,
   - normalization count > 0,
   - animatable fallback count > 0,
   - missing blueprint path count > 0.
2. If discrepancy review is declined, rig import returns `blocked_recoverable`.
3. Unhandled rig import exceptions map to `blocked_fatal`.

Pose import mapping:

1. Pose graph file import returns `blocked_recoverable` when remap decisions are required.
2. Remap apply returns `blocked_recoverable` for unresolved conflicts or unresolved/missing create-missing selections.
3. Parse/import exceptions map to `blocked_fatal`.
4. Successful remap apply without explicit downstream override defaults to `success_with_repair`.

Bundle synchronizer mapping:

1. `useBundleSynchronizer` gates success through `isImportOutcomeSuccess`.
2. Non-success rig/pose outcomes are surfaced to UI failure state with retry actions.

## Discrepancy Identity and Replay (`F5.2`)

Source: `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`.

Contract:

1. Discrepancy acceptance identity is content-hash based, not payload-length based.
2. Signature key is computed from canonical imported/rebuilt comparables plus imported/current face IDs:
   - `computeDiscrepancySignatureKey(...)`
   - `rig-import-v2:<hash>`
3. Accepted signatures are replayed via set membership for deterministic re-import behavior.
4. Changed content cannot bypass discrepancy review by length collision.

Regression gate:

1. `apps/vizij-authoring/src/hooks/useRigGraphImport.test.ts`.

## Bundle Alias Compatibility Adapter (`F5.4`)

Sources:

1. `packages/@vizij/render/src/functions/gltf-loading/import-compat.ts`
2. `packages/@vizij/render/src/functions/vizij-bundle.ts`
3. `packages/@vizij/render/src/types/vizij-bundle.ts`

Alias support:

1. `VIZIJ_bundle` (highest alias priority)
2. `vizij_bundle`
3. `VizijBundle`
4. `VIZIJBundle`

Candidate scopes and precedence:

1. Scope priority: `object` -> `parser-node` -> `parser-scene`.
2. Final deterministic sort key:
   - scope priority,
   - source index,
   - alias priority,
   - entry index.
3. First supported candidate (`version === 1`) wins.

Diagnostics contract:

1. Selection emits `bundle-selected`.
2. Non-selected supported candidates emit `bundle-candidate-ignored`.
3. Unsupported versions emit `unsupported-bundle-version`.
4. Unsupported variants emit `unsupported-bundle-variant`.
5. Invalid payload shapes emit `invalid-bundle-candidate`.
6. No supported candidates emit `no-supported-bundle-candidate`.

Loader surface:

1. `LoadedVizijAsset` exposes:
   - `bundle`,
   - `bundleSelection`,
   - `bundleDiagnostics`.

## Root Fallback and State Safety (`F5.5`)

Sources:

1. `apps/vizij-authoring/src/utils/world.ts`
2. `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts`
3. `packages/@vizij/render/src/functions/gltf-loading/traverse-three.ts`

Root resolution order in authoring:

1. Metadata root: first group with `rootBounds`.
2. Derived root fallback:
   - explicit `group.root`,
   - single-group world fallback.
3. Else return `blocked_recoverable` with actionable guidance.

State mutation safety:

1. `useVizijAssetLoader` resolves world root before calling `setStoreState(...)` and `addWorldElements(...)`.
2. If root resolution fails, prior loaded state remains intact (no pre-validation reset).

Render-derived bounds fallback:

1. `traverse-three` applies `applyDerivedRootBoundsFallback` when RobotData groups exist but no group has `rootBounds`.
2. Derived fallback uses scene bounds and marks a deterministic target group as root.

## Persistence Migration Registry (`F5.6`)

Sources:

1. `apps/vizij-authoring/src/rig/legacyMigration.ts`
2. `apps/vizij-authoring/src/rig/persistence.ts`
3. `apps/vizij-authoring/src/hooks/useRigPersistence.ts`

Version contract:

1. Current schema version: `3`.
2. Ordered migration chain:
   - `v1 -> v2`
   - `v2 -> v3`
3. Load always migrates forward to current schema before use.

Failure contract:

1. Unsupported future schemas fail with `unsupported_schema_version`.
2. Missing step/invalid schema failures map to migration failure outcomes.
3. Storage read/write/parse failures are typed and surfaced to users through deduped alert messaging.

Regression gate:

1. `apps/vizij-authoring/src/rig/persistence.test.ts`
2. `apps/vizij-authoring/src/rig/legacyMigration.test.ts`

## Pose Remap Create-Missing Flow (`F5.7`)

Sources:

1. `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`
2. `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`

Row-level contract:

1. Each remap row may set `createMissingInput: true` when mapped path does not exist.
2. Unknown targets without create-missing selection are blocked recoverably.

Apply-plan contract:

1. `buildPoseGraphRemapApplyPlan` returns one of:
   - `ready`,
   - `needs_creation`,
   - `conflict`.
2. Creation paths are deterministic and sorted.
3. Conflict messages are deterministic and sorted by target/row labels.
4. Output-path rewrites and input-id remaps are applied in deterministic sorted order.

Recovery contract:

1. If `createMissingStandardInput` is unavailable or creation fails, return `blocked_recoverable` with actionable detail.
2. Successful create-missing followed by apply proceeds without manual canonical path typing for common unresolved rows.

Regression gate:

1. `apps/vizij-authoring/src/hooks/__tests__/usePoseGraphImport.test.ts`
2. `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.test.tsx`

## Fixture Matrix Gate (`F5.8`)

Sources:

1. `apps/vizij-authoring/src/hooks/__fixtures__/import/*`
2. `apps/vizij-authoring/src/hooks/__tests__/importOutcomeMatrix.test.ts`

Fixture classes:

1. `legacy`
2. `current`
3. `malformed`

Gate assertions:

1. Required fixture classes are all present.
2. Fixture IDs are unique and deterministic (sorted).
3. Each fixture resolves to the expected import outcome class.
4. Success classification (`isImportOutcomeSuccess`) matches expectation.

Execution gate:

1. `pnpm --filter vizij-authoring run validate` executes Vitest, which includes the fixture matrix test.
2. This is the compatibility ratchet for outcome-class regressions in the authoring workspace gate.
