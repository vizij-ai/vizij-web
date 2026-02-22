# Unified Face Import Pipeline Plan (Separate Runtime, Shared Process)

Date: 2026-02-22  
Scope: `apps/vizij-authoring` main face + reference face import/runtime flow  
Worktree: `authoring-features`

## Execution Status

- `[x]` U0 Baseline Lock + Metrics Matrix (captured 5x OFF/ON Quori + Hugo and logged in tracker)
- `[x]` U1 Extract Shared Face Runtime Adapter (shared runtime input dispatcher hook used by main + reference paths)
- `[x]` U2 Unify Phase Model and Import Summary Shape (face-scoped perf sessions and shared `ImportProgressStatus` schema support)
- `[x]` U3 Normalize Publish Semantics Through One Mutation Contract (single decision helper now governs publish/skip semantics and mutation ordering tests)
- `[x]` U4 Introduce Staged User-Visible Loading Policy (policy-driven control gating now keeps face visible early and unlocks side panels only when runtime input bridge is ready)
- `[x]` U5 Reference Runtime Load/Step Throttling Policy (reference runtime now uses burst-driven active stepping with idle-throttled fallback and explicit policy badges)
- `[ ]` U6 Cross-Face Contract Tests
- `[ ]` U7 Cross-Asset Performance Validation

## Executive Decision

Use the same import/staging pipeline for both faces, but keep two runtime providers/stores.

Why:

1. It gives us most of the simplification win immediately.
2. It avoids a risky runtime model rewrite (current runtime contracts are effectively single-root per provider).
3. It keeps failure isolation and easier debugging per face.

## What This Means Concretely

- **Shared process**: one consistent lifecycle, phase model, metrics model, and mutation-class contract for both faces.
- **Separate runtimes**: main and reference each keep their own `VizijRuntimeProvider` + store.
- **Shared UI semantics**: both faces expose the same readiness/FPS/outline behavior policy.

## Why Not Single Runtime (Yet)

Current runtime APIs and bundle model are centered around one active root per provider (`assetBundle.glb`, `rootId`, single status context). A true single-runtime/two-face model would likely require either:

1. multi-root runtime status + APIs, or
2. synthetic merged world contract and dual face routing rules.

That is viable as an R&D track, but high risk for correctness and schedule.

## Target Architecture

### 1) Face Runtime Session Contract

Introduce a shared contract used by both main/reference hosts:

- `faceRole`: `"main" | "reference"`
- `faceKey`: stable ID for metrics and logs
- `bundleSource`: file/sample/world payload
- `stagingMode`: eager vs deferred chunks
- callbacks for:
  - `onPhaseChange`
  - `onPerfSummary`
  - `onReadyState`

### 2) Shared Staging Pipeline

One pipeline implementation with deterministic phases:

1. `acquire`
2. `parse`
3. `normalizeRig`
4. `normalizePose`
5. `publishTopology`
6. `publishPose`
7. `ready`
8. `controllable`

Both faces run the same phase logic and instrumentation fields.

### 3) Runtime Hosts (Two Instances)

Two thin host components consume the shared pipeline contract:

- Main host (interactive authoring source of truth)
- Reference host (comparison/runtime mirror)

Shared behavior policies:

- FPS badge on both
- consistent readiness labels
- selection-outline policy for both faces

### 4) Selection/Outline Policy

Selection source remains app-level selection store; each runtime receives mirrored selection in its own namespace for outline rendering.

## Implementation Plan (One Commit Per Step)

## Step U0: Baseline Lock + Metrics Matrix

- Capture fresh 5x OFF/ON runs for Quori + Hugo with current branch.
- Record:
  - `durationMs`
  - `rootAssignedToReadyMs`
  - `readyToFirstFrameMs`
  - `rootToControllableMs`
  - `controllerRegistrationRuns`
  - `graphBridgePublishes` breakdown
- Exit criteria: baseline table added to tracker before refactor.

## Step U1: Extract Shared Face Runtime Adapter

- Create a shared adapter/hook for runtime bridge logic currently duplicated across main/reference paths.
- Keep behavior identical; no ordering changes.
- Exit criteria:
  - no behavior change in smoke
  - existing import/runtime tests green

## Step U2: Unify Phase Model and Import Summary Shape

- Use one phase resolver/summary schema for both faces.
- Ensure identical event naming and summary fields.
- Exit criteria:
  - both faces emit comparable summaries
  - diagnostics panel can switch face source without schema branching

## Step U3: Normalize Publish Semantics Through One Mutation Contract

- Enforce consistent mutation classification rules (`topology`, `pose`, value-only) for both hosts.
- Add contract tests that assert phase + mutation order invariants.
- Exit criteria:
  - no manual nudge required in smoke
  - contract tests catch regression if ordering drifts

## Step U4: Introduce Staged User-Visible Loading Policy

- Present main face early when safe, then progressively enable dependent pose/control layers.
- Keep runtime correctness path intact; this is display/interaction gating, not publish suppression.
- Exit criteria:
  - perceived first-visual latency drops
  - controls become enabled only when controllable-ready is true

## Step U5: Reference Runtime Load/Step Throttling Policy

- Apply policy-based stepping for reference face when not actively manipulated.
- Example: reduced idle stepping, full stepping on interaction/change bursts.
- Exit criteria:
  - no visible correctness drift
  - reduced steady-state CPU/GPU cost in dual-face mode

## Step U6: Cross-Face Contract Tests

Add tests for:

1. matching phase order across main/reference
2. outline visibility on both faces for selection changes
3. FPS surface present for both faces
4. no regressions in pose responsiveness after import

Exit criteria: all added tests green and stable on repeated runs.

## Step U7: Cross-Asset Performance Validation

- Repeat import matrix on at least Quori + Hugo + one custom large face.
- Compare against U0 baselines.
- Exit criteria:
  - sub-5s mean user-visible target on at least primary assets
  - no regressions in correctness smoke checklist

## Correctness Guardrails

Do not ship any optimization that violates these:

1. Imported poses function immediately after import (no user nudge).
2. Variable/pose edits update runtime correctly on first interaction.
3. Selection outlines render correctly on both faces.
4. No silent fallback paths without telemetry.

## Performance Guardrails

- Dual-face steady-state overhead should be measurable and bounded.
- No hot-path debug instrumentation in production path by default.
- Any new per-frame work must have a clear budget and justification.

## Optional R&D Track: True Single Runtime / Multi-Root

Run as a separate spike only after U0-U7 stabilize.

Questions to answer first:

1. How should runtime context expose multiple roots/statuses?
2. How do we route selection/highlight/input per face safely?
3. What migration path preserves existing authoring contracts?

No production merge until a prototype proves:

- better or equal performance,
- equal correctness,
- lower system complexity in practice.

## Immediate Next Actions

1. Execute U0 baseline capture and write results into `import-performance-recovery-tracker-2026-02-21.md`.
2. Start U1 extraction with no behavior changes, plus targeted tests in the same commit.
3. Gate every subsequent step on smoke + contract test pass.
