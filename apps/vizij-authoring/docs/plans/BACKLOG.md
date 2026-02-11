# Backlog

Last updated: 2026-02-11

The canonical planning set for authoring lives in:

- `apps/vizij-authoring/docs/plans/GOAL.md`
- `apps/vizij-authoring/docs/plans/TRACKER.md`
- `apps/vizij-authoring/docs/plans/ROADMAP_BACKLOG.md`

Use this file for app-local implementation backlog only.

## P0 (must address first)

- [ ] Investigate false "No Driven properties" signals for higher-level rig items.
      Context: authors can observe rigs visibly driving the face while inspector/high-level summaries claim there are no driven properties.
      Goal: align inspector diagnostics with actual runtime write paths so the driven-property state is trustworthy.
      Exit criteria: a reproducible failing case is documented, root cause is fixed, and inspector output matches observed driving behavior.
- [ ] Add pose-output retargeting workflow for previously wired faces.
      Context: pose outputs list driven variables, but variable details are not editable in place and legacy/old-system faces do not visibly respond.
      Goal: make driven variable details inspectable and editable so pose outputs can be retargeted to correct rig inputs/paths.
      Exit criteria: user can open a pose output, inspect current target mapping, retarget mapping, and see face response update.
- [ ] Implement end-to-end pose -> rig -> face connection debug trace.
      Context: selecting a face element shows pose connections, but those wirings appear not to flow through to actual drive results.
      Goal: provide a deterministic trace path that confirms whether pose weights resolve into rig inputs and then to animatable writes.
      Exit criteria: for any selected face element, tooling can show matched pose outputs, rig inputs, and final animatable targets with mismatch diagnostics.
- [ ] Rework import review mismatch handling into automatic face rename + order-insensitive matching.
      Context: face mismatch review currently behaves as manual friction; list comparisons can fail because of ordering rather than semantic mismatch.
      Goal: auto-resolve face-id rename workflows and treat permutation-only list differences as equivalent.
      Exit criteria: import review auto-renames when safe, ignores order-only diffs, and only prompts when there is a true mapping conflict.
- [ ] Make runtime input staging reactive in `useRigController` (avoid stale `getState()` callback capture).
- [ ] Resolve graph playback UX mismatch:
  - either wire playback actions to runtime behavior
  - or remove/disable controls until implemented.
- [ ] Wire pose graph import action consistently in export/import dialog surface.
- [ ] Align `exportGlb` pose validation with recomputed pose graph using active blend mode.
- [ ] Replace or safely guard `PoseGraphService.generateSummary` throw path.
- [ ] Keep baseline checks green:
  - `pnpm --filter vizij-authoring typecheck`
  - targeted runtime/authoring regression tests.

## P1 (next up)

- [ ] Complete Rigging <-> Posing navigation and quick toggles.
- [ ] Add test coverage for standard-input coverage panel + pose rig kind roundtrip.
- [ ] Expand required validation set beyond targeted suites.
- [ ] Promote compile/validate/apply states from debug-first presentation to primary authoring workflow feedback.

## P2 (architecture and scale-readiness)

- [ ] Extract remaining cross-workbench app flows into focused hooks/services.
- [ ] Add store-level tests for graph runtime, binding authoring, and selection stores.
- [ ] Harden RobotData audit:
  - scene/animatable versioning
  - incremental caching
  - worker-capable traversal path.
- [ ] Harden bundle audit:
  - explicit run model
  - chunked/parallel compile/diff path
  - caching by graph hash.
- [ ] Replace JSON-only deep clone in import/export mutation paths.
- [ ] Continue pose authoring modularization for unit-testable persistence/math/IO layers.
- [ ] Replace bespoke `StandardInputsSection` virtualization with maintained virtualizer primitives.

## P3 (UX expansion and polish)

- [ ] Implement animator-feedback tranche:
  - undo/redo foundations
  - scrubbable number controls
  - collapsible persistence and expand/collapse-all.
- [ ] Dependency panel for variable -> shape relationships.
- [ ] Save/load animation workflow.
- [ ] Input coverage and shared-variable improvements.
- [ ] Procedural inputs (sin/cos/tan/noise).
- [ ] Face-id editing UX.

## Known Bugs

- [ ] Inspector connected-variable list is too broad.
- [ ] Pose sliders are inconsistent.
- [ ] Creating material without attached shape fails.
- [ ] Selecting variable-to-drive can break hierarchy.
- [ ] Reference face hierarchy not shown.
- [ ] Self rigs should be hidden/locked.

## UI Polish Backlog

- [ ] Reduce excess blue tones and legacy CSS carryover.
- [ ] Keep panel titles sticky while scrolling.
- [ ] Unify add/create interactions for variables and materials.
- [ ] Improve iconography and visual intent consistency.
