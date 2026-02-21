# Graph Update, Import Checks, and Runtime Churn Investigation

Date: 2026-02-20  
Scope: `apps/vizij-authoring` + runtime providers used by authoring  
Method: code-path audit + parallel sub-agent first-principles review + log correlation

## Objective

Establish a defensible policy for:

1. when we must rebuild/update runtime graph payloads,
2. when we should only apply input values,
3. which import checks are essential vs duplicative,
4. which ongoing processes cause avoidable slowness.

## Executive Summary

1. The current architecture has the right primitives, but update policy is implicit and spread across multiple hooks.
2. There is clear duplicated work in rig import normalization (same spec normalized in two places).
3. Several ongoing loops/effects remain expensive under authoring workloads:
   - broad shared-variable sync passes on every value change,
   - repeated bundle-sync preprocessing when dependencies change,
   - runtime/provider background loops and status timers.
4. The most important ambiguity is compile-fallback behavior: when IR compile is blocked, runtime can remain on last-known-good while input staging still operates, which is functionally useful but currently under-specified.

## Current Runtime Decision Surface

### Where graph rebuilds originate

Rig graph construction is recomputed from authored structure and metadata in `useRigController` (`apps/vizij-authoring/src/hooks/useRigController.ts:1387`). The memo dependency set includes:

1. face identity (`faceId`),
2. animatables + components (`animatables`, `animatableComponents`),
3. direct/control bindings (`bindings`, `inputBindings`),
4. standard-input registry + metadata (`standardInputsById`, `standardInputMetadataById`),
5. pose compose modes derived from pose config (`poseConfigSnapshot`).

The resolved runtime spec path then compiles IR when available, with fallback behavior in `resolveRuntimeGraphSpec` (`apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:17`).

### Where runtime bundle updates happen

`RuntimeGraphBridge` in `Viewer` publishes rig/pose payloads through `setGraphBundle` (`apps/vizij-authoring/src/components/app/Viewer.tsx:38`). It keys updates on:

1. `graphSpecRevision`,
2. `poseRuntimeRevision`,
3. payload signatures for `graphSpec`, `poseGraphSpec`, `poseConfig`.

This is guarded by `payloadSignatureRef` (`apps/vizij-authoring/src/components/app/Viewer.tsx:47` and `apps/vizij-authoring/src/components/app/Viewer.tsx:115`) to skip identical publishes.

### Where direct input apply happens

Input edits go through `handleInputValueChange` and stage immediately via `stageGraphInputValue` (`apps/vizij-authoring/src/hooks/useRigController.ts:1688` and `apps/vizij-authoring/src/hooks/useRigController.ts:1718`). Staging is gated on:

1. `graphStatus === "ready"`,
2. no `graphError`,
3. resolved graph path existing in runtime lookup map,
4. runtime input bridge available.

State replay is intentionally triggered whenever graph readiness/bridge epoch/runtime-input map revision changes (`apps/vizij-authoring/src/hooks/useRigController.ts:2270`).

## Policy Matrix (Defensible Contract)

This is the recommended explicit policy to codify in docs and tests.

| Mutation Class      | Examples                                                                                                                 | Required Action                                                                                      | Must Not Happen                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `TopologyMutation`  | add/remove bindings, input-binding rewires, input schema/path/metadata changes, face id change, pose compose mode change | Rebuild rig graph; resolve runtime spec; publish new graph payload (`graphSpecRevision++`)           | Direct input staging as the only reaction        |
| `PoseGraphMutation` | pose graph spec/config/IR changed                                                                                        | Publish pose payload (`poseRuntimeRevision++`), re-register graphs only if update plan requires      | Full rig rebuild unless rig dependencies changed |
| `ValueMutation`     | slider/input value changes, pose weight value changes                                                                    | Stage runtime input immediately via bridge                                                           | Triggering graph rebuild                         |
| `BlockedCompile`    | IR compile fails but last-known-good exists                                                                              | Keep previous runtime payload active, surface warning, continue value staging against active payload | Silent fallback without warning                  |
| `FatalBuildFailure` | rig build has fatal issues                                                                                               | Mark graph error, clear route map/driven outputs, block staging until recovered                      | Continuing to stage as if runtime is valid       |

## Ambiguities to Resolve

1. Blocked IR compile currently sets `blocked: true` while possibly retaining last-known-good runtime payload (`apps/vizij-authoring/src/hooks/runtimeGraphSpec.ts:67` and `apps/vizij-authoring/src/hooks/useRigController.ts:2088`). This is reasonable, but must be formally declared as "stale-runtime fallback mode" with explicit UX copy.
2. Fatal graph path clears runtime input maps (`apps/vizij-authoring/src/hooks/useRigController.ts:2133`), but input updates still enter state and attempt staging (which then no-ops on gate failure). This should be documented as "accepted for replay once recovered" or changed to "reject while invalid."

## Import Pipeline: Required Checks vs Duplication

## Required Checks (Keep)

1. Bundle fingerprint gating and in-flight dedupe in synchronizer (`apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:144` and `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:148`).
2. Rig discrepancy and blueprint reconciliation in rig import (`apps/vizij-authoring/src/hooks/useRigGraphImport.ts:327` and `apps/vizij-authoring/src/hooks/useRigGraphImport.ts:405`).
3. Pose import gating on config + standard inputs + face alignment (`apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:213` and `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:221`).
4. Pose runtime spec normalization + signature gating before publish (`apps/vizij-authoring/src/state/PoseRigProvider.tsx:298` and `apps/vizij-authoring/src/state/PoseRigProvider.tsx:311`).

## Duplicative or Likely Redundant (Refactor)

1. Rig spec normalization appears twice for the same import path:
   - synchronizer normalizes prepared spec before import (`apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:175`),
   - importer normalizes again for canonical comparison (`apps/vizij-authoring/src/hooks/useRigGraphImport.ts:237`).
2. `prepareSpecForImport` already compiles IR-backed payloads (`apps/vizij-authoring/src/utils/graphImport.ts:63`), so first normalization in synchronizer should be merged with importer's normalization pipeline.

## Consolidation Recommendation

Adopt a single normalized payload handoff:

1. prepare payload once,
2. normalize once,
3. reuse normalized result for both import application and discrepancy comparison.

This reduces duplicate WASM normalization passes and makes import diagnostics deterministic from one canonical representation.

## Ongoing Churn and Slowness Risks

## High Impact

1. Shared-variable sync recalculates/sorts links and iterates all pairs on every input-value update (`apps/vizij-authoring/src/hooks/useSharedVariableSync.ts:138` and `apps/vizij-authoring/src/hooks/useSharedVariableSync.ts:266`).
2. Persistence save path serializes full rig state and writes after debounce when enabled (`apps/vizij-authoring/src/hooks/useRigPersistence.ts:148` and `apps/vizij-authoring/src/hooks/useRigPersistence.ts:487`).

## Medium Impact

1. Bundle sync preprocessing can rerun on dependency changes and performs `JSON.stringify`, clone, prepare, normalize, import (`apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:76` and `apps/vizij-authoring/src/hooks/useBundleSynchronizer.ts:269`).
2. Runtime provider maintains active/idle loops plus status interval timers (`packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2022`, `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2049`, `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx:2089`).
3. Node-graph provider includes interval stepping path for playback mode (`packages/@vizij/node-graph-react/src/GraphProvider.tsx:316`).

## Important Interpretation Note

Dev-mode React Strict Mode doubles certain effects, inflating duplicate logs (for example passive-effect reconnection traces). This explains some repeated logs but does not explain the full runtime slowness by itself; heavy effect bodies are still real costs.

## Action Plan (Prioritized)

## Phase 1: Policy + Fast Wins

1. Add a documented `MutationClass` contract (topology/pose/value/fallback/fatal) in architecture docs and enforce with unit tests around `useRigController` and runtime bridge behavior.
2. Refactor import normalization to one canonical pass.
3. Narrow bundle synchronizer reactivity so `standardInputCount` changes do not retrigger full import preprocessing unless bundle fingerprint changed.
4. Keep persistence autosave off by default (already requested) and ensure save path remains opt-in.

## Phase 2: Runtime Churn Reduction

1. Make shared-variable sync diff-driven by changed paths instead of full-map sweeps.
2. Gate idle loops/timers behind visibility + actual work demand signals.
3. Add route-map rebuild guards so runtime-input maps are rebuilt only when graph summary inputs change, not on unrelated state transitions.

## Phase 3: Observability + Guardrails

1. Add counters/timers:
   - `normalizeGraphSpec` calls per import,
   - `registerControllers` count per face load,
   - shared-pair evaluations per value edit,
   - long task count during initial face load.
2. Define acceptance targets:
   - one controller registration cycle per payload revision,
   - no duplicate import normalization pass,
   - no full shared-pair sweep for single-path edits.

## Recommended Documentation Updates

After agreement, promote the policy matrix into:

1. `apps/vizij-authoring/docs/ARCHITECTURE.md` (normative behavior),
2. `apps/vizij-authoring/docs/references/import-compat-contract.md` (import-stage contracts),
3. test docs/checklist for regressions tied to runtime fallback and import normalization.

## Conclusion

The system is close to stable behavior, but it lacks one explicit cross-cutting contract that cleanly separates:

1. structural graph mutations (rebuild/update bundle),
2. runtime value mutations (stage inputs only),
3. fallback/error modes (stale-runtime allowed vs staging blocked).

Codifying that contract and removing duplicate normalization/import work is the highest-confidence path to restoring a smooth and reliable authoring experience without sacrificing correctness.
