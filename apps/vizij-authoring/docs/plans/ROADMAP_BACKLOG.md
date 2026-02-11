# Vizij Authoring Roadmap and Backlog

Last updated: 2026-02-11

## Priority Bands

### P0 (correctness and runtime-truthful behavior)

1. Resolve rig/pose wiring fidelity and retargeting gaps:
   - false "No Driven properties" diagnostics for higher-level rig items
   - pose-output variable retargeting for previously wired/legacy faces
   - pose -> rig -> face connection traceability and mismatch diagnosis
   - import review auto-rename and order-insensitive matching behavior
   - upgrade trace/remap outputs from diagnostics-only to actionable migration fixes
2. Close deep-review runtime correctness regressions:
   - clear/remove graph payloads must unregister stale runtime graphs
   - restage defaults/inputs when runtime bridge becomes ready after graph setup
   - guard uncaught pose-graph build failures in pose export flow
3. Harden face-mismatch auto-resolution:
   - auto-solve pure face-id namespace mismatches by deterministic rewrite + strict residual diff
   - avoid broad heuristic auto-accept for non-face semantic mismatches
4. Keep baseline green:
   - `vizij-authoring` typecheck.
   - targeted runtime/authoring regression suites.
5. Fix active runtime wiring risks:
   - non-reactive `stageRuntimeInput` read path.
   - no-op playback controls vs exposed debug controls.
   - disconnected pose graph import action in export dialog flow.
6. Close pose/export contract gaps:
   - align `exportGlb` pose validation with recomputed pose graph using active blend mode.
   - remove or safely handle `PoseGraphService.generateSummary` throw path.

### P1 (integration hardening and confidence)

1. Expand required validation beyond targeted tests.
2. Finish remaining Rigging <-> Posing integration tasks:
   - navigation/linking flows.
   - quick toggles and focused filtering.
   - coverage panel + rig kind roundtrip tests.
3. Promote compile/validate/apply visibility from debug-first tooling into normal workflow.

### P2 (architecture and scale-readiness)

1. Continue app shell/store modularization and add store-level tests.
2. Improve heavy audits:
   - RobotData audit versioning/caching/worker strategy.
   - Bundle audit queueing/chunking/caching.
3. Replace JSON-only cloning in import/export-critical paths.
4. Modularize pose authoring internals for testability and future scene/material features.
5. Replace custom virtualization with maintained virtualizer primitives.

### P3 (authoring UX expansion)

1. Animator feedback tranche:
   - undo/redo foundation.
   - scrubbable numeric controls and degree display.
   - collapsible persistence and expand/collapse-all.
2. Known bugs and UI polish backlog in `plans/BACKLOG.md`.

## Out of Scope for this doc

Cross-repo platform initiatives (multi-screen runtime, audio/viseme core runtime, website/ecosystem, etc.) are tracked outside the authoring-app backlog.

## Re-Prioritization Rules

1. Do not pull P2/P3 work while P0 has unresolved blockers.
2. Move items between priority bands only with date and rationale.
3. Keep `TRACKER.md` and `BACKLOG.md` synchronized when priorities change.
