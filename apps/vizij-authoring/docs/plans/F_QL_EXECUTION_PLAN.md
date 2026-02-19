# Import Reliability + Quality Execution Plan (`F5.*` + `QL*`)

Last updated: 2026-02-19  
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
