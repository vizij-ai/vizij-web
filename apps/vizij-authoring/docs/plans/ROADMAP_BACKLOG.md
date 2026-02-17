# Vizij Authoring Roadmap and Backlog

Last updated: 2026-02-17 (P1 control-surface and rig metadata refactor queued)

## Priority Bands

### P0 (correctness and runtime-truthful behavior)

Status (2026-02-17): complete in current branch; move focus to P1 expansion work.

1. Done: Restore leaf-accurate chain authoring and visibility:
   - add-driven selection must support leaf components (no implicit xyz bulk binding).
   - Variables pane must include all path-backed standard inputs, not only custom inputs.
   - chain summaries must be transitive (`inputBindings` aware) across all inspector surfaces.
   - restore direct per-feature/per-leaf binding-expression editing in active inspector flows.
   - restore explicit static-vs-animatable feature controls in active inspector flows.
2. Done: Complete migration-grade trace/remap UX:
   - upgrade suggestion apply flow with preview, ignore, and undo-safe apply semantics.
   - harden low-confidence remap handling for legacy split-graph assets.
   - support optional non-delta output remap review for migration audits.
3. Done: Close deep-review runtime correctness regressions:
   - clear/remove graph payloads must unregister stale runtime graphs
   - restage defaults/inputs when runtime bridge becomes ready after graph setup
   - guard uncaught pose-graph build failures in pose export flow
4. Done: Keep baseline green:
   - `vizij-authoring` typecheck.
   - targeted runtime/authoring regression suites.
5. Done: Keep regression guardrails on recently fixed wiring paths:
   - discrepancy/import action wiring remains covered by targeted tests.
   - playback UI stays disabled until runtime playback is actually wired.
6. Done: Keep pose/export contract fixes locked in with tests:
   - `exportGlb` continues validating recomputed pose graph using active blend mode.
   - `PoseGraphService.generateSummary` remains non-throwing for imported specs.

### P1 (integration hardening and confidence)

Status (2026-02-17): pose-group authoring controls are now implemented; remaining P1 focus is aggregate semantics, import/diagnostic completeness, and import strategy controls before full P2.

1. Done: inspector chain traversal + binding parity across Pose/Rig/Animatable.
2. Done: routing-contract and chain regression coverage additions.
3. Done: inspector slider fidelity baseline fixes (self-slot guard, active-slot quick edit, issue surfacing).
4. Done: expanded app-level validation path (`vizij-authoring` `validate` script).
5. Done: standard-input coverage panel + pose rig kind roundtrip tests.
6. Done: compile/validate/apply signals promoted into primary inspector workflow.
7. Done: first-class pose-group domain model and migration support (`pose.group` carry-forward).
8. Done: two-layer pose blending compile topology (within-group, then cross-group).
9. Done: blend strategy controls surfaced for authoring/export flow.
10. Done: pose creation + pose-group inspection UI for hands-on chain validation.
11. Done: split primary left panel into dedicated Face Elements / Variables / Poses / Pose Groups / Drivers surfaces.
12. Done: finalize pose inspector + pose membership editing consistency in the dedicated Poses/Groups surfaces.
13. Done: implement Pose Group lifecycle editor with cross-group blend-mode controls in the Pose Groups pane and local blend-mode controls in the pose-group inspector.
14. Done: alias `/rig/element` rig inputs as metadata and keep them out of variable/driver chain edit surfaces.
15. Next: surface pose aggregate outputs as explicit rig binding sources in inspector/binding semantics.
16. Done: enforce rig boundary where only low-level rig variables can write animatable leaves.
17. Done: finalize lifecycle operations for pose groups (rename/delete/edit) in dedicated Pose Group pane.
18. Next: add explicit import grouping strategy controls and group-level conflict handling.
19. Next: add pose-layer diagnostics (group/aggregate/boundary/target coverage) and wire to export readiness.
20. Next: preserve deterministic group strategy and import behavior in migration/export docs.
21. Tracking spec: `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`.

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
