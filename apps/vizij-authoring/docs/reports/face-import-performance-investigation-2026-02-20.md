# Face Import Performance Investigation (30s Load)

Date: 2026-02-20  
Scope: `apps/vizij-authoring` import + runtime sync path  
Goal: explain what the import pipeline is doing, why it is slow, where work is duplicated, and what we can safely change without breaking currently working functionality.

## Executive Summary

The current import path is functionally correct but doing too much expensive work on the main thread, too many times.

The biggest contributors are:

1. repeated graph normalization/compile work during import,
2. repeated full graph rebuilds during state hydration,
3. repeated runtime graph publishes (topology/pose) while state is still stabilizing,
4. expensive fingerprinting (`JSON.stringify` of full bundle graphs/poses) on every sync effect pass,
5. dev-mode Strict Mode doubling mount/effect work, which amplifies all of the above during local testing.

Your log matches this pattern exactly: repeated `import normalization applied`, repeated `import comparison`, many `graph-bridge` topology publishes, multiple graph-summary count jumps, and repeated IR compile warning emissions.

## What the Import Process Is Trying To Accomplish

The pipeline is doing real, necessary work in this order.

1. Load GLB + bundle into app state.

- `useVizijAssetLoader` loads world/animatables/bundle and sets `rootId`/`bundle`.
- File: `apps/vizij-authoring/src/hooks/useVizijAssetLoader.ts:19`

2. Synchronize bundle rig + pose into authoring state.

- `useBundleSynchronizer` runs in an effect, builds a fingerprint, imports rig graph first, then pose config.
- Files: `apps/vizij-authoring/src/hooks/useBundleSyncState.ts:56`, `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:95`

3. Rehydrate rig authoring structures from graph metadata.

- `useRigGraphImport` rebuilds inputs/bindings/autorig relationships and runs discrepancy checks.
- Files: `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:116`, `apps/vizij-authoring/src/rig/importer.ts:617`

4. Build runtime graph from current authoring state.

- `useRigController` rebuilds graph spec from current inputs/bindings/animatables/pose compose modes.
- File: `apps/vizij-authoring/src/hooks/useRigController.ts:1387`

5. Compile IR runtime spec (or fallback to legacy spec if compile has issues).

- `resolveRuntimeGraphSpec` compiles IR and logs warnings.
- File: `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:17`

6. Publish rig/pose updates to runtime.

- `RuntimeGraphBridge` sends topology/pose mutations to runtime provider.
- File: `apps/vizij-authoring/src/components/app/Viewer.tsx:95`

7. Normalize and publish pose graph/config revisions.

- `PoseRigProvider` normalizes pose graph and bumps pose runtime revision.
- File: `apps/vizij-authoring/src/state/PoseRigProvider.tsx:243`

This is all valid behavior. The problem is that expensive parts repeat while state is still converging.

## Where Time Is Being Wasted

## 1) Import preprocessing does expensive work up front, every import attempt

In `useBundleSynchronizer`, rig import path does:

1. `prepareSpecForImport` (which can compile IR),
2. `normalizeGraphSpec`,
3. `importGraphSpec`.

File: `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:145`

`prepareSpecForImport` itself can compile IR from metadata:

- File: `apps/vizij-authoring/src/utils/graphImport.ts:63`

That is already heavy.

## 2) Rig import path then does another heavy comparison pipeline

Inside `useRigGraphImport`, we also do:

1. rehydrate rig data,
2. rebuild graph from rehydrated state,
3. normalize imported and rebuilt specs,
4. canonicalize + stringify + hash + diff.

Files: `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:228`, `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:240`, `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:364`

Important detail: even with `skipDiscrepancyCheck`, most of this heavy comparison path still runs before the wizard gate is checked. So "skip checks" currently skips UX flow, not most compute cost.

## 3) Bundle fingerprinting is expensive and repeated

`useBundleSynchronizer` computes fingerprint via `JSON.stringify` over full graphs + poses config:

- File: `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:108`

For big graphs, this is expensive by itself, and it runs on each effect pass caused by dependency changes (`standardInputCount`, `rigImportEpoch`, etc.).

## 4) Runtime graph rebuild/compile repeats while import state is stabilizing

`useRigController` rebuilds graph when bindings/inputs/metadata/pose config change:

- File: `apps/vizij-authoring/src/hooks/useRigController.ts:1387`

Then IR compile runs again through `resolveRuntimeGraphSpec`:

- File: `apps/vizij-authoring/src/hooks/useRigController.ts:1414`
- File: `apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:25`

During import, multiple state transitions happen quickly, so this repeats several times.

## 5) Runtime bridge publishes many topology/pose mutations

`RuntimeGraphBridge` pushes new bundle mutations whenever graph or pose revisions change:

- File: `apps/vizij-authoring/src/components/app/Viewer.tsx:106`

Given repeated revision bumps during import stabilization, runtime receives many large updates before final steady state.

## 6) Pose graph normalization repeats as pose state changes

`PoseRigProvider` normalizes pose graph on each `poseRig.poseGraphSpec` update:

- File: `apps/vizij-authoring/src/state/PoseRigProvider.tsx:258`

If pose state updates multiple times during import hydration, this adds another recurring WASM cost.

## 7) Dev Strict Mode amplifies duplicate work

The app mounts under `React.StrictMode`:

- File: `apps/vizij-authoring/src/main.tsx:11`

In dev, mount/effect cycles are intentionally repeated, so costly import effects can run twice. Your log has multiple back-to-back duplicated messages that are consistent with this.

## Log Correlation (What Your Console Output Is Telling Us)

1. `import comparison` and `Import normalization applied` appearing multiple times indicates repeated full rig import/comparison passes, not just one-time setup.
2. `graph summary` counts rising across multiple entries (`251 -> 528 -> 552 -> 576`) indicates repeated rebuild phases while inputs/bindings/pose state are still being mutated.
3. many `[vizij-runtime][graph-bridge] { mutationClass: 'topology' ... }` lines indicate runtime bundle publication churn.
4. repeated `IR runtime compile reported issues` indicates repeated runtime compile attempts on changing intermediate graph state.
5. repeated faceId mismatch warning from importer indicates same graph rehydration path being entered multiple times.

## What We Should Change (Safely)

This plan preserves current behavior and correctness first, then removes waste.

## Phase 1: Instrument and prove hot spots (low risk)

1. Add coarse timers around:

- `prepareSpecForImport`
- `normalizeGraphSpec` calls (rig and pose paths)
- `useRigGraphImport` total duration
- `buildRigGraphSpec` + `resolveRuntimeGraphSpec`
- `RuntimeGraphBridge` publish duration and publish count

2. Capture per-import report object in dev console once import settles (single summary).

Expected result: exact ms and call counts for each stage, so we optimize the real bottleneck first.

## Phase 2: Remove duplicated import compute (low-to-medium risk)

1. Replace full-structure fingerprint stringify with stable fingerprint inputs.

- Prefer bundle version + graph ids + graph revision markers (+ retry token).
- Avoid `JSON.stringify` entire graph payloads each pass.

2. Short-circuit discrepancy pipeline when skip is enabled.

- If `skipDiscrepancyCheck` is true, skip canonicalize/stringify/hash/diff pipeline.
- Keep normalization needed for correctness only.

3. Reuse canonical normalized graph artifact across import stages.

- Avoid normalize/compile on equivalent payload more than once per import pass.

Expected result: large reduction in main-thread import cost with no behavior change.

## Phase 3: Reduce runtime churn during hydration (medium risk)

1. Add "import transaction" batching semantics.

- Defer runtime graph publish until rig import + required pose import reach a consistent checkpoint.
- Publish once per transaction phase, not on every intermediate field update.

2. Gate revision bumps on semantic changes, not object identity alone.

- If normalized graph content is unchanged, do not bump revision.

3. Reduce pose normalization churn.

- Normalize pose graph only when pose graph content changed, not every incidental state write.

Expected result: fewer topology/pose mutation publishes and less compile churn.

## Phase 4: Dev-mode realism (low risk)

1. Keep StrictMode, but add guardrails in expensive effects to avoid duplicate heavy work in immediate remount cycle when payload is unchanged.
2. Measure import in both:

- dev StrictMode,
- production build (`pnpm --filter vizij-authoring run build` + preview).

Expected result: clearer distinction between real runtime cost and dev-only amplification.

## Guardrails To Avoid Breaking Working Functionality

Any optimization should keep these guarantees:

1. Rig import still performs normalization and repair required for autorig passthrough behavior.
2. Pose import still waits for required standard input availability and face-id alignment.
3. Runtime fallback behavior (IR issues -> legacy runtime spec) remains intact.
4. Discrepancy review still appears when checks are enabled and real mismatches exist.
5. Existing import warnings remain available, but aggregate them (avoid spamming repeated identical warnings).

## Recommended Order of Execution

1. Add timing counters and per-import summary first.
2. Implement fingerprint + skip-check short-circuits.
3. Implement transactional publish gating.
4. Re-measure on the same heavy face asset.
5. Only then consider deeper architectural changes.

## Success Criteria

For the same large face import:

1. total import-to-ready time significantly reduced,
2. rig import attempts per user import close to 1,
3. graph normalize calls per import materially reduced,
4. topology publish count reduced to essential transitions,
5. no regression in binding behavior, pose behavior, or autorig passthrough semantics.

## Bottom Line

The system is doing the right classes of work, but too many heavy steps are repeated during a single import lifecycle. We should optimize by cutting duplicate compute and intermediate publishes, not by removing correctness checks. That gives the best chance of major speed gains without risking functionality regressions.
