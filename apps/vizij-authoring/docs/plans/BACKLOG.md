# Vizij Authoring Backlog (Active)

Last updated: 2026-02-19

Status legend: `[ ]` planned, `[~]` in progress, `[x]` done

This backlog is organized by semantic block, then by dependency order inside each block.

## Critical Path (Current)

1. Block `F5` is implemented in the current working tree (`F5.1`-`F5.8`); source-of-truth contract is `docs/references/import-compat-contract.md`.
2. Fixture matrix + validate path (`src/hooks/__tests__/importOutcomeMatrix.test.ts`) is the active regression gate for import outcome behavior.
3. Quality backlog `QL0.1` through `QL3.3` is complete in the working tree, including non-import boundary/docs sync.
4. Blocks `A0` through `E4` remain complete foundations, including Stage `4A` (`A0.4`-`A0.7`) direct+pose composition alignment.

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

- Guarantee deterministic retarget order: provision valid autorig targets first, then rebind invalid animatable writes.

Acceptance checks:

1. Legacy invalid direct animatable writes are converted into valid autorig-mediated chains.
2. Retargeting is idempotent across repeated imports.
3. Diagnostics explicitly identify `created`, `rebound`, and `fallback` cases.

Completion notes (2026-02-19):

1. Importer now supports pre-provisioning autorig inputs before normalization/retarget evaluation, so boundary-invalid direct animatable writes are resolved after target provisioning rather than before it.
2. Import diagnostics now include explicit `createdAutorigInputs` entries in addition to existing retarget/fallback diagnostics.
3. Rig graph import now passes generated autorig blueprint inputs into importer rehydration, enforcing \"provision target first, then rebind\" sequencing in the default import path.
4. Added regression tests in `src/rig/importer.test.ts` for:
   - provisioning + retarget sequencing correctness,
   - deterministic repeated imports with provisioned autorig targets.
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

### [x] D3.1 Autorig Abstraction Cleanup (Primary UX)

Priority and why this should still be done:

- Level: `P2`
- Why: Primary users should reason in high-level variable/property terms, not low-level autorig internals.

Dependencies / blockers:

- Depends on: `A0.1`, `B1.1`
- Blocks: polished production authoring UX

Intent:

- Hide autorig variables in default flows and provide direct variable <-> property navigation that conceptually crosses autorig internals.

Acceptance checks:

1. Default authoring workflows do not require direct autorig interaction.
2. Inspector chain links show high-level relationships clearly in both directions.
3. Advanced/debug mode can still expose autorig internals.

Completion notes (2026-02-19):

1. Rig inspector chain panels now default to high-level relationship framing (variables/properties), collapsing unmapped autorig internals from default view.
2. Added explicit inspector toggle for advanced/debug access:
   - `Show Autorig Internals` reveals low-level autorig links,
   - `Hide Autorig Internals` restores simplified view.
3. Upstream (`Driven By`) and downstream (`What This Drives`) lists now surface mapped property links directly when available, reducing forced low-level autorig navigation.
4. Added contract-test assertions to keep the autorig abstraction toggle and chain affordances present in inspector implementation.
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

## Block F — Import Migration Reliability Integration

### [x] F5.1 Import Outcome-Class Contract

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

Completion notes (2026-02-19):

1. Added shared import outcome types + helpers in `apps/vizij-authoring/src/types/importOutcome.ts`:
   - `success`
   - `success_with_repair`
   - `blocked_recoverable`
   - `blocked_fatal`
2. Rig and pose import paths now return typed import outcomes (`useRigGraphImport`, `usePoseGraphImport`), with consistent success classification via `isImportOutcomeSuccess`.
3. UI import flows are now wired around typed outcomes (`App.tsx`, bundle synchronizer, remap wizard apply flow) instead of implicit status interpretation.

### [x] F5.2 Discrepancy Identity and Decision Replay

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

Completion notes (2026-02-19):

1. Replaced length-based discrepancy identity with hash-based identity in `computeDiscrepancySignatureKey(...)` (`apps/vizij-authoring/src/hooks/useRigGraphImport.ts`).
2. Acceptance replay now uses a deterministic accepted-signature set (`acceptedSignatureKeysRef`) rather than a fragile last-signature check.
3. Added collision/regression coverage in `apps/vizij-authoring/src/hooks/useRigGraphImport.test.ts`.

### [x] F5.3 Import Failure Surface Contract (Asset, Sample, Bundle)

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

Completion notes (2026-02-19):

1. Added user-visible, recoverable import failure stack UI in `apps/vizij-authoring/src/components/app/ImportFailureStack.tsx`, wired in `apps/vizij-authoring/src/App.tsx`.
2. Sample-load and asset-load failures now set recoverable state with explicit retry actions.
3. Bundle synchronizer failures now emit typed `onFailure` callbacks and appear in UI with retry token replay.
4. Added regression coverage in:
   - `apps/vizij-authoring/src/components/app/ImportFailureStack.test.tsx`
   - `apps/vizij-authoring/src/hooks/__tests__/useBundleSynchronizer.test.ts`
   - `apps/vizij-authoring/src/hooks/useVizijAssetLoader.test.tsx`

### [x] F5.4 Compatibility Adapter in `@vizij/render`

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

Completion notes (2026-02-19):

1. Added bundle compatibility adapter in `packages/@vizij/render/src/functions/gltf-loading/import-compat.ts` with deterministic alias + scope precedence.
2. Extraction now exposes deterministic selection + diagnostics through `extractVizijBundleResult(...)` in `packages/@vizij/render/src/functions/vizij-bundle.ts`.
3. Loader-facing compatibility types were added in `packages/@vizij/render/src/types/vizij-bundle.ts`.
4. Added adapter coverage for alias precedence, multi-candidate resolution, and unsupported variant diagnostics in `packages/@vizij/render/tests/vizij-bundle.node-test.mjs`.

### [x] F5.5 Root Detection and Scene Fallback Hardening

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

Completion notes (2026-02-19):

1. Added explicit root resolution contract in `apps/vizij-authoring/src/utils/world.ts`:
   - metadata root bounds,
   - derived root fallback,
   - `blocked_recoverable` guidance when unresolved.
2. `useVizijAssetLoader` now validates root resolution before resetting/applying world state, preventing partial mutation on blocked candidate load.
3. `@vizij/render` now derives root bounds fallback for RobotData imports lacking metadata via `applyDerivedRootBoundsFallback(...)` in `packages/@vizij/render/src/functions/gltf-loading/traverse-three.ts`.
4. Regression coverage added in:
   - `apps/vizij-authoring/src/utils/world.test.ts`
   - `apps/vizij-authoring/src/hooks/useVizijAssetLoader.test.tsx`

### [x] F5.6 Deterministic Persistence Migration Registry

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

Completion notes (2026-02-19):

1. Added deterministic ordered migration registry (`v1 -> v2 -> v3`) in `apps/vizij-authoring/src/rig/legacyMigration.ts`.
2. `loadRigState(...)` now always migrates to `RIG_STATE_SCHEMA_VERSION` (`3`) in `apps/vizij-authoring/src/rig/persistence.ts`.
3. Migration/storage failure outcomes are typed and surfaced through user-facing alerts in `apps/vizij-authoring/src/hooks/useRigPersistence.ts`.
4. Coverage includes deterministic migration and failure paths in:
   - `apps/vizij-authoring/src/rig/persistence.test.ts`
   - `apps/vizij-authoring/src/rig/legacyMigration.test.ts`

### [x] F5.7 Pose Remap Completion: Create Missing Standard Input

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

Completion notes (2026-02-19):

1. Pose remap rows now support explicit `createMissingInput` flow in `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.tsx`.
2. Apply-plan builder in `apps/vizij-authoring/src/hooks/usePoseGraphImport.ts` now enforces deterministic outcomes (`ready`, `needs_creation`, `conflict`) with stable sorting for create/conflict plans.
3. Apply flow can create missing standard inputs before final remap compile, and recoverably blocks when creation is unavailable or fails.
4. Regression coverage added in:
   - `apps/vizij-authoring/src/hooks/__tests__/usePoseGraphImport.test.ts`
   - `apps/vizij-authoring/src/components/poseRig/PoseGraphRemapWizard.test.tsx`

### [x] F5.8 Import Fixture Matrix, CI Gate, and Contract Docs

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

Completion notes (2026-02-19):

1. Added fixture matrix classes (`legacy`, `current`, `malformed`) in `apps/vizij-authoring/src/hooks/__fixtures__/import/*`.
2. Added deterministic fixture-matrix gate in `apps/vizij-authoring/src/hooks/__tests__/importOutcomeMatrix.test.ts` (required classes, unique sorted IDs, expected outcome-class assertions).
3. Fixture gate is executed by workspace validation (`pnpm --filter vizij-authoring run validate` -> `vitest --run`).
4. Published import compatibility source-of-truth documentation in `apps/vizij-authoring/docs/references/import-compat-contract.md` and cross-linked planning/design docs.

## Recently Completed (Reference)

- `Q0.2` Canonical pose target mapping and no-ghost-variable add flow guardrails.
- `Q2.1` My Drivers binding/expression UX overhaul.
- `B2.4 Inspector Chain Traversal Completion` landed in the prior execution cycle and remains a required contract baseline.
- Pose IR diagnostics surfaced in authoring UI and bundle export metadata (`IR2`, `IR3`).
- Pose "What I Drive" 3-row control redesign and pose duplication action.
- `E4.3` Overlap bias/activity heuristic design pack delivered with scenario outputs, policy tradeoffs, and implementation scope.
