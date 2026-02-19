# Vizij Authoring Backlog (Active)

Last updated: 2026-02-19

Status legend: `[ ]` planned, `[~]` in progress, `[x]` done

This backlog is organized by semantic block, then by dependency order inside each block.

## Critical Path (Current)

1. `A0.1` -> `A0.3` -> `B1.1` -> `B1.2` -> `C2.1` -> `C2.2` -> `C2.3`
2. `A0.2` is a release blocker and can run in parallel, but must be done before release.
3. `D3.1` and `D3.2` depend on `A0.1` and `B1.1`.
4. `E4.*` remains intentionally deferred until the multi-stage model (`C2.*`) is stable.

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

### [ ] B1.2 Neutral Strategy Authoring and Round-Trip (`IR5`)

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

### [ ] B1.3 Enforce Ghost-Signal Boundary Contract

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

### [ ] B1.4 Unified Pose Import Feedback UX (`IR4`)

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

## Block C — Blend Topology and Scale

### [ ] C2.1 Multi-Stage Blend IR Primitives (`IR6`)

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

### [ ] C2.2 Multi-Stage Blend Authoring UI (`IR7`)

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

### [ ] C2.3 Golden Topology Fixture Suite (`IR8`)

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

## Block D — UX Simplification and Maintainability

### [ ] D3.1 Autorig Abstraction Cleanup (Primary UX)

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

### [ ] D3.2 Inputs Pane IA for Group/Stage Controls

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

### [ ] D3.4 Empirical Performance Baseline Capture

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

## Block E — Deferred Policy R&D (Not MVP)

### [ ] E4.1 Per-Channel Override Map (`IR9`)

Priority and why this should still be done:

- Level: `P3`
- Why: Needed for advanced channel-specific composition behavior, but intentionally deferred to keep MVP tractable.

Dependencies / blockers:

- Depends on: `C2.1`, `C2.3`
- Blocks: advanced production tuning

Intent:

- Add optional per-channel cross-group/stage operation overrides.

Acceptance checks:

1. Override map compiles deterministically.
2. Invalid overrides emit structured diagnostics.
3. Global default policy remains unchanged when overrides are absent.

### [ ] E4.2 Priority Resolution Semantics (`IR10`)

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

### [ ] E4.3 Overlap Bias / Activity Heuristic Design Pack

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

## Recently Completed (Reference)

- `Q0.2` Canonical pose target mapping and no-ghost-variable add flow guardrails.
- `Q2.1` My Drivers binding/expression UX overhaul.
- `B2.4 Inspector Chain Traversal Completion` landed in the prior execution cycle and remains a required contract baseline.
- Pose IR diagnostics surfaced in authoring UI and bundle export metadata (`IR2`, `IR3`).
- Pose "What I Drive" 3-row control redesign and pose duplication action.
