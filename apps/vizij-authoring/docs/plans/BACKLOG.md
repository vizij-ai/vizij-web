# Vizij Authoring Backlog (Active)

Last updated: 2026-03-01

Status legend: `[ ]` planned, `[~]` in progress, `[x]` done

This backlog is organized by semantic block, then by dependency order inside each block.

## Critical Path (Current)

1. `G7.1` -> `G7.2` -> `G7.3` -> `G7.4` -> `G7.5` (animation/orchestrator unification lane).
2. `U8.1` -> `U8.2` -> `U8.3` -> `U8.4` (workspace clarity + visual consistency lane).
3. `V9.1` -> `V9.2` -> `V9.3` (sample GLB + standard-rig finalization lane).
4. `R6.5` can execute in parallel with `G7.*` once transport contracts are stable.
5. `F5.1` -> `F5.2` -> `F5.4` -> `F5.5` -> `F5.7` -> `F5.8` (import reliability lane remains active risk control).
6. `F5.1` -> `F5.3` -> `F5.7` -> `F5.8`
7. `F5.1` -> `F5.6` -> `F5.8`
8. `QL0.1`, `QL0.2`, `QL0.3`, `QL2.4`, and `QL2.5` execute in parallel as supporting gates for `F5.2`, `F5.3`, and `F5.8`.
9. `P10.1` -> `P10.2` -> `P10.3` (speech + viseme lane) starts after `G7.4` baseline stability.
10. Blocks `A0` through `E4` are complete foundations, including Stage `4A` (`A0.4`-`A0.7`) direct+pose composition alignment.
11. `R6.1` through `R6.4` are complete; `R6.5` remains open.

## Block A — MVP Correctness and Release Blockers

### [x] A0.1 Canonical Pose-Weight Inputs and Inputs Pane Visibility

Priority and why this should still be done:

- Level: `P0`
- Why: Pose weights must be first-class, stable, and discoverable in Inputs. Without this, pose authoring and runtime control diverge.

Dependencies / blockers:

- Depends on: none
- Blocks: `A0.3`, `B1.1`, `D3.1`, `D3.2`

Intent:

- Canonicalize pose weight controls to one stable input per pose (`rig/{face}/poses/{poseId}.weight`) and keep them synced to standard inputs with stable source IDs.

Acceptance checks:

1. Each pose has exactly one canonical weight input path, independent of group membership.
2. Pose weight controls appear in the Inputs pane and are editable like other inputs.
3. Pose weight controls are excluded from pose target-channel selection (no self-targeting loops).
4. Renaming or regrouping poses does not duplicate or orphan weight controls.

Completion notes (2026-02-19):

1. Canonical per-pose weight paths are now generated via pose-id-based helpers and used by graph compilation (`/poses/{poseId}.weight` with deterministic collision suffixing only when needed).
2. Pose-weight controls are auto-synchronized into managed standard inputs with stable source IDs (`pose-weight:{poseId}`), labels, and `[0,1]` range/default constraints.
3. Pose-weight inputs are filtered out of pose-target authoring channels while remaining available in Inputs.
4. Sync cleanup now removes stale and duplicate custom pose-weight entries, including path-only entries missing source IDs.
5. Added regression tests for provider sync behavior in `src/state/PoseRigProvider.test.tsx` plus updated utility/compiler tests for canonical path semantics.
6. Validation evidence:
   - `2026-02-19 03:45Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint warnings only; typecheck + tests green, 66 files / 341 tests).

### [x] A0.2 Import Retarget Sequencing and Rebind Correctness (`Q0.1`)

Priority and why this should still be done:

- Level: `P0`
- Why: Import correctness is a data-integrity gate. Incorrect retarget order can silently produce invalid authoring graphs.

Dependencies / blockers:

- Depends on: none
- Blocks: release readiness

Intent:

- Guarantee deterministic retarget order: provision valid propsrig targets first, then rebind invalid animatable writes.

Acceptance checks:

1. Legacy invalid direct animatable writes are converted into valid propsrig-mediated chains.
2. Retargeting is idempotent across repeated imports.
3. Diagnostics explicitly identify `created`, `rebound`, and `fallback` cases.

Completion notes (2026-02-19):

1. Importer now supports pre-provisioning propsrig inputs before normalization/retarget evaluation, so boundary-invalid direct animatable writes are resolved after target provisioning rather than before it.
2. Import diagnostics now include explicit `createdPropsRigInputs` entries in addition to existing retarget/fallback diagnostics.
3. Rig graph import now passes generated propsrig blueprint inputs into importer rehydration, enforcing \"provision target first, then rebind\" sequencing in the default import path.
4. Added regression tests in `src/rig/importer.test.ts` for:
   - provisioning + retarget sequencing correctness,
   - deterministic repeated imports with provisioned propsrig targets.
5. Validation evidence:
   - `2026-02-19 03:53Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint warnings only; typecheck + tests green, 66 files / 343 tests).

### [x] A0.3 Pose Authoring MVP Smoke Coverage

Priority and why this should still be done:

- Level: `P0`
- Why: Recent fixes touched core pose flows. We need explicit regression gates for "create -> connect -> preview -> export".

Dependencies / blockers:

- Depends on: `A0.1`
- Blocks: release readiness, `B1.1`

Intent:

- Lock MVP authoring behavior with focused integration tests and a repeatable manual smoke script.

Acceptance checks:

1. Test flow covers: create pose, add targets, duplicate pose, assign groups, adjust weights, preview output.
2. No ghost variable creation occurs when adding pose targets.
3. Export payload includes pose config + IR + diagnostics and remains runtime-loadable.

Completion notes (2026-02-19):

1. Added MVP lifecycle smoke coverage in `src/poseRig/usePoseRigAuthoring.test.tsx` for:
   - create pose,
   - add/update targets,
   - assign pose group,
   - duplicate pose,
   - preview/apply pose output,
   - pose graph canonical weight-path checks.
2. Added ghost-target guard regression in `src/poseRig/usePoseRigAuthoring.test.tsx` to assert unknown input IDs are ignored and do not create synthetic pose channels.
3. Export/runtime bundle coverage remains enforced in `src/hooks/__tests__/useVizijExport.test.tsx`, including pose config + pose IR + diagnostics metadata in exported bundles and successful runtime-contract export paths.
4. Validation evidence:
   - `2026-02-19 03:58Z` — `pnpm --filter vizij-authoring exec vitest --run src/poseRig/usePoseRigAuthoring.test.tsx src/hooks/__tests__/useVizijExport.test.tsx` -> pass (2 files / 37 tests).
   - `2026-02-19 04:00Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint warnings only; typecheck + tests green, 66 files / 345 tests).

### [x] A0.4 Pose-Control Path Contract Alignment

Priority and why this should still be done:

- Level: `P0`
- Why: The pose contribution channel must not collide with direct rig controls. A stable internal path contract is required for deterministic behavior.

Dependencies / blockers:

- Depends on: `A0.1`, `B1.1`
- Blocks: `A0.5`, `A0.6`, `A0.7`

Intent:

- Ensure compiled pose outputs target internal rig input paths `rig/<face>/pose/control/<inputId>` while IR still targets canonical direct input IDs.

Acceptance checks:

1. Pose graph outputs compile to `rig/<face>/pose/control/<inputId>`.
2. Direct rig controls remain on canonical direct paths.
3. Path contracts are covered by deterministic tests in compiler/service layers.

Completion notes (2026-02-19):

1. Pose graph compiler now emits per-channel outputs to `rig/<face>/pose/control/<inputId>` using canonical input IDs for suffix identity.
2. Runtime input-route mapping now treats pose-control channels as internal-only and excludes them from editable direct-input route registration.
3. Inputs pane now filters internal pose-control managed rows from default user-facing editing surfaces.
4. Added/updated regression coverage in:
   - `src/poseRig/graphBuilder.test.ts`
   - `src/poseRig/topologyGolden.test.ts`
   - `src/poseRig/utils.test.ts`
   - `src/components/panels/VariablesPanel.test.tsx`
   - `src/hooks/__tests__/poseControlInputContracts.test.ts`
   - `packages/@vizij/utils/src/rig/standard-inputs.test.ts`
5. Validation evidence:
   - `pnpm --filter @vizij/utils run test -- src/rig/standard-inputs.test.ts` -> pass
   - `pnpm --filter vizij-authoring run test -- src/poseRig/graphBuilder.test.ts src/poseRig/topologyGolden.test.ts src/poseRig/services/poseGraphService.test.ts src/poseRig/usePoseRigAuthoring.test.tsx src/poseRig/store.test.ts src/components/panels/VariablesPanel.test.tsx src/hooks/__tests__/poseControlInputContracts.test.ts src/poseRig/utils.test.ts` -> pass
   - `pnpm --filter @vizij/utils run typecheck` -> pass
   - `pnpm --filter vizij-authoring run typecheck` -> pass
   - `pnpm --filter @vizij/utils run lint` -> pass
   - `pnpm --filter vizij-authoring run lint` -> pass

### [x] A0.5 Rig-Graph Effective Channel Composition

Priority and why this should still be done:

- Level: `P0`
- Why: Without rig-side composition, direct edits and pose outputs compete instead of combining predictably.

Dependencies / blockers:

- Depends on: `A0.4`
- Blocks: `A0.6`, `A0.7`

Intent:

- Implement per-channel `effective_i` composition in rig graph:
  - `effective_i = clamp(compose(direct_i, pose_i), min_i, max_i)`.

Acceptance checks:

1. Each targeted channel composes direct + pose-control values in rig graph.
2. Clamp is applied after compose.
3. Default compose mode is additive.

Completion notes (2026-02-19):

1. `buildRigGraphSpec` now accepts per-input compose policy (`inputComposeModesById`) and emits effective input chains for composed channels.
2. Effective chain topology for composed channels now includes:
   - pose-control input (`rig/<face>/pose/control/<inputId>`),
   - compose operation (`add` or `average`),
   - clamp to input range (`min`/`max`).
3. Added node-graph-authoring topology tests for additive and average compose behavior in `packages/@vizij/node-graph-authoring/src/__tests__/graphBuilder.test.ts`.
4. Validation evidence:
   - `pnpm --filter @vizij/node-graph-authoring run test -- src/__tests__/graphBuilder.test.ts` -> pass
   - `pnpm --filter @vizij/node-graph-authoring run typecheck` -> pass
   - `pnpm --filter @vizij/node-graph-authoring run lint` -> pass

### [x] A0.6 Per-Channel Compose Mode Authoring (MVP)

Priority and why this should still be done:

- Level: `P0`
- Why: Users need explicit control over how direct and pose contributions combine per channel.

Dependencies / blockers:

- Depends on: `A0.5`
- Blocks: `A0.7`

Intent:

- Add per-channel compose mode authoring in pose UI and IR with MVP modes:
  1. `add` (default)
  2. `average`

Acceptance checks:

1. Every driven channel can configure compose mode.
2. New channels default to `add`.
3. Import/export and IR projection preserve mode values.

Completion notes (2026-02-19):

1. Added per-channel compose modes on pose definitions (`composeModes`) with supported values `add` and `average`.
2. Pose config and pose IR services now normalize, validate, and round-trip compose modes with diagnostics for invalid or non-target entries.
3. Pose authoring lifecycle now enforces defaults:
   - added pose channels default to `add`,
   - removed channels remove compose-mode entries.
4. Pose inspector `What I Drive` row 1 now exposes per-channel `Compose` selector (`Add` / `Average`).
5. Validation evidence:
   - `pnpm --filter vizij-authoring run test -- src/poseRig/store.test.ts src/poseRig/usePoseRigAuthoring.test.tsx src/poseRig/services/poseConfigService.test.ts src/poseRig/services/poseIrService.test.ts src/components/inspector/poseInspectorSemanticsContracts.test.ts` -> pass

### [x] A0.7 Inputs Pane Internal-Path Filtering + Contract Tests

Priority and why this should still be done:

- Level: `P0`
- Why: Internal pose-control channels are runtime plumbing and should not confuse normal authoring workflows.

Dependencies / blockers:

- Depends on: `A0.5`, `A0.6`
- Blocks: resume `F5.*` import reliability wave

Intent:

- Hide `rig/<face>/pose/control/<inputId>` internal channels from default Inputs pane while preserving normal rig + pose-weight editing and correctness tests.

Acceptance checks:

1. Internal pose-control channels are not shown/editable in Inputs pane default UX.
2. Canonical rig inputs and pose-weight inputs remain visible and editable.
3. Regression tests cover filtering and control sync with inspector flows.

Completion notes (2026-02-19):

1. Inputs pane default UX filtering for internal pose-control channels remains enforced (`A0.4`) and now includes additional contract coverage for compose-mode compile wiring and managed-input fallback routing.
2. Rig graph compile path now derives compose modes from current pose config and passes them to rig graph compilation, keeping inspector-authored compose settings and runtime behavior aligned.
3. Added/updated contract tests:
   - `src/hooks/__tests__/poseControlInputContracts.test.ts`
   - `src/components/inspector/poseInspectorSemanticsContracts.test.ts`
4. Validation evidence:
   - `pnpm --filter vizij-authoring run test -- src/hooks/__tests__/poseControlInputContracts.test.ts src/components/inspector/poseInspectorSemanticsContracts.test.ts src/components/panels/VariablesPanel.test.tsx` -> pass
   - `pnpm --filter vizij-authoring run typecheck` -> pass
   - `pnpm --filter vizij-authoring run lint` -> pass

## Block B — IR-First Authoring Foundation

### [x] B1.1 Make Pose IR the Store Source of Truth (`IR1`)

Priority and why this should still be done:

- Level: `P1`
- Why: Current config-first editing adds conversion churn and correctness risk. IR-first editing simplifies reasoning and diagnostics.

Dependencies / blockers:

- Depends on: `A0.1`, `A0.3`
- Blocks: `B1.2`, `B1.3`, `C2.1`, `D3.1`

Intent:

- Move authoring mutations to IR-first state. Treat config and graph outputs as deterministic projections.

Acceptance checks:

1. Pose/group edit actions mutate IR first.
2. Config export is generated from IR projections only.
3. Existing pose/group workflows remain functionally equivalent.

Completion notes (2026-02-19):

1. Store pose/group mutations now route through IR patch compilation helpers; `poseIrDraft` is rebuilt on pose/group/neutral metadata mutations and `poseConfigDraft` is projected from IR in the store rebuild path.
2. Action paths that previously wrote `poseConfigDraft` directly now project IR first, then derive config/graph drafts deterministically.
3. Export paths now resolve pose config from Pose IR when available (with config fallback only when IR is unavailable), including GLB bundle `poses.config`, pose-graph rebuild, and pose-config file export.
4. Runtime pose-config sync in provider now prefers IR-projected config when `poseIrDraft` is present.
5. Regression coverage added:
   - `src/poseRig/store.test.ts` now asserts `poseConfigDraft` equals `PoseIrService.toConfig(poseIrDraft)` after pose/group mutations.
   - `src/hooks/__tests__/useVizijExport.test.tsx` now asserts pose-config export uses IR projection when IR/config drafts differ.
6. Validation evidence:
   - `2026-02-19 20:20Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 66 files / 347 tests).

### [x] B1.2 Neutral Strategy Authoring and Round-Trip (`IR5`)

Priority and why this should still be done:

- Level: `P1`
- Why: Neutral behavior is fundamental to deterministic output when no poses are active.

Dependencies / blockers:

- Depends on: `B1.1`
- Blocks: `C2.1`, release-level determinism guarantees

Intent:

- Support explicit neutral mode authoring (`face-default` vs `explicit`) and preserve it across import/edit/export.

Acceptance checks:

1. Neutral mode survives round-trip with no semantic drift.
2. Compiler uses selected neutral mode deterministically.
3. Diagnostics warn when neutral fallback is implicit.

Completion notes (2026-02-19):

1. Added explicit neutral strategy modeling across config + IR contracts (`neutralMode` in config; `neutral.mode` in IR) with round-trip mapping in `PoseConfigService` and `PoseIrService`.
2. Store now tracks `neutralMode` and exposes `setNeutralMode`; neutral capture/edit paths promote mode to `explicit`.
3. Compiler now respects neutral strategy deterministically:
   - `face-default` compiles from standard-input defaults.
   - `explicit` compiles from authored neutral values with default fallback only for missing channels.
4. Added structured diagnostics (`implicit-neutral-fallback`) when `explicit` neutral mode is selected but required target channels are missing explicit neutral entries.
5. Added regression coverage in:
   - `src/poseRig/services/poseConfigService.test.ts`
   - `src/poseRig/services/poseIrService.test.ts`
   - `src/poseRig/services/poseGraphService.test.ts`
   - `src/poseRig/store.test.ts`
   - `src/hooks/__tests__/useVizijExport.test.tsx`
6. Validation evidence:
   - `2026-02-19 20:31Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 66 files / 354 tests).

### [x] B1.3 Enforce Ghost-Signal Boundary Contract

Priority and why this should still be done:

- Level: `P1`
- Why: We agreed ghost/intermediate signals belong only in compiled graph wiring, not as authored variables.

Dependencies / blockers:

- Depends on: `B1.1`
- Blocks: long-term compiler maintainability

Intent:

- Enforce that IR points directly at canonical target inputs, while compiled graph may contain one intermediate signal per group/group-blend output.

Acceptance checks:

1. IR payload never introduces ghost inputs.
2. Compiled graph can reference intermediate blend outputs in binding expressions only.
3. Tests assert one intermediate signal per group/group-blend output, not per pose.

Completion notes (2026-02-19):

1. Pose IR normalization now rejects synthetic/ghost channel IDs (`pose_group_*`, `pose_cross_*`, `pose_weights_*`, etc.) and emits structured `ghost-channel-id` diagnostics when encountered.
2. Graph builder now enforces authored-input boundaries by validating that compiled `input` nodes map only to canonical pose-weight controls.
3. Added graph-side guard against duplicate group-signal generation for the same group/channel pair.
4. Regression coverage added:
   - `src/poseRig/services/poseIrService.test.ts` verifies ghost-channel pruning + diagnostics.
   - `src/poseRig/graphBuilder.test.ts` verifies no ghost authored inputs are emitted and group-channel signal count is bounded per group, not per pose.
5. Validation evidence:
   - `2026-02-19 20:38Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 66 files / 356 tests).

### [x] B1.4 Unified Pose Import Feedback UX (`IR4`)

Priority and why this should still be done:

- Level: `P1`
- Why: Import errors/warnings currently vary by payload type and are harder to trust in production workflows.

Dependencies / blockers:

- Depends on: `B1.1`
- Blocks: operator confidence for cross-asset imports

Intent:

- Standardize feedback across pose config, pose IR, and pose graph imports.

Acceptance checks:

1. All pose import paths show structured warnings and errors in the same UI pattern.
2. Fatal import failures provide actionable remediation text.
3. No import path relies on console-only feedback.

Completion notes (2026-02-19):

1. Unified import feedback plumbing now routes config, IR, and pose-graph import outcomes through the same diagnostics channel (`poseDiagnostics` + `poseConfigWarnings`) exposed by the Pose Rig panels.
2. Pose file import failures now emit actionable remediation text and structured `import-failed` diagnostics per source (`pose-config`, `pose-ir`, `pose-graph`).
3. Pose-graph imports now emit structured `pose-graph` warning diagnostics instead of returning warning strings without UI visibility.
4. Removed console-only import warning behavior:
   - Pose graph import warnings now surface via dialog + diagnostics.
   - Remap pre-analysis fallback no longer logs console warnings without user-visible feedback.
5. Regression coverage added in `src/poseRig/usePoseRigAuthoring.test.tsx` for config/IR/graph import failure diagnostics.
6. Validation evidence:
   - `2026-02-19 20:42Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 66 files / 357 tests).

## Block C — Blend Topology and Scale

### [x] C2.1 Multi-Stage Blend IR Primitives (`IR6`)

Priority and why this should still be done:

- Level: `P1`
- Why: We need n-stage blending support for chained group composition; single-stage cross-group blend is not enough.

Dependencies / blockers:

- Depends on: `B1.1`, `B1.2`
- Blocks: `C2.2`, `C2.3`

Intent:

- Extend IR to represent explicit blend stages and deterministic stage chaining.

Acceptance checks:

1. IR schema supports ordered stage definitions and stage operations.
2. Compiler emits deterministic topology for multi-stage payloads.
3. Existing single-stage payloads compile through compatibility defaults.

Completion notes (2026-02-19):

1. Added stage-chain IR/config primitives (`blendStages`) with ordered stage sources (`group` and prior `stage`) and round-trip preservation.
2. Added structured stage normalization diagnostics for malformed payloads (invalid mode/source/id, duplicate entries, empty stages) in `PoseIrService`; config normalization emits matching warnings.
3. Compiler now supports deterministic multi-stage chaining (`add` / `average`) for group and stage sources while preserving legacy cross-group behavior when no valid stages are present.
4. Store projection now preserves imported/normalized `blendStages` across subsequent authoring mutations.
5. Regression coverage added for:
   - config/IR stage normalization and fallback behavior,
   - stage-aware graph compilation topology,
   - stage-aware pose graph service compilation,
   - store projection retention of stage definitions.
6. Validation evidence:
   - `2026-02-19 05:11Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 66 files / 364 tests).

### [x] C2.2 Multi-Stage Blend Authoring UI (`IR7`)

Priority and why this should still be done:

- Level: `P1`
- Why: Stage-capable IR is not usable until users can author and inspect stage chains directly.

Dependencies / blockers:

- Depends on: `C2.1`
- Blocks: `C2.3`

Intent:

- Add authoring controls for stage creation, reordering, and operation selection.

Acceptance checks:

1. Users can create and reorder stages.
2. Stage edits update compiled graph output as expected.
3. UI blocks invalid stage topology before apply/export.

Completion notes (2026-02-19):

1. Pose Rig store now exposes stage authoring actions (`create`, `rename`, `mode`, `delete`, `reorder`, `sources`) with topology guards that reject invalid stage chains.
2. `usePoseRigAuthoring` now surfaces `blendStages` plus stage-edit action methods to UI consumers.
3. Pose Groups surface now includes a `Blend Stages` editor section with:
   - stage create/rename/delete,
   - up/down reorder controls,
   - per-stage mode toggles (`average` / `add`),
   - source toggles for group and prior-stage references.
4. UI-side validation blocks invalid edits before dispatch (self-reference, forward-stage references, empty/duplicate sources, unknown group/stage references) and shows operator-facing messages.
5. Existing cross-group blend controls remain available as compatibility fallback mode when no explicit stages are configured.
6. Regression coverage added for:
   - store-stage authoring and invalid-topology rejection,
   - hook-level stage authoring lifecycle,
   - Pose Groups UI interaction wiring and invalid-operation blocking.
7. Validation evidence:
   - `2026-02-19 05:33Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 66 files / 370 tests).

### [x] C2.3 Golden Topology Fixture Suite (`IR8`)

Priority and why this should still be done:

- Level: `P1`
- Why: Multi-stage and overlap behavior needs deterministic protection against compiler regressions.

Dependencies / blockers:

- Depends on: `C2.1`, `C2.2`
- Blocks: safe iteration on blend semantics

Intent:

- Add golden fixture tests for compile topology outputs and diagnostics.

Acceptance checks:

1. Fixture suite includes shared-channel overlaps, neutral fallback, and multi-stage chains.
2. Golden outputs are stable across deterministic rebuilds.
3. Unintended topology drift fails CI.

Completion notes (2026-02-19):

1. Added dedicated pose-rig golden topology coverage in `src/poseRig/topologyGolden.test.ts`.
2. Fixture set now includes:
   - shared-channel overlaps,
   - neutral fallback behavior,
   - multi-stage blend chains.
3. Each fixture compiles twice and asserts deterministic topology snapshots + hashes; diagnostics are also checked for deterministic parity.
4. Drift protection is now enforced with locked SHA-256 topology hashes per fixture, so topology changes fail tests unless hashes are intentionally updated.
5. Neutral fallback fixture explicitly asserts the `implicit-neutral-fallback` diagnostic contract and verifies fallback neutral values in compiled topology.
6. Validation evidence:
   - `2026-02-19 05:42Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 67 files / 377 tests).

## Block D — UX Simplification and Maintainability

### [x] D3.1 PropsRig Abstraction Cleanup (Primary UX)

Priority and why this should still be done:

- Level: `P2`
- Why: Primary users should reason in high-level variable/property terms, not low-level propsrig internals.

Dependencies / blockers:

- Depends on: `A0.1`, `B1.1`
- Blocks: polished production authoring UX

Intent:

- Hide propsrig variables in default flows and provide direct variable <-> property navigation that conceptually crosses propsrig internals.

Acceptance checks:

1. Default authoring workflows do not require direct propsrig interaction.
2. Inspector chain links show high-level relationships clearly in both directions.
3. Advanced/debug mode can still expose propsrig internals.

Completion notes (2026-02-19):

1. Rig inspector chain panels now default to high-level relationship framing (variables/properties), collapsing unmapped propsrig internals from default view.
2. Added explicit inspector toggle for advanced/debug access:
   - `Show PropsRig Internals` reveals low-level propsrig links,
   - `Hide PropsRig Internals` restores simplified view.
3. Upstream (`Driven By`) and downstream (`What This Drives`) lists now surface mapped property links directly when available, reducing forced low-level propsrig navigation.
4. Added contract-test assertions to keep the propsrig abstraction toggle and chain affordances present in inspector implementation.
5. Validation evidence:
   - `2026-02-19 05:47Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green, 67 files / 377 tests).

### [x] D3.2 Inputs Pane IA for Group/Stage Controls

Priority and why this should still be done:

- Level: `P2`
- Why: As group chaining grows, users need clear ownership and path semantics for which controls feed which stage.

Dependencies / blockers:

- Depends on: `A0.1`, `C2.1`
- Blocks: scalable authoring in dense rigs

Intent:

- Define and implement Inputs pane representation for pose-weight controls, group outputs, and stage-chain controls.

Acceptance checks:

1. Input paths are deterministic and collision-safe.
2. Users can distinguish pose-weight controls from stage/group controls.
3. Group/stage wiring provenance is visible from inspector context.

Completion notes (2026-02-19):

1. Inputs pane rows now classify controls as `rig-input`, `pose-weight`, `group-output`, or `stage-output`, so authored controls and derived composition outputs are clearly separated.
2. Pose-weight controls remain canonical and editable, while group/stage outputs now render as deterministic derived rows (`/pose/groups/{groupId}.output`, `/pose/stages/{stageId}.output`) with read-only behavior.
3. Rows now include provenance metadata for ownership/wiring context (pose source, group mode + pose count, and stage mode + source summary).
4. Validation evidence:
   - `2026-02-19 06:12Z` — `pnpm --filter vizij-authoring run validate` -> pass (lint/typecheck/tests green; 67 passed files + 1 skipped perf file, 378 passed tests + 1 skipped perf test).

### [x] D3.3 Lint Warning Baseline Cleanup (`VariablesPanel`)

Priority and why this should still be done:

- Level: `P2`
- Why: Warning debt slows reviews and hides real regressions.

Dependencies / blockers:

- Depends on: none
- Blocks: stricter lint gates (`--max-warnings=0`)

Intent:

- Remove current warnings and set the project up for warning-free lint gating.

Acceptance checks:

1. `pnpm --filter vizij-authoring run lint` reports 0 warnings in touched scope.
2. Tracker records warning baseline change.

Completion notes (2026-02-19):

1. Removed unused selector and scene-derived variables from `src/components/panels/VariablesPanel.tsx` (`onSelectScene`, selected-scene and selected-rig derived values) to eliminate lingering warning debt.
2. `pnpm --filter vizij-authoring run lint` now exits with 0 warnings and 0 errors for `vizij-authoring`.
3. Validation evidence:
   - `2026-02-19 04:05Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` clean; typecheck + tests green, 66 files / 345 tests).

### [x] D3.4 Empirical Performance Baseline Capture

Priority and why this should still be done:

- Level: `P2`
- Why: We have contract tests for performance-sensitive behavior but limited measured evidence on large rigs.

Dependencies / blockers:

- Depends on: none
- Blocks: confident performance claims for release notes

Intent:

- Capture repeatable before/after measurements for dense authoring interactions.

Acceptance checks:

1. One reproducible profiling scenario is documented.
2. Recorded metrics include interaction latency and rerender/compute evidence.

Completion notes (2026-02-19):

1. Added a reproducible dense Inputs-pane profiling scenario in `src/components/panels/VariablesPanel.perf.test.tsx` that seeds:
   - 640 rig inputs,
   - 160 pose-weight inputs,
   - 20 group-output rows,
   - 10 stage-output rows
   - for a total of 830 Inputs rows, then runs six deterministic interactions (five searches + one row selection).
2. Added executable baseline command support in `package.json`:
   - `pnpm --filter vizij-authoring run perf:inputs-baseline`
   - (script runs the perf scenario file directly with Vitest).
3. Captured interaction-latency metrics and rerender/compute evidence via React Profiler commit and `actualDuration` aggregates.
4. Recorded the baseline run in `docs/perf/inputs-pane-baseline-2026-02-19.md`.
5. Validation evidence:
   - `2026-02-19 06:11Z` — `pnpm --filter vizij-authoring run perf:inputs-baseline` -> pass; metrics: latency `avg=23.773ms`, `p95=67.314ms`, `max=67.314ms`; profiler commits `20 total / 19 update`, update `actualDuration total=70.852ms`, `max=15.424ms`.
   - `2026-02-19 06:12Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` + `typecheck` + `test` green; 67 passed files + 1 skipped perf file, 378 passed tests + 1 skipped perf test).

## Block E — Advanced Policy Semantics

### [x] E4.1 Per-Channel Override Map (`IR9`)

Priority and why this should still be done:

- Level: `P3`
- Why: Needed for advanced channel-specific composition behavior and long-tail overlap tuning beyond global cross-group policy.

Dependencies / blockers:

- Depends on: `C2.1`, `C2.3`
- Blocks: advanced production tuning

Intent:

- Add optional per-channel cross-group/stage operation overrides.

Acceptance checks:

1. Override map compiles deterministically.
2. Invalid overrides emit structured diagnostics.
3. Global default policy remains unchanged when overrides are absent.

Completion notes (2026-02-19):

1. Added optional per-channel cross-group override contracts to pose config and pose IR:
   - config: `crossGroupChannelOverrides`
   - IR: `crossGroupPolicy.overrides`
2. Implemented deterministic override normalization in config/IR services (sorted map keys, sanitized `priorityOrder`, canonical channel filtering).
3. Added structured diagnostics + warnings for malformed override payloads, invalid channels, invalid groups, and ignored fields.
4. Preserved compatibility: when overrides are absent, compile path and topology remain unchanged.
5. Round-trip support added for import/export (`config -> IR -> config`) with new override fields preserved.
6. Regression coverage added in:
   - `src/poseRig/services/poseConfigService.test.ts`
   - `src/poseRig/services/poseIrService.test.ts`
   - `src/poseRig/graphBuilder.test.ts`
   - `src/poseRig/services/poseGraphService.test.ts`
   - `src/poseRig/store.test.ts` (override retention through store projection rebuilds)

### [x] E4.2 Priority Resolution Semantics (`IR10`)

Priority and why this should still be done:

- Level: `P3`
- Why: Overlapping group output resolution needs a clear deterministic policy, but requires dedicated design examples first.

Dependencies / blockers:

- Depends on: `C2.1`, `E4.1`
- Blocks: full overlap-policy completeness

Intent:

- Define and implement explicit priority/tie-break behavior for overlapping contributors.

Acceptance checks:

1. Priority behavior is encoded in compiler and documentation.
2. Conflict scenarios have deterministic test coverage.
3. Diagnostics explain when priority changed a channel output.

Completion notes (2026-02-19):

1. Added per-channel override mode `priority` with deterministic ordering + tie-break policy:
   - explicit `priorityOrder` list,
   - `tieBreak` strategy (`group-order` or `group-id`) for unresolved ties.
2. Compiler now realizes priority mode using existing node types only (`subtract`, `join`, `weightedsumvector`, `blendweightedaverageoverlay`) via deterministic priority-overlay chains.
3. Added IR diagnostics for priority policy application and resolution-change cases:
   - `priority-cross-group-override-applied`
   - `priority-cross-group-override-resolution-change`
4. Added deterministic topology tests for priority mode and parity tests proving default behavior remains unchanged when overrides are absent.
5. Validation evidence:
   - `2026-02-19 06:41Z` — `pnpm --filter vizij-authoring exec vitest --run src/poseRig/store.test.ts src/poseRig/services/poseConfigService.test.ts src/poseRig/services/poseIrService.test.ts src/poseRig/graphBuilder.test.ts src/poseRig/services/poseGraphService.test.ts` -> pass (5 files / 82 tests).
   - `2026-02-19 06:42Z` — `pnpm --filter vizij-authoring run validate` -> pass (`lint` + `typecheck` + `test`; 67 passed files + 1 skipped file, 389 passed tests + 1 skipped test).

### [x] E4.3 Overlap Bias / Activity Heuristic Design Pack

Priority and why this should still be done:

- Level: `P3`
- Why: Additive/average composition can skew with uneven pose distribution; we need concrete examples before policy lock-in.

Dependencies / blockers:

- Depends on: `C2.1`
- Blocks: robust long-tail blend quality

Intent:

- Produce example-driven design for activity-weighting and skew mitigation.

Acceptance checks:

1. Design note includes representative overlap scenarios with expected outputs.
2. Tradeoffs are explicit for additive vs weighted-average vs priority policies.
3. Follow-on implementation scope is clearly itemized.

Completion notes (2026-02-19):

1. Added the design pack note at `apps/vizij-authoring/docs/notes/pose-rig-overlap-heuristics-2026-02-19.md`.
2. The note documents representative shared-channel overlap scenarios (`S1`-`S4`) with explicit expected outputs across additive, weighted-average, and priority policy behavior.
3. The note includes a direct policy tradeoff matrix and a concrete activity-heuristic candidate profile for weighted-average behavior.
4. The note includes an itemized follow-on implementation scope covering schema/compiler/diagnostics/UI/tests/rollout.
5. Evidence reference:
   - `2026-02-19` — `apps/vizij-authoring/docs/notes/pose-rig-overlap-heuristics-2026-02-19.md`

## Block R — Reference-Face Workflow Reliability

### [x] R6.1 Reference Path-First Staging for Drivers and Poses

Priority and why this should still be done:

- Level: `P0`
- Why: Reference actions must stage through deterministic runtime paths; id/token fallbacks alone are insufficient and can diverge from main-face behavior.

Dependencies / blockers:

- Depends on: `A0.4`, `A0.7`
- Blocks: `R6.2`, `R6.4`

Intent:

- Make reference and shared panel actions stage through canonical/runtime-resolved paths first, with dedicated pose-weight routing.

Acceptance checks:

1. Reference-only driver actions stage to reference runtime by canonical path when available.
2. Shared driver actions stage to main and reference deterministically.
3. Pose-weight staging writes canonical pose-weight channels rather than override side-paths.

Completion notes (2026-03-01):

1. `VariablesPanel` now uses path-first staging for reference and shared driver actions.
2. Reference pose play/reset paths now prefer canonical pose-weight paths (`/poses/<id>.weight`) with runtime/default-value reset behavior.
3. Regression coverage updated in `src/components/panels/VariablesPanel.test.tsx`.

### [x] R6.2 Runtime Pose-Control Bridge Compatibility (`direct_` Alias Path)

Priority and why this should still be done:

- Level: `P0`
- Why: Legacy assets may expose pose-control outputs keyed by base IDs while rig inputs are keyed as `direct_<id>`; without alias mapping, channels (notably brow) are dropped.

Dependencies / blockers:

- Depends on: `R6.1`
- Blocks: `R6.3`

Intent:

- Keep runtime-react pose-control bridge tolerant to exact and `direct_`-prefixed input IDs.

Acceptance checks:

1. `rig/<face>/pose/control/<inputId>` resolves to active rig input path for exact key or `direct_` alias.
2. Writes are deduped for stability and do not create feedback loops.

Completion notes (2026-03-01):

1. Runtime bridge now maps pose-control outputs into rig inputs with alias fallback for legacy/direct-prefixed channels.
2. This restored reference brow responsiveness for Quori flows where direct-prefixed rig channels are present.

### [x] R6.3 Export Compiler and Bundled Export Guardrails

Priority and why this should still be done:

- Level: `P0`
- Why: Exported bundles must preserve pose compose contracts and avoid creating known-bad fallback bundles.

Dependencies / blockers:

- Depends on: `A0.5`, `A0.6`, `R6.2`
- Blocks: `R6.4`

Intent:

- Ensure export wiring includes pose compose targets and block fallback bundled exports when selected bodies lack `RobotData`.

Acceptance checks:

1. Rig graph build/export receives pose compose mode data for affected inputs.
2. Bundled export blocks fallback-without-`RobotData` cases with actionable diagnostics.
3. Mounted runtime body selection remains preferred over fallback.

Completion notes (2026-03-01):

1. `useVizijExport` now passes pose compose mode data into rig graph builds and hardens export body selection/typing.
2. Bundled-export guard blocks known-invalid fallback scene exports lacking `RobotData`.
3. Regression coverage is in `src/hooks/__tests__/useVizijExport.test.tsx`.

### [x] R6.4 Reset Semantics Normalization Across Drivers and Poses

Priority and why this should still be done:

- Level: `P0`
- Why: Reset must clear staged state deterministically; stale override-enabled inputs can re-apply old values after reset.

Dependencies / blockers:

- Depends on: `R6.1`, `R6.3`
- Blocks: `R6.5`

Intent:

- Normalize reset behavior so driver + pose defaults are consistently restored and override-enabled states are cleared.

Acceptance checks:

1. Reset clears override-enabled channels before applying defaults.
2. Driver and pose reset values use deterministic defaults.
3. Subsequent staging does not resurrect pre-reset state.

Completion notes (2026-03-01):

1. Reference runtime reset now clears override-enabled flags and reapplies defaults.
2. Variables/poses reset logic now aligns with runtime/default values for both driver and pose controls.
3. Regression coverage updated in:
   - `src/components/app/ReferenceFaceRuntime.test.tsx`
   - `src/components/panels/VariablesPanel.test.tsx`

### [ ] R6.5 Dual-Face Perf Thresholds and Session Audit Trail

Priority and why this should still be done:

- Level: `P1`
- Why: Copy flow and runtime reliability are now stable; we still need explicit perf thresholds and session-level audit visibility for operational confidence.

Dependencies / blockers:

- Depends on: `R6.1`, `R6.2`, `R6.3`, `R6.4`
- Blocks: reference-face workflow signoff

Intent:

- Publish measurable dual-face perf gates and emit structured copy-session summaries.

Acceptance checks:

1. Perf thresholds are documented with reproducible dual-face benchmark runs.
2. Copy sessions emit auditable summary records (operation type, source, destination, unresolved count, final action).
3. SOP and implementation-plan docs reflect the finalized thresholds and logging behavior.

## Block G — Animation + Orchestrator Unification

Wave sequencing for this block is tracked in `plans/ANIMATION_ORCHESTRATOR_INTEGRATION_PLAN.md`.

### [x] G7.1 Playback Authority Contract Lock

Priority and why this should still be done:

- Level: `P0`
- Why: Current animation playback is split between local timeline and runtime graph paths; this causes drift and brittle behavior.

Dependencies / blockers:

- Depends on: none
- Blocks: `G7.2`, `G7.3`, `G7.4`, `G7.5`

Intent:

- Lock orchestrator-authoritative playback contract for authoring (`stage inputs -> step orchestrator -> apply merged writes`).

Acceptance checks:

1. Contract doc exists and is referenced by roadmap/tracker.
2. Path normalization and namespacing boundaries are explicitly defined.
3. Baseline playback observability metrics are captured.

### [x] G7.2 Transport Cutover to Orchestrator

Priority and why this should still be done:

- Level: `P0`
- Why: Local RAF timeline playback must not remain an alternate runtime path.

Dependencies / blockers:

- Depends on: `G7.1`
- Blocks: `G7.3`, `G7.4`

Intent:

- Route play/pause/scrub/stop through orchestrator transport and remove local-authority playback path.

Acceptance checks:

1. Timeline preview output is generated through orchestrator frame stepping.
2. Legacy local playback path is removed from active runtime flow.
3. Playback controls are wired to runtime behavior (no no-op transport stubs).

### [x] G7.3 Clip IR + Compiler Integration

Priority and why this should still be done:

- Level: `P0`
- Why: Timeline edits must compile deterministically into runtime-playable animation sources.

Dependencies / blockers:

- Depends on: `G7.2`
- Blocks: `G7.4`, `G7.5`

Intent:

- Add first-class `AnimationClipIR` and compile it into orchestrator-compatible animation source graphs/controllers.

Acceptance checks:

1. Clip/channel identity is deterministic.
2. Compile outputs are snapshot-tested and deterministic.
3. Interpolation mode metadata is honored in compile/runtime behavior.

### [x] G7.4 Bundle Export/Import Round-Trip for Authored Clips

Priority and why this should still be done:

- Level: `P0`
- Why: Authored animation must survive export/import without manual re-authoring.

Dependencies / blockers:

- Depends on: `G7.3`
- Blocks: `G7.5`, `P10.1`

Intent:

- Serialize authored clip IR/spec into bundle animation payloads and hydrate them on import.

Acceptance checks:

1. Author -> export -> import preserves clip semantics.
2. Bundle includes authored animation payload (not only inherited clips).
3. Round-trip tests are green.

### [x] G7.5 Runtime Lifecycle Decoupling from Panel Visibility

Priority and why this should still be done:

- Level: `P1`
- Why: Runtime/orchestrator lifecycle should not mount/unmount with panel visibility toggles.

Dependencies / blockers:

- Depends on: `G7.2`
- Blocks: stable graph-first workspace execution

Intent:

- Keep runtime graph registration/stepping active independent of motion graph panel visibility.

Acceptance checks:

1. Hiding motion graph pane does not tear down playback runtime.
2. Runtime registration lifecycles are panel-independent.
3. No regression in motion-graph editing workflows.

### [x] G7.6 Deterministic Timeline Editing Semantics

Priority and why this should still be done:

- Level: `P1`
- Why: Prototype randomness and hardcoded assumptions undermine deterministic authoring contracts.

Dependencies / blockers:

- Depends on: `G7.3`
- Blocks: long-term animation tooling confidence

Intent:

- Remove nondeterministic ID/color behavior and hardcoded layout assumptions in timeline internals.

Acceptance checks:

1. Timeline-generated IDs are deterministic.
2. Layout math avoids fixed geometry constants where possible.
3. Regression tests cover deterministic edit behavior.

## Block U — Workspace Clarity + Visual Consistency

### [ ] U8.1 Motion Graph Panes as Sidebar Elements

Priority and why this should still be done:

- Level: `P0`
- Why: Graph editing needs more workspace and clearer panel containment.

Dependencies / blockers:

- Depends on: `G7.2`
- Blocks: `U8.2`, `U8.3`

Intent:

- Move motion graph panes into sidebar panels and align their interaction model with existing authoring sidebars.

Acceptance checks:

1. Motion graph panes are sidebar-native.
2. Panel interactions follow shared sidebar semantics.
3. Graph workflows remain fully functional.

### [ ] U8.2 Graph-First Workspace Reclaim

Priority and why this should still be done:

- Level: `P0`
- Why: Graph editing should be able to use the area currently occupied by reference-face viewport in graph mode.

Dependencies / blockers:

- Depends on: `U8.1`
- Blocks: `U8.4`

Intent:

- Reconfigure workspace so graph canvas can expand into reclaimed viewport area when graph-focused mode is active.

Acceptance checks:

1. Graph canvas can occupy reclaimed workspace area.
2. Reference-face workflows remain available in their own mode/context.
3. Mode switching is explicit and stable.

### [ ] U8.3 Cross-Pane Visual Consistency Pass

Priority and why this should still be done:

- Level: `P1`
- Why: Dense authoring workflows need consistent labels, hierarchy, and control affordances.

Dependencies / blockers:

- Depends on: `U8.1`
- Blocks: `U8.4`

Intent:

- Apply a consistency pass across Variables, Poses, Inputs, Inspector, and Motion Graph sidebar surfaces.

Acceptance checks:

1. Context chips/labels are consistent across panes.
2. Control hierarchy and affordances are consistent.
3. Visual style tokens are applied uniformly.

### [ ] U8.4 Pose Group + Blend Visualization Upgrade

Priority and why this should still be done:

- Level: `P1`
- Why: Pose-stage/group blending is powerful but still visually dense and hard to scan.

Dependencies / blockers:

- Depends on: `U8.2`, `U8.3`
- Blocks: ergonomics signoff for dense pose projects

Intent:

- Improve grouping and visualization of pose groups, blend stages, and compose interactions.

Acceptance checks:

1. Group/stage relationships are visible without deep inspector traversal.
2. Blend mode and source provenance are readable in collapsed and expanded views.
3. Dense-pose usability regressions are reduced.

## Block V — Sample GLB + Standard-Rig Finalization

### [ ] V9.1 Finalize Canonical GLB Examples (Quori, Toasty)

Priority and why this should still be done:

- Level: `P0`
- Why: Stable examples are required for regression confidence and demos.

Dependencies / blockers:

- Depends on: `G7.4`
- Blocks: `V9.2`, `V9.3`

Intent:

- Finalize and version canonical sample bundles for Quori and Toasty.

Acceptance checks:

1. Canonical sample files are checked in with provenance notes.
2. Samples pass import/playback/export smoke flows.
3. Bundle metadata contracts are verified.

### [ ] V9.2 Define and Validate Vizij Standard Rigs for Samples

Priority and why this should still be done:

- Level: `P0`
- Why: Cross-face portability depends on standard-rig mapping quality.

Dependencies / blockers:

- Depends on: `V9.1`
- Blocks: `V9.3`

Intent:

- Define target standard-rig coverage for Quori and Toasty and validate mapping completeness.

Acceptance checks:

1. Coverage matrix exists for each sample face.
2. Missing/partial channels are explicitly documented.
3. Standard-rig mappings pass compile/runtime smoke checks.

### [ ] V9.3 Sample Fixture Matrix + CI Gates

Priority and why this should still be done:

- Level: `P1`
- Why: Sample reliability must be enforceable, not manual-only.

Dependencies / blockers:

- Depends on: `V9.2`
- Blocks: sample-asset signoff

Intent:

- Add deterministic fixture/CI checks for Quori/Toasty import/playback/export contracts.

Acceptance checks:

1. Fixture tests run in CI and gate regressions.
2. Failures are actionable by sample + contract area.
3. Docs reference fixture matrix as source of truth.

## Block P — Speech + Viseme Extension (Amazon Polly)

### [ ] P10.1 Speech Provider Abstraction + Polly Adapter

Priority and why this should still be done:

- Level: `P1`
- Why: Speech pipeline should be vendor-extensible and not hardwired into UI/runtime components.

Dependencies / blockers:

- Depends on: `G7.4`
- Blocks: `P10.2`, `P10.3`

Intent:

- Define provider interface and implement Amazon Polly adapter behind that boundary.

Acceptance checks:

1. Provider API exists with Polly implementation.
2. No direct Polly coupling in authoring UI components.
3. Adapter-level tests cover request/response normalization.

### [ ] P10.2 Viseme-to-Rig Mapping Through Orchestrator

Priority and why this should still be done:

- Level: `P1`
- Why: Viseme playback must use the same orchestrator input path as authored animation/pose controls.

Dependencies / blockers:

- Depends on: `P10.1`
- Blocks: `P10.3`

Intent:

- Map speech viseme events into standard rig/pose channels and stage through orchestrator transport.

Acceptance checks:

1. Speech playback drives expected viseme channels.
2. Mapping is configurable per face/sample.
3. Runtime contract tests verify path correctness.

### [ ] P10.3 Speech/Viseme Sync Diagnostics + Quality Gates

Priority and why this should still be done:

- Level: `P2`
- Why: Lip-sync quality needs observable timing diagnostics for iteration and regression control.

Dependencies / blockers:

- Depends on: `P10.2`
- Blocks: speech-viseme production signoff

Intent:

- Add diagnostics for audio/viseme timing drift and define quality gates for acceptable sync.

Acceptance checks:

1. Timing diagnostics surface drift and late-event behavior.
2. Quality gate thresholds are documented.
3. Speech/viseme regression tests are green.

## Block F — Import Migration Reliability Integration

### [ ] F5.1 Import Outcome-Class Contract

Priority and why this should still be done:

- Level: `P0`
- Why: Import reliability remains partially implicit. We need one explicit contract for runtime behavior, diagnostics, and tests.

Dependencies / blockers:

- Depends on: none
- Blocks: `F5.2`, `F5.3`, `F5.4`, `F5.6`, `F5.7`, `F5.8`

Intent:

- Define and enforce import outcomes across rig and pose import paths:
  - `success`
  - `success_with_repair`
  - `blocked_recoverable`
  - `blocked_fatal`

Acceptance checks:

1. Rig and pose import APIs produce one of the four outcome classes.
2. Outcome-class mapping is deterministic and does not rely on console-only interpretation.
3. Architecture and UI contracts reference the same outcome-class definitions.

### [ ] F5.2 Discrepancy Identity and Decision Replay

Priority and why this should still be done:

- Level: `P0`
- Why: Current acceptance-key behavior can bypass required review for changed imports; repeated imports also lack robust decision replay semantics.

Dependencies / blockers:

- Depends on: `F5.1`
- Blocks: `F5.8`

Intent:

- Replace length-based discrepancy acceptance identity with content-hash identity and persist safe review decisions by source signature.

Acceptance checks:

1. Acceptance identity uses canonical content hash (not string length).
2. Re-importing the same artifact can reuse compatible prior decisions.
3. Changed imports cannot bypass discrepancy review.
4. Supporting quality gates `QL0.1` and `QL2.4` are complete.

### [ ] F5.3 Import Failure Surface Contract (Asset, Sample, Bundle)

Priority and why this should still be done:

- Level: `P0`
- Why: Import and sample load failures still have console-only paths; operators need actionable in-app feedback.

Dependencies / blockers:

- Depends on: `F5.1`
- Blocks: `F5.8`

Intent:

- Ensure all asset/sample/bundle import failures surface recoverable user-visible diagnostics.

Acceptance checks:

1. Asset-loader and sample-load failures are shown in UI with actionable remediation.
2. Bundle synchronizer rig/pose import failures are surfaced in UI, not console-only.
3. Failure states are recoverable without hard refresh.
4. Supporting quality gates `QL0.2`, `QL0.3`, and `QL2.5` are complete.

### [ ] F5.4 Compatibility Adapter in `@vizij/render`

Priority and why this should still be done:

- Level: `P1`
- Why: Metadata compatibility handling is still spread across paths and does not provide a single canonical diagnostics contract.

Dependencies / blockers:

- Depends on: `F5.1`
- Blocks: `F5.5`, `F5.8`

Intent:

- Introduce a compatibility adapter that normalizes supported legacy/current bundle metadata before import execution.

Acceptance checks:

1. Multi-key extension discovery supports legacy and current aliases with deterministic precedence.
2. Multiple candidate bundle entries resolve via deterministic selection rules.
3. Unsupported variants produce explicit diagnostics instead of silent drops.

### [ ] F5.5 Root Detection and Scene Fallback Hardening

Priority and why this should still be done:

- Level: `P1`
- Why: Root detection still relies on narrow assumptions; missing-root assets should fail recoverably with guidance.

Dependencies / blockers:

- Depends on: `F5.4`
- Blocks: `F5.8`

Intent:

- Implement root fallback chain and recoverable blocking behavior that preserves existing authoring state until candidate validation completes.

Acceptance checks:

1. Root fallback chain is explicit: metadata -> derived bounds -> recoverable block guidance.
2. Missing-root assets fail as `blocked_recoverable` with actionable remediation.
3. No partial state mutation occurs before candidate asset validation succeeds.

### [ ] F5.6 Deterministic Persistence Migration Registry

Priority and why this should still be done:

- Level: `P1`
- Why: `schemaVersion` is persisted, but migrations are not currently a deterministic ordered registry with fixture coverage.

Dependencies / blockers:

- Depends on: `F5.1`
- Blocks: `F5.8`

Intent:

- Add ordered migration registry (`vN -> vN+1`) for rig persistence and make migration failures user-visible.

Acceptance checks:

1. Load path dispatches through ordered migration steps by `schemaVersion`.
2. Persisted fixtures for older versions migrate to current schema without loss.
3. Storage failures (quota/private mode/unavailable storage) are surfaced to users.

### [ ] F5.7 Pose Remap Completion: Create Missing Standard Input

Priority and why this should still be done:

- Level: `P1`
- Why: Remap workflow still requires manual path entry for unresolved outputs, which slows imports and increases operator error risk.

Dependencies / blockers:

- Depends on: `F5.1`, `F5.3`
- Blocks: `F5.8`

Intent:

- Extend pose remap workflow with optional "create missing standard input" path and deterministic apply-plan validation.

Acceptance checks:

1. Wizard can create missing standard inputs inline when no mapping exists.
2. Conflict and validation outcomes remain deterministic and test-covered.
3. Remap completion no longer depends on manual canonical path typing for common unresolved cases.

### [ ] F5.8 Import Fixture Matrix, CI Gate, and Contract Docs

Priority and why this should still be done:

- Level: `P1`
- Why: We need deterministic regression detection and one source of truth for supported import formats and outcomes.

Dependencies / blockers:

- Depends on: `F5.2`, `F5.3`, `F5.4`, `F5.5`, `F5.6`, `F5.7`
- Blocks: import reliability signoff

Intent:

- Add legacy/current/malformed fixture matrix with outcome-class assertions and establish contract docs as source of truth.

Acceptance checks:

1. Fixture suite covers legacy, current, and malformed bundles with expected outcome classes.
2. CI includes fixture matrix regression checks.
3. Compatibility contract documentation is published and referenced by roadmap/tracker docs.

## Recently Completed (Reference)

- `Q0.2` Canonical pose target mapping and no-ghost-variable add flow guardrails.
- `Q2.1` My Drivers binding/expression UX overhaul.
- `B2.4 Inspector Chain Traversal Completion` landed in the prior execution cycle and remains a required contract baseline.
- Pose IR diagnostics surfaced in authoring UI and bundle export metadata (`IR2`, `IR3`).
- Pose "What I Drive" 3-row control redesign and pose duplication action.
- `E4.3` Overlap bias/activity heuristic design pack delivered with scenario outputs, policy tradeoffs, and implementation scope.
- `R6.1` Path-first reference/shared staging and canonical pose-weight reset routing.
- `R6.2` Runtime pose-control bridge compatibility for direct-prefixed legacy channels.
- `R6.3` Export compose wiring + bundled fallback guardrails for missing `RobotData`.
- `R6.4` Reset/default normalization across reference drivers and poses.
