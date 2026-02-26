# Pose Group + Stage Inspector Sprint Plan (Proposal + SOP)

Last updated: 2026-02-26  
Status: `planned`

## Goal

Finish pose-group and blend-stage authoring UX so it matches the current vision:

1. Stage/group inspectors become the primary home for neutral authoring.
2. Neutral supports scoped resolution with explicit precedence:
   - stage override
   - group override
   - global neutral
   - channel default fallback
3. Inputs pane remains read-only observability for composition outputs.
4. Behavior stays runtime-truthful with deterministic config -> IR -> graph projection and diagnostics.

## Scope

In scope:

1. Scoped neutral contracts in pose config + IR + store + compiler.
2. Group inspector neutral authoring controls.
3. New stage inspector with neutral authoring and composition output analysis.
4. Diagnostics and tests for invalid neutral sources and fallback behavior.
5. Contract/doc updates (`UI_DESIGN.md`, `ARCHITECTURE.md`, explainer) aligned with implementation.

Out of scope (this sprint):

1. New blend algorithms beyond current additive + overlay-average semantics.
2. Fixed checkpoint sampling presets (`0/25/50/75/100`) as default workflow.
3. Large panel IA refactors outside pose groups/stage inspector flow.

## Locked Product/Behavior Decisions

1. Keep current blend semantics:
   - additive and overlay-average remain unchanged.
2. Inputs panel remains read-only for composition outputs and provenance.
3. Neutral authoring methods for stage/group contexts:
   - `inherit` (no local override),
   - `pose-reference`,
   - `direct-values`.
4. Compiler precedence target:
   - `stage > group > global > input.defaultValue > 0`.

## SOP: How This Sprint Runs (Sub-Agent Orchestration)

For each chunk below:

1. Create a short implementation brief from this doc.
2. Spawn parallel sub-agents:
   - `explorer` for file-level context and contract checks.
   - `worker` for implementation in assigned file ownership.
   - `awaiter` for long-running test/validate commands.
3. Merge results in main agent, run targeted tests, then commit the chunk.
4. Update this document:
   - chunk status,
   - progress log entry,
   - validation evidence.
5. Do not begin next chunk until current chunk acceptance is met or explicitly marked blocked/deferred.

Execution rules:

1. No destructive git operations.
2. Preserve user-authored unrelated changes.
3. Prefer small commits with passing targeted tests per chunk.
4. Run `pnpm --filter vizij-authoring run validate` at least once per major milestone.
5. Run `pnpm run prep` at sprint closeout.

## Commit-Sized Work Chunks

### Chunk S0 — Contract Lock + Baseline Tracker Wiring (`S0`) [done]

1. Finalize scoped neutral contract text and precedence in active docs.
2. Add tracker links/notes so this plan is discoverable during sprint.

Primary files:

1. `apps/vizij-authoring/docs/pose_grouping_explainer.md`
2. `apps/vizij-authoring/docs/UI_DESIGN.md`
3. `apps/vizij-authoring/docs/ARCHITECTURE.md`
4. `apps/vizij-authoring/docs/plans/TRACKER.md`

Acceptance:

1. Docs consistently describe neutral source types and precedence.
2. No conflicting wording about where neutral authoring lives.

### Chunk S1 — Config/IR Type System for Scoped Neutral (`S1`) [done]

1. Extend pose config and IR types with optional group/stage neutral specs.
2. Keep backwards compatibility when scoped fields are absent.

Primary files:

1. `apps/vizij-authoring/src/poseRig/types.ts`
2. `apps/vizij-authoring/src/poseRig/services/poseConfigService.ts`
3. `apps/vizij-authoring/src/poseRig/services/poseIrService.ts`

Acceptance:

1. Round-trip config -> IR -> config preserves scoped neutral fields.
2. Legacy payloads normalize without behavior regressions.
3. Diagnostics cover malformed scoped-neutral payloads.

### Chunk S2 — Store APIs + Projection Safety (`S2`) [planned]

1. Add store actions/selectors for stage/group neutral source editing.
2. Ensure rebuild/projection pipeline retains new fields deterministically.

Primary files:

1. `apps/vizij-authoring/src/poseRig/store.tsx`
2. `apps/vizij-authoring/src/poseRig/usePoseRigAuthoring.ts`

Acceptance:

1. Stage/group neutral edits are represented in state and drafts.
2. No data loss across rebuild cycles or imports.

### Chunk S3 — Compiler Neutral Resolution by Context (`S3`) [planned]

1. Implement effective neutral resolution per stage/group context using locked precedence.
2. Keep additive + overlay-average behavior unchanged except baseline source.
3. Emit diagnostics for unknown pose references and invalid/partial direct values.

Primary files:

1. `apps/vizij-authoring/src/poseRig/graphBuilder.ts`
2. `apps/vizij-authoring/src/poseRig/services/poseIrService.ts`

Acceptance:

1. Stage/group-scoped neutral changes affect compiled outputs as expected.
2. Existing non-scoped behavior remains stable.

### Chunk S4 — Inspector Selection/State Foundations for Stages (`S4`) [planned]

1. Add stage-level selection context to inspector routing.
2. Wire stage inspector entry point without breaking pose/group selection behavior.

Primary files:

1. `apps/vizij-authoring/src/hooks/useUnifiedSelection.ts`
2. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
3. `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

Acceptance:

1. Selecting a stage opens stage-specific inspector content.
2. Existing pose/group inspector workflows still work.

### Chunk S5 — Group Inspector Neutral Authoring + Outputs (`S5`) [planned]

1. Extend group inspector with neutral source selector.
2. Add pose-reference picker and direct-values editor.
3. Add composition outputs section:
   - effective channel outputs (read-only),
   - neutral source/value details,
   - source contribution breakdown.

Primary files:

1. `apps/vizij-authoring/src/components/inspector/InspectorPanel.tsx`
2. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`

Acceptance:

1. Group inspector can author scoped neutral fully.
2. Output analysis matches current authored live weights.

### Chunk S6 — Stage Inspector Neutral Authoring + Outputs (`S6`) [planned]

1. Implement full stage inspector with parity to group neutral controls.
2. Include stage source controls and composition output analysis in inspector context.

Primary files:

1. `apps/vizij-authoring/src/components/inspector/InspectorPanel.tsx`
2. `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`
3. `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

Acceptance:

1. Stage inspector supports `inherit`, `pose-reference`, `direct-values`.
2. Stage output diagnostics/analysis are visible without using Inputs pane alone.

### Chunk S7 — Test Matrix, Regression Proof, Docs Closeout (`S7`) [planned]

1. Add/expand tests for scoped neutral precedence and inspector flows.
2. Update docs + tracker + validation evidence.
3. Run sprint closeout validation.

Primary tests/files:

1. `apps/vizij-authoring/src/poseRig/services/poseConfigService.test.ts`
2. `apps/vizij-authoring/src/poseRig/services/poseIrService.test.ts`
3. `apps/vizij-authoring/src/poseRig/store.test.ts`
4. `apps/vizij-authoring/src/poseRig/graphBuilder.test.ts`
5. `apps/vizij-authoring/src/poseRig/topologyGolden.test.ts`
6. `apps/vizij-authoring/src/components/inspector/poseInspectorSemanticsContracts.test.ts`

Acceptance:

1. Targeted tests pass for all new behaviors.
2. `pnpm --filter vizij-authoring run validate` passes.
3. `pnpm run prep` passes or any skip is explicitly documented.

## Progress Board

| Chunk | Status  | Owner                 | Notes                                                   |
| ----- | ------- | --------------------- | ------------------------------------------------------- |
| S0    | done    | main agent + explorer | Contract lock + tracker linkage                         |
| S1    | done    | worker                | Types/services scoped neutral contracts + service tests |
| S2    | planned | worker                | Store action/state plumbing                             |
| S3    | planned | worker                | Compiler neutral precedence                             |
| S4    | planned | worker                | Inspector stage selection foundation                    |
| S5    | planned | worker                | Group inspector neutral UX                              |
| S6    | planned | worker                | Stage inspector neutral UX                              |
| S7    | planned | main agent + awaiter  | Validation, docs closeout                               |

## Progress Log

- 2026-02-26: Plan created.
  1. Locked sprint into commit-sized chunks `S0`-`S7`.
  2. Defined sub-agent SOP and acceptance gates per chunk.
  3. Ready to begin implementation at `S0`.
- 2026-02-26: Chunk `S0` completed.
  1. Aligned neutral authoring contract text in `UI_DESIGN.md` and `ARCHITECTURE.md` to scoped precedence and inspector-home behavior.
  2. Added active execution linkage in docs index and explainer to this sprint plan.
  3. Added `S0`-`S7` rows in `plans/TRACKER.md` for shared status visibility.
- 2026-02-26: Chunk `S1` completed.
  1. Added scoped-neutral contracts (`inherit`, `pose-reference`, `direct-values`) to pose group + blend stage config/IR types.
  2. Extended config and IR normalization/mapping so scoped neutral survives config -> IR -> config round-trips.
  3. Added malformed scoped-neutral warning/diagnostic coverage in config/IR services.
  4. Validation:
     - `pnpm --filter vizij-authoring test -- src/poseRig/services/poseConfigService.test.ts src/poseRig/services/poseIrService.test.ts`
     - `pnpm --filter vizij-authoring typecheck`

## Validation Evidence

1. `S1`:
   - `pnpm --filter vizij-authoring test -- src/poseRig/services/poseConfigService.test.ts src/poseRig/services/poseIrService.test.ts` (pass; 2 files / 42 tests)
   - `pnpm --filter vizij-authoring typecheck` (pass)

## Risks / Watch Items

1. Store projection can silently drop new fields unless config+IR services are updated first.
2. Stage inspector selection wiring can regress existing pose/group inspector paths.
3. Scoped neutral diagnostics may duplicate existing warnings unless codes/locations are normalized.
4. UI density risk in inspector; keep outputs readable without flattening all channels by default.
