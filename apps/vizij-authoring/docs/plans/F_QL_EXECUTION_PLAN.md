# Import Reliability + Quality Execution Plan (`F5.*` + `QL*`)

Last updated: 2026-02-20  
Status: `in_progress`

## Goal

Ship the remaining import-migration reliability work (Block `F`) and the quality backlog (`QL`) in dependency-safe, commit-sized increments so the authoring app has:

1. Explicit import outcome classes across rig + pose import paths.
2. Deterministic discrepancy identity and replay behavior.
3. User-visible, recoverable failure surfaces for asset/sample/bundle imports.
4. Compatibility-aware bundle parsing and recoverable root fallback behavior.
5. Versioned persistence migration with explicit failure reporting.
6. Complete pose remap workflow for missing standard inputs.
7. Stable fixture-matrix CI contracts and updated architecture docs.
8. Quality hardening across boundaries, type safety, tests, and performance ratchets.

## Scope

In scope:

1. Backlog items `F5.1` through `F5.8`.
2. Backlog-quality items `QL0.1` through `QL3.3`.
3. Tracker/backlog/roadmap/docs updates to reflect landed behavior.

Out of scope:

1. Monolithic graph refactor (roadmap-only note).
2. New blend-priority/weights policy features beyond existing `E4.*` scope.
3. Non-import UX redesign unrelated to acceptance checks.

## Delivery Strategy

We will execute as small commits with integrated gates:

1. Implement critical correctness (`F5.1`-`F5.3`) first.
2. Land import-compat and persistence/remap hardening (`F5.4`-`F5.7`).
3. Lock behavior with fixtures/contracts (`F5.8`).
4. Finish remaining `QL` architecture/type/perf/docs ratchets.

Each chunk includes:

1. Code changes.
2. Targeted tests.
3. `pnpm --filter` lint/typecheck/test for touched workspaces.

## Commit-Sized Chunks

### Wave 1 — Import Contracts and Failure Surfaces (P0)

#### Chunk 1 — Import outcome-class contract foundation (`F5.1`)

Intent:

1. Add shared import outcome types and deterministic mapping helpers.
2. Thread outcome status through rig import and pose import surfaces.

Planned files:

1. `apps/vizij-authoring/src/types/importOutcome.ts` (new)
2. `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`
3. `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`
4. `apps/vizij-authoring/src/state/graphRuntimeStore.tsx`
5. `apps/vizij-authoring/src/state/graphRuntimeStore.test.tsx` (or closest tests)

Acceptance:

1. Rig/pose import results always map to one of:
   - `success`
   - `success_with_repair`
   - `blocked_recoverable`
   - `blocked_fatal`
2. Mapping is explicit and test-covered.

#### Chunk 2 — Discrepancy identity hashing + replay (`F5.2`, `QL0.1`, `QL2.4`)

Intent:

1. Replace length-based signature key with content hash over canonical comparables.
2. Persist and replay safe discrepancy decisions keyed by source signature.

Planned files:

1. `apps/vizij-authoring/src/hooks/useRigGraphImport.ts`
2. `apps/vizij-authoring/src/utils/hash.ts`
3. `apps/vizij-authoring/src/hooks/useRigGraphImport.test.ts` (new/updated)

Acceptance:

1. Equal-length graph payloads with different content do not bypass review.
2. Same artifact can replay prior accepted decision safely.
3. Regression test reproduces prior collision path.

#### Chunk 3 — User-visible failure surface contract (`F5.3`, `QL0.2`, `QL0.3`, `QL2.5`)

Intent:

1. Surface asset-loader, sample-load, and bundle-sync import failures in UI.
2. Keep failures recoverable without hard refresh.

Planned files:

1. `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts`
2. `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts`
3. `apps/vizij-authoring/src/App.tsx`
4. `apps/vizij-authoring/src/components/app/AssetLoaderPanel.tsx` (if needed)
5. `apps/vizij-authoring/src/components/app/AppWizards.tsx` (if needed)
6. Targeted tests around new failure UI state

Acceptance:

1. All three failure classes are visible and actionable in app.
2. Retrying import path works after a failure.
3. Tests assert visible feedback and recoverability.

### Wave 2 — Compatibility, Root Hardening, Persistence, Remap (P1)

#### Chunk 4 — Bundle compatibility adapter (`F5.4`)

Intent:

1. Add metadata compatibility adapter for legacy/current bundle aliases.
2. Emit compatibility diagnostics for selected source and unsupported variants.

Planned files:

1. `packages/@vizij/render/src/functions/gltf-loading/import-compat.ts` (new)
2. `packages/@vizij/render/src/functions/vizij-bundle.ts`
3. `packages/@vizij/render/src/functions/gltf-loading/extract-animations.ts` (if aliasing needed)
4. `packages/@vizij/render/src/types/vizij-bundle.ts`
5. `packages/@vizij/render/src/**/__tests__/*`

Acceptance:

1. Legacy/current aliases resolve deterministically.
2. Multi-candidate entries follow deterministic selection.
3. Unsupported variants produce diagnostics, not silent drops.

#### Chunk 5 — Root fallback hardening (`F5.5`)

Intent:

1. Implement root fallback chain (`metadata -> derived bounds -> recoverable block`).
2. Avoid mutating authoring state before candidate validation succeeds.

Planned files:

1. `apps/vizij-authoring/src/utils/world.ts`
2. `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts`
3. `packages/@vizij/render/src/functions/gltf-loading/traverse-three.ts`
4. `apps/vizij-authoring/src/hooks/useVizijAssetLoader.test.ts` (new/updated)

Acceptance:

1. Missing root produces `blocked_recoverable` with guidance.
2. Existing loaded state remains intact on failed candidate load.

#### Chunk 6 — Persistence migration registry (`F5.6`)

Intent:

1. Add versioned `vN -> vN+1` migration registry.
2. Make migration/storage failures user-visible.

Planned files:

1. `apps/vizij-authoring/src/rig/persistence.ts`
2. `apps/vizij-authoring/src/rig/legacyMigration.ts`
3. `apps/vizij-authoring/src/hooks/useRigPersistence.ts`
4. `apps/vizij-authoring/src/rig/persistence.test.ts` (new)

Acceptance:

1. Ordered migrations are deterministic.
2. Legacy fixture payloads migrate with no data loss.
3. Storage failure path surfaces clear feedback.

#### Chunk 7 — Pose remap missing-input creation (`F5.7`)

Intent:

1. Extend pose remap flow with create-missing-standard-input option.
2. Keep apply-plan validation deterministic and test-covered.

Planned files:

1. `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts`
2. `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`
3. `apps/vizij-authoring/src/hooks/usePoseGraphImport.test.ts` (new/updated)

Acceptance:

1. User can create missing standard inputs inline in wizard.
2. Conflict resolution remains deterministic.
3. Common unresolved outputs do not require manual canonical typing.

### Wave 3 — Fixture Matrix + CI + Contract Docs (P1)

#### Chunk 8 — Fixture matrix and CI gate (`F5.8`)

Intent:

1. Add legacy/current/malformed fixture matrix with expected outcome assertions.
2. Wire fixture checks into CI validation path.

Planned files:

1. `apps/vizij-authoring/src/**/__fixtures__/import/*` (new)
2. `apps/vizij-authoring/src/hooks/__tests__/importOutcomeMatrix.test.ts` (new)
3. `apps/vizij-authoring/package.json` (script wiring if needed)
4. CI workflow config if required

Acceptance:

1. Matrix asserts outcome classes for supported fixture classes.
2. CI fails on contract regressions.

#### Chunk 9 — Import compatibility contract docs (`F5.8`, `QL3.3` partial)

Intent:

1. Publish import-compat contract doc as source of truth.
2. Cross-link backlog/tracker/roadmap.

Planned files:

1. `apps/vizij-authoring/docs/ARCHITECTURE.md`
2. `apps/vizij-authoring/docs/UI_DESIGN.md`
3. `apps/vizij-authoring/docs/plans/ROADMAP.md`
4. `apps/vizij-authoring/docs/plans/TRACKER.md`
5. `apps/vizij-authoring/docs/plans/BACKLOG.md`
6. `apps/vizij-authoring/docs/plans/BACKLOG_QUALITY_2026-02-19.md`
7. `apps/vizij-authoring/docs/references/import-compat-contract.md` (new)

Acceptance:

1. One doc defines supported import formats + outcomes.
2. Planning docs reference the same contract.

### Wave 4 — Remaining Quality Backlog (`QL0.4` onward)

#### Chunk 10 — Runtime bundle identity + inert subscriptions (`QL0.4`)

1. Memoize `runtimeBundle` in `App.tsx`.
2. Remove top-level `useGraphRuntime` selectors with no effect.
3. Add contract tests for runtime non-reinit behavior.

#### Chunk 11 — `poseGroupSegment` contract alignment (`QL0.5`)

1. Either implement `poseGroupSegment` behavior or remove API.
2. Add explicit tests for chosen contract.

#### Chunk 12 — Split `useRigController` boundaries (`QL1.1`)

1. Move UI selection/filter state into dedicated UI store/context.
2. Keep runtime orchestration in `useRigController`.

#### Chunk 13 — Extract compile/diff orchestration services (`QL1.2`)

1. Move heavy logic from `DebugPanel` and `GraphDiagnosticsPanel` into hook/service layer.

#### Chunk 14 — Hierarchy logic consolidation (`QL1.3`)

1. Extract shared tree logic for hierarchy surfaces.

#### Chunk 15 — Standard-input merge consolidation (`QL1.4`)

1. Introduce shared merge/dedup utility for feature-spaces panels.

#### Chunk 16 — Type safety hardening (`QL1.5`, `QL1.6`, `QL1.7`)

1. Remove `any` and `as any` paths in scene features/material constraints/runtime payload writes.
2. Add type guards and diagnostics.

#### Chunk 17 — Shared variable sync memoization (`QL1.8`)

1. Stabilize shared context value identity.
2. Add rerender-pressure tests.

#### Chunk 18 — E4 scenario behavior tests + assertion quality (`QL2.1`, `QL2.2`)

1. Add numeric-output scenario tests (`S1`-`S4`).
2. Replace brittle node-name assertions where feasible.

#### Chunk 19 — Override/diagnostics workflow tests (`QL2.3`)

1. Add interactive store workflow coverage for override edit + diagnostics sync.

#### Chunk 20 — Performance/type/docs ratchets (`QL3.1`, `QL3.2`, `QL3.3` remainder)

1. Add performance contract tests.
2. Add lint/type ratchet rules for reviewed modules.
3. Final architecture/UI docs sync for boundary/error guarantees.

## Validation Gates

Per chunk (minimum):

1. `pnpm --filter vizij-authoring run test -- <targeted tests>`
2. `pnpm --filter vizij-authoring run typecheck`
3. `pnpm --filter vizij-authoring run lint`
4. If `@vizij/render` or package code changed:
   - `pnpm --filter @vizij/render run test`
   - `pnpm --filter @vizij/render run typecheck`
   - `pnpm --filter @vizij/render run lint`
5. If `@vizij/node-graph-authoring` changed:
   - `pnpm --filter @vizij/node-graph-authoring run test`
   - `pnpm --filter @vizij/node-graph-authoring run typecheck`
   - `pnpm --filter @vizij/node-graph-authoring run lint`

Final gate after all chunks:

1. `pnpm --filter vizij-authoring run validate`
2. `pnpm run prep`

## Progress Log

- 2026-02-19: Plan created and approved for execution.
- 2026-02-19: `F5.1` completed in working tree. Added shared outcome helpers in `src/types/importOutcome.ts`, threaded typed outcomes through rig/pose import surfaces, and aligned remap wizard/import panel contracts to return `PoseImportResult`.
- 2026-02-19: `F5.1` validation gates run for touched `vizij-authoring` scope: targeted Vitest pass (`src/types/importOutcome.test.ts`, `src/hooks/__tests__/usePoseGraphImport.test.ts`, `src/components/app/PoseRigPanels.test.tsx`), `typecheck` pass, and `lint` pass.
- 2026-02-19: `F5.2` completed in working tree. Replaced discrepancy signature keying with content-hash identity (`computeDiscrepancySignatureKey`) over canonical comparables + face ids, and expanded accepted-signature replay from single-last-entry to set-based replay.
- 2026-02-19: Added `F5.2` regression coverage in `src/hooks/useRigGraphImport.test.ts` to prove equal-length/different-content payloads no longer collide and same payload yields deterministic replay key.
- 2026-02-19: `F5.2` validation gates run for touched `vizij-authoring` scope: targeted Vitest pass (`src/hooks/useRigGraphImport.test.ts`, `src/types/importOutcome.test.ts`, `src/hooks/__tests__/usePoseGraphImport.test.ts`, `src/components/app/PoseRigPanels.test.tsx`), `typecheck` pass, and `lint` pass.
- 2026-02-19: `F5.3` completed in working tree. Added visible/import-recoverable failure surfaces for asset load, sample fetch/load, and bundle sync import failures via `ImportFailureStack` in `App.tsx` and bundle sync failure callbacks in `useBundleSynchronizer.ts`.
- 2026-02-19: Added `F5.3` UI + retry regression coverage in `src/components/app/ImportFailureStack.test.tsx` and `src/hooks/__tests__/useBundleSynchronizer.test.ts` (failure callback + retry token replay behavior).
- 2026-02-19: `F5.3` validation gates run for touched `vizij-authoring` scope: targeted Vitest pass (`src/components/app/ImportFailureStack.test.tsx`, `src/hooks/__tests__/useBundleSynchronizer.test.ts`, `src/hooks/useRigGraphImport.test.ts`, `src/types/importOutcome.test.ts`), `typecheck` pass, and `lint` pass.
- 2026-02-19: `F5.4` completed in working tree. Added `@vizij/render` import compatibility adapter in `src/functions/gltf-loading/import-compat.ts` and wired deterministic candidate resolution + diagnostics-capable extraction via `extractVizijBundleResult` in `src/functions/vizij-bundle.ts`.
- 2026-02-19: `F5.4` type contracts added in `packages/@vizij/render/src/types/vizij-bundle.ts` (`VizijBundleExtractionResult`, compatibility source/diagnostic types), with loader surfaces exposing extraction diagnostics via `LoadedVizijAsset` in `packages/@vizij/render/src/functions/load-gltf.ts`.
- 2026-02-19: Added `F5.4` regression coverage in `packages/@vizij/render/tests/vizij-bundle.node-test.mjs` for alias precedence, deterministic multi-candidate selection, and unsupported variant diagnostics.
- 2026-02-19: `F5.4` validation gates run for touched `@vizij/render` scope: `pnpm --filter "@vizij/render" test`, `pnpm --filter "@vizij/render" typecheck`, and `pnpm --filter "@vizij/render" lint` all pass.
- 2026-02-19: `F5.5` completed in working tree. Root resolution now uses explicit recoverable outcomes (`resolveWorldRoot`) in `apps/vizij-authoring/src/utils/world.ts`, and `useVizijAssetLoader` no longer clears loaded state before candidate validation (preserves prior world/bundle on blocked candidate load).
- 2026-02-19: Added render-side derived-root fallback in `packages/@vizij/render/src/functions/gltf-loading/traverse-three.ts` to synthesize root bounds from scene geometry when RobotData imports omit root bounds metadata.
- 2026-02-19: Added `F5.5` regression coverage in `apps/vizij-authoring/src/utils/world.test.ts` and `apps/vizij-authoring/src/hooks/useVizijAssetLoader.test.tsx` for metadata-vs-derived root strategy and no-partial-state mutation on blocked loads.
- 2026-02-19: `F5.5` validation gates run for touched workspaces: `pnpm --filter vizij-authoring exec vitest --run src/hooks/useVizijAssetLoader.test.tsx src/utils/world.test.ts`, `pnpm --filter vizij-authoring run typecheck`, `pnpm --filter vizij-authoring run lint`, and (`@vizij/render`) `test`/`typecheck`/`lint` all pass.
- 2026-02-19: Next execution target set to Wave 2 Chunk 6 (`F5.6`) for deterministic persistence migration registry and explicit storage/migration failure reporting.
- 2026-02-19: `F5.6` completed in working tree. Added versioned ordered persistence migrations (`v1 -> v2 -> v3`) via `migratePersistedRigState` in `src/rig/legacyMigration.ts`, and routed `loadRigState` through that registry with typed persistence error outcomes in `src/rig/persistence.ts`.
- 2026-02-19: Added `F5.6` coverage in `src/rig/persistence.test.ts` for deterministic ordered migrations, legacy payload migration with no field loss, and typed storage/migration failure surfacing; existing `src/rig/legacyMigration.test.ts` remains green.
- 2026-02-19: `F5.6` user-visible failure reporting landed in `src/hooks/useRigPersistence.ts` by surfacing persistence load/save/delete failures through deduped `alertDialog` messaging and restoring persisted `standardInputSchema` on successful loads.
- 2026-02-19: `F5.6` validation gates run for touched `vizij-authoring` scope: `pnpm --filter vizij-authoring exec vitest --run src/rig/persistence.test.ts src/rig/legacyMigration.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-19: Next execution target set to Wave 2 Chunk 7 (`F5.7`) for pose remap missing-standard-input creation flow and deterministic apply-plan validation coverage.
- 2026-02-19: `F5.7` completed in working tree. Added row-level `createMissingInput` remap contract in `src/components/poseRig/PoseGraphRemapWizard.tsx` + `src/hooks/usePoseGraphImport.ts`, including explicit unknown-target blocking unless create-missing is selected.
- 2026-02-19: `F5.7` apply path now creates missing standard inputs deterministically (sorted path order) before final remap compilation via `createMissingStandardInput` wiring from `App.tsx` into `usePoseGraphImport`.
- 2026-02-19: Added `F5.7` regression coverage in `src/hooks/__tests__/usePoseGraphImport.test.ts` (unknown-target block, sorted unique create-path plan, deterministic conflict message ordering) and `src/components/poseRig/PoseGraphRemapWizard.test.tsx` (row-level create-missing UI gating and apply payload propagation).
- 2026-02-19: `F5.7` validation gates run for touched `vizij-authoring` scope: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/usePoseGraphImport.test.ts src/components/poseRig/PoseGraphRemapWizard.test.tsx`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-19: Next execution target set to Wave 3 Chunk 8 (`F5.8`) for fixture matrix + CI contract gate coverage.
- 2026-02-19: `F5.8` (Chunk 8) completed in working tree. Added import outcome fixture matrix under `src/hooks/__fixtures__/import/*` for `legacy`, `current`, and `malformed` fixture classes with deterministic IDs and expected outcome-class metadata.
- 2026-02-19: Added fixture-matrix regression gate in `src/hooks/__tests__/importOutcomeMatrix.test.ts` asserting class coverage, deterministic/unique fixture IDs, and expected outcome-class resolution (`resolveRigImportSuccessStatus`, `createPoseImportResult`, `isImportOutcomeSuccess`).
- 2026-02-19: `F5.8` (Chunk 8) validation gates run for touched `vizij-authoring` scope: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/importOutcomeMatrix.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-19: Next execution target set to Wave 3 Chunk 9 (`F5.8` + `QL3.3` partial) for import compatibility contract docs and cross-linked planning records.
- 2026-02-19: `F5.8` (Chunk 9) completed in working tree. Published import compatibility contract source-of-truth at `docs/references/import-compat-contract.md` with outcome-class mapping, bundle alias adapter precedence, root fallback chain, persistence migration guarantees, pose remap create-missing flow, and fixture-matrix gate contract.
- 2026-02-19: Cross-linked contract docs and planning records updated: `docs/ARCHITECTURE.md`, `docs/UI_DESIGN.md`, `docs/plans/ROADMAP.md`, `docs/plans/TRACKER.md`, `docs/plans/BACKLOG.md`, and `docs/plans/BACKLOG_QUALITY_2026-02-19.md`.
- 2026-02-19: Stage/board statuses aligned to working tree: Stage 5 marked done in `ROADMAP.md`; `F5.1`-`F5.8` marked done with completion notes in backlog/tracker docs; `QL3.3` marked in-progress with import-doc subset complete.
- 2026-02-19: Next execution target set to Wave 4 Chunk 10 (`QL0.4`) for runtime bundle identity stabilization and inert runtime subscription cleanup.
- 2026-02-19: `QL0.4` (Chunk 10) completed in working tree. Runtime base bundle identity is now memoized via `useRuntimeBaseBundle` (`src/hooks/useRuntimeBaseBundle.ts`) and `App.tsx` now consumes the memoized value instead of rebuilding on every rerender.
- 2026-02-19: Removed inert top-level runtime selectors in `App.tsx` (`graphSpec`, `poseGraphSpec`, `poseConfig`, discrepancy callbacks) that had no direct effect and only increased rerender pressure.
- 2026-02-19: Added runtime non-reinit contract coverage in `src/hooks/__tests__/useRuntimeBaseBundle.test.tsx` asserting stable bundle identity across unrelated rerenders and rebuild only when true dependencies change.
- 2026-02-19: `QL0.4` validation gates run for touched `vizij-authoring` scope: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useRuntimeBaseBundle.test.tsx`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-19: Next execution target set to Wave 4 Chunk 11 (`QL0.5`) for `poseGroupSegment` contract alignment (implement or remove with tests).
- 2026-02-19: `QL0.5` (Chunk 11) completed in working tree by removing the unused `poseGroupSegment` option from `buildPoseGraphSpec`, `buildPoseGraphSpecFromIr`, and `PoseGraphService` public option types.
- 2026-02-19: Added explicit API-removal contract coverage in `src/poseRig/services/poseGraphService.test.ts` (`@ts-expect-error` assertion that `poseGroupSegment` is no longer accepted on `PoseGraphService.buildSpec`).
- 2026-02-19: `QL0.5` validation gates run for touched `vizij-authoring` scope: `pnpm --filter vizij-authoring exec vitest --run src/poseRig/services/poseGraphService.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-19: Next execution target set to Wave 4 Chunk 12 (`QL1.1`) to split `useRigController` boundary responsibilities.
- 2026-02-19: Post-import reliability follow-up: hardened GLB export failure surfacing. `packages/@vizij/render/src/functions/export.ts` now returns a `Promise` and rejects on async exporter failures (instead of silent no-op), and `apps/vizij-authoring/src/hooks/useVizijExport.ts` now catches export failures and shows actionable alert messaging.
- 2026-02-19: Added export-failure regression coverage in `apps/vizij-authoring/src/hooks/__tests__/useVizijExport.test.tsx` (`surfaces an alert when scene export fails`).
- 2026-02-19: Export-failure hardening validation gates run for touched scopes: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useVizijExport.test.tsx`, `pnpm --filter vizij-authoring run typecheck`, `pnpm --filter vizij-authoring run lint`, `pnpm --filter @vizij/render run typecheck`, and `pnpm --filter @vizij/render run lint` all pass.
- 2026-02-19: Investigated export crash `Cannot read properties of null (reading 'traverse')` (`robotData.ts` via `useVizijExport.ts`). Root cause: `getExportableBodies` could include group refs whose `.current` was null during export.
- 2026-02-19: Hardened exportable-body handling across layers:
  1. `@vizij/render` store now filters `getExportableBodies` to mounted group refs only (`packages/@vizij/render/src/store.ts`).
  2. Authoring export now sanitizes bodies with runtime `traverse` guard before selecting primary body (`apps/vizij-authoring/src/hooks/useVizijExport.ts`).
  3. `applyDefaultsToRobotData` now skips null/non-traversable entries defensively (`apps/vizij-authoring/src/utils/robotData.ts`).
- 2026-02-19: Added regression coverage `guards against null exportable bodies` in `apps/vizij-authoring/src/hooks/__tests__/useVizijExport.test.tsx`.
- 2026-02-19: Null-body export hardening validation gates run for touched scopes: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useVizijExport.test.tsx`, `pnpm --filter vizij-authoring run typecheck`, `pnpm --filter vizij-authoring run lint`, `pnpm --filter @vizij/render run typecheck`, and `pnpm --filter @vizij/render run lint` all pass.
- 2026-02-19: Follow-up export readiness fix for false `Load a Vizij asset before exporting` warning on loaded assets.
  1. `@vizij/render` `getExportableBodies(filterIds)` no longer requires `rootBounds` when explicit root IDs are provided (supports derived-root assets without metadata root bounds).
  2. Authoring export now retries export-body discovery up to 3 frames before blocking, reducing transient null-ref timing misses.
- 2026-02-19: Export body discovery hardened for runtime-viewer flows where render refs are not guaranteed to mount before export.
  1. GLTF import now seeds per-node `__source__` refs with source `three` objects (`namespaceArrayToRefs(..., sourceObject)`), so export can resolve traversable bodies even without mounted `Vizij` render refs.
  2. Applied across RobotData and aggressive-import paths (`traverse-three.ts`, `import-group.ts`, `import-mesh.ts`).
- 2026-02-19: Export UX contract refinement based on runtime feedback:
  1. GLB export no longer blocks on pose-graph validation when pose config has zero poses; in this case export omits pose-driver graph while preserving rig/bundle export.
  2. Bundle contract violations (including missing runtime target outputs) now support explicit user override via confirm dialog (`Continue export anyway?`) instead of hard block-only behavior.
- 2026-02-19: Import face-identity stabilization follow-up:
  1. `useRigGraphImport` no longer auto-renames active face ID to `importedFaceId` on accepted imports by default.
  2. Face-ID changes now occur only for explicit rename intent (`renameFaceId`) or missing-face adoption.
  3. This prevents stale imported face metadata from leaking into later exports and triggering repeated face mismatch warnings on re-import.
- 2026-02-19: Persistence warning messaging improved for save failures: storage write errors now include underlying cause text, and quota-like failures include actionable guidance (`Storage appears full or blocked...`) in `formatRigPersistenceError`.
- 2026-02-19: Follow-up validation gates run for touched scopes: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useVizijExport.test.tsx src/rig/persistence.test.ts`, `pnpm --filter vizij-authoring run typecheck`, `pnpm --filter vizij-authoring run lint`, and for `@vizij/render` `test`/`typecheck`/`lint` all pass.
- 2026-02-19: Added export regression coverage in `src/hooks/__tests__/useVizijExport.test.tsx` for:
  1. `exports without a pose graph when pose config has zero poses`
  2. `allows overriding bundle target mismatch via confirm dialog`
- 2026-02-19: Validation rerun after export contract refinement: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useVizijExport.test.tsx`, `pnpm --filter vizij-authoring run typecheck`, `pnpm --filter vizij-authoring run lint`, `pnpm --filter @vizij/render run typecheck`, and `pnpm --filter @vizij/render run lint` all pass.
- 2026-02-19: Validation rerun after import face-identity stabilization: `pnpm --filter vizij-authoring exec vitest --run src/hooks/useRigGraphImport.test.ts src/hooks/__tests__/useVizijExport.test.tsx`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: Fixed bundle-sync import loop regression after face-identity stabilization follow-up. `useBundleSynchronizer` now tracks active fingerprint separately from completed fingerprint, so rig import runs once per bundle snapshot while pose import can wait for `standardInputCount > 0` without resetting rig import state.
- 2026-02-20: Bundle-sync hardening now gates `standardInputCount` only for pose-config import paths and preserves retry behavior via `retryToken`; no-pose bundles can complete sync without unnecessary waiting.
- 2026-02-20: Added regression coverage in `src/hooks/__tests__/useBundleSynchronizer.test.ts` for:
  1. `does not re-import rig while waiting for standard inputs`
  2. `imports poses after standard inputs become available without rerunning rig import`
- 2026-02-20: Validation rerun for synchronizer hardening: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useBundleSynchronizer.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: `QL1.1` execution started with a dedicated rig UI filter store boundary (`src/state/rigUiStore.tsx`) for UI-only selection/filter state:
  1. `selectedStandardInputRoots`
  2. `selectedStandardInputSubgroups`
  3. `hiddenDriverIds` + hide/show handlers
- 2026-02-20: `RigControllerProvider` now owns and provides `rigUiStore`, and `useRigController` now reads/writes UI filter state through that store instead of local `useState` ownership (`src/state/RigControllerProvider.tsx`, `src/hooks/useRigController.ts`).
- 2026-02-20: Compatibility bridge retained for this slice: binding authoring store still receives these values/handlers so existing UI consumers continue to work while boundary ownership is moved.
- 2026-02-20: Added store regression coverage in `src/state/__tests__/stores.test.ts` (`rigUiStore` selection/filter mutations + subscriber notifications).
- 2026-02-20: Validation rerun for QL1.1 slice: `pnpm --filter vizij-authoring exec vitest --run src/state/__tests__/stores.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: `QL1.1` follow-up completed for direct UI consumers:
  1. `FeatureList` hidden-driver controls now consume `useRigUi`.
  2. `StandardInputCoveragePanel` hidden-driver metrics now consume `useRigUi`.
  3. `PoseRigProvider` hidden input filtering now consumes `useRigUi`.
- 2026-02-20: Updated related tests/mocks for new UI-store boundary (`src/components/app/StandardInputCoveragePanel.test.tsx`, `src/state/PoseRigProvider.test.tsx`) and revalidated `stores.test.ts`.
- 2026-02-20: Validation rerun for QL1.1 follow-up: `pnpm --filter vizij-authoring exec vitest --run src/components/app/StandardInputCoveragePanel.test.tsx src/state/PoseRigProvider.test.tsx src/state/__tests__/stores.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: `QL1.2` started by extracting DebugPanel bundle graph compile/update orchestration into `src/hooks/useBundleGraphMaintenance.ts`.
  1. `handleOverwriteBundleGraph` moved out of `DebugPanel` render module.
  2. `handleRenameBundleOutput` moved out of `DebugPanel` render module.
  3. `DebugPanel` now delegates bundle maintenance actions to the new hook.
- 2026-02-20: Added `useBundleGraphMaintenance` regression coverage (`src/hooks/__tests__/useBundleGraphMaintenance.test.ts`) for overwrite path, empty-path validation, and IR rename+recompile path.
- 2026-02-20: Validation rerun for QL1.2 slice: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useBundleGraphMaintenance.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: `QL1.2` follow-up completed by extracting `GraphDiagnosticsPanel` IR diff/report orchestration into `src/hooks/useMachineReportDiff.ts`.
  1. Diff compare/parse and file-load logic moved out of `IrInspectorDrawer`.
  2. Bug-report template + CLI command derivation moved out of panel module.
  3. `GraphDiagnosticsPanel` now consumes hook APIs for diff/report orchestration.
- 2026-02-20: Added regression coverage in `src/hooks/__tests__/useMachineReportDiff.test.ts` for missing-report guard, invalid payload handling, valid report diffing, and close/reset behavior.
- 2026-02-20: Validation rerun for QL1.2 follow-up: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useMachineReportDiff.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: Next execution target set to Wave 4 Chunk 14 (`QL1.3`) for hierarchy logic consolidation.
- 2026-02-20: `QL1.3` completed by extracting shared hierarchy surface orchestration into `src/components/scene-composer/useHierarchySurfaceState.ts`.
  1. Shared search/filter + expand-on-selection/search logic moved out of both `HierarchyPanel` and `SceneHierarchyPanel`.
  2. Shared parent-reparent blocking logic extracted as `computeBlockedHierarchyParentIds`.
  3. Both hierarchy surfaces now consume the shared hook/helper boundary.
- 2026-02-20: Added QL1.3 regression coverage in `src/components/scene-composer/useHierarchySurfaceState.test.tsx` for selection/search-driven expansion behavior and blocked-parent descendant computation.
- 2026-02-20: Validation rerun for QL1.3: `pnpm --filter vizij-authoring exec vitest --run src/components/scene-composer/useHierarchySurfaceState.test.tsx src/components/scene-composer/useHierarchyTreeState.test.tsx src/components/scene-composer/hierarchyFilters.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: Next execution target set to Wave 4 Chunk 15 (`QL1.4`) for standard-input merge consolidation.
- 2026-02-20: `QL1.4` completed by centralizing standard-input merge/dedup logic in `src/utils/standardInputMerge.ts`.
  1. Added shared normalized-path helpers: `buildStandardInputMapByNormalizedPath`, `mergeReferenceAndMainStandardInputs`, and `buildNormalizedPathSet`.
  2. `StdFeatureSpacesControls` now consumes shared merge/map helpers for union and per-face normalized lookups.
  3. `StdFeatureSpacesChannelsPanel` now consumes shared merge/path-set helpers for combined single-tree inputs and missing/adopt comparisons.
- 2026-02-20: Added QL1.4 regression coverage in `src/utils/__tests__/standardInputMerge.test.ts` for normalized dedupe behavior, standard-path filtering, and deterministic merge ordering.
- 2026-02-20: Validation rerun for QL1.4: `pnpm --filter vizij-authoring exec vitest --run src/utils/__tests__/standardInputMerge.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: Next execution target set to Wave 4 Chunk 16 (`QL1.5`, `QL1.6`, `QL1.7`) for type-safety hardening across scene features/material constraints/runtime payload writes.
- 2026-02-20: `QL1.5` completed by replacing weak scene-feature runtime typing in `src/scene/featureEntries.ts` with a concrete `Feature` union contract (`RenderableLike.features: Record<string, Feature | undefined>`), eliminating the local `value: any` path.
- 2026-02-20: `QL1.6` completed by removing `as any` casts from material inspector constraint update paths in `src/components/inspector/RiggingMaterialSection.tsx`.
  1. Added typed scalar + color constraint update helpers (`number` and tuple-based `rgb/hsl` constraint writes).
  2. Replaced untyped static-color patching with typed `RawValue` color extraction helpers.
  3. Removed `any` usage from inspector binding/update prop contracts in this section.
- 2026-02-20: `QL1.7` completed by adding guarded runtime write payload extraction in `src/hooks/graphRuntime.ts`.
  1. Runtime graph output application now validates write containers and entries via explicit record/path checks.
  2. Invalid write containers/entries are ignored safely with diagnosable warnings instead of `unknown -> any` casts.
- 2026-02-20: Added QL1.7 regression coverage in `src/hooks/__tests__/graphRuntime.test.ts` for malformed write containers/entries and mixed valid-invalid write replay behavior.
- 2026-02-20: Validation rerun for QL1.5-QL1.7: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/graphRuntime.test.ts src/scene/featureEntries.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: Next execution target set to Wave 4 Chunk 17 (`QL1.8`) for shared variable sync context memoization and rerender-pressure coverage.
- 2026-02-20: `QL1.8` completed by memoizing shared-variable sync context return identity in `src/hooks/useSharedVariableSync.ts` (stable `useMemo` return boundary over existing derived fields and handlers).
- 2026-02-20: Added rerender-pressure regression coverage in `src/hooks/__tests__/useSharedVariableSync.test.tsx` (`keeps result identity stable across unrelated rerenders`) to assert referential stability across no-op rerenders.
- 2026-02-20: Validation rerun for QL1.8: `pnpm --filter vizij-authoring exec vitest --run src/hooks/__tests__/useSharedVariableSync.test.tsx`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: Next execution target set to Wave 4 Chunk 18 (`QL2.1`, `QL2.2`) for behavior-level E4 scenario tests and assertion-quality hardening.
- 2026-02-20: `QL2.1` completed by adding behavior-level E4 scenario assertions to `src/poseRig/services/poseGraphService.test.ts` (`matches documented E4 overlap scenario outputs (S1-S4)`).
  1. Added numeric-output checks for additive, weighted-average, priority, and heuristic-weighted policies.
  2. Locked S1-S4 expected outputs to the 2026-02-19 overlap heuristics design pack values.
- 2026-02-20: `QL2.2` completed by replacing brittle exact-node-id assertions where feasible in overlap-policy topology tests:
  1. `src/poseRig/services/poseGraphService.test.ts` now uses semantic topology predicates (type + stage/policy intent) instead of single exact synthetic node IDs for priority/stage checks.
  2. `src/poseRig/graphBuilder.test.ts` now asserts policy/stage topology via predicate-based node sets and cross-path absence checks rather than single literal node-id equality.
- 2026-02-20: Validation rerun for QL2.1/QL2.2: `pnpm --filter vizij-authoring exec vitest --run src/poseRig/services/poseGraphService.test.ts src/poseRig/graphBuilder.test.ts`, `pnpm --filter vizij-authoring run typecheck`, and `pnpm --filter vizij-authoring run lint` all pass.
- 2026-02-20: Next execution target set to Wave 4 Chunk 19 (`QL2.3`) for interactive store workflow tests around override editing and diagnostics synchronization.
