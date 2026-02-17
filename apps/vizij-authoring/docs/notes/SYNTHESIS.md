# Authoring Notes Synthesis

Last updated: 2026-02-17 (control-surface refactor added)

This file is the relevance filter for all authoring notes. Use this before acting on older findings.

## Current Signal

1. P0 stabilization findings are resolved and locked by tests.
2. P1 chain-parity and Quori smoke correction findings are resolved.
3. Active P1 work has shifted to pose architecture semantics:
   - aggregate pose-source surfacing in inspector/binding flows,
   - rig boundary enforcement for animatable writes,
   - grouping/import strategy controls and diagnostics completeness,
   - dedicated control-surface split (Face Elements, Variables, Poses, Pose Groups, Drivers) is now implemented via dedicated left panes,
   - exclusion of auto-generated `/rig/element` paths from variable and Drivers edit surfaces,
   - primary-face pose pane behavior while secondary-face pose workflows are deferred.

## Resolved Findings Since Initial Reviews

1. Runtime graph clear/remove semantics and late-readiness input restaging are fixed.
2. Import remap and discrepancy handling are deterministic and conflict-safe.
3. Inspector chain clickthrough and cross-context binding editing are implemented.
4. Quick-edit slider reliability issues tied to slot resolution are fixed.
5. Pose parent-binding modal ambiguity (root vs missing link) is fixed.
6. Pose-group domain model and two-layer compile topology are implemented.
7. Pose authoring UX now includes:
   - pose creation and target editing,
   - neutral-safe single-pose preview semantics,
   - sidebar pose-group inspector controls.
8. Primary/secondary face workflow requested explicit sidebar decomposition: face-elements, variables, poses, pose-groups, drivers.

## Active Findings That Still Matter

1. Inspector semantics should distinguish pose entry vs group output vs aggregate output explicitly.
2. Rig boundary constraints still need strict enforcement and diagnostics for invalid higher-order animatable writes.
3. `/rig/element` alias behavior in rig-inspection context is still the remaining namespace hardening item; group lifecycle creation/rename/delete UX is now available.
4. Import grouping strategy needs explicit user-facing controls and deterministic preview.
5. Pose diagnostics need broader coverage (empty groups, aggregate gaps, boundary violations, unresolved target coverage).
6. `VariablesPanel` now runs as dedicated surface instances for Variables, Poses, and Drivers, with Pose Groups in a separate dedicated pane.
7. One globally selected item across panes is now enforced by `useUnifiedSelection`; remaining work is richer alias/aggregate semantics.
8. `/rig/element` handling is now filtered from Variables and Drivers, and the remaining work is surfacing them as explicit face-property aliases in rig-focused inspection context.

## Notes Relevance Matrix

1. `apps/vizij-authoring/docs/notes/pose-rig-two-layer-blend-vision-2026-02-11.md`: `active-reference`
   Use for target architecture semantics and acceptance intent.
2. `apps/vizij-authoring/docs/notes/runtime-chain-review-2026-02-11.md`: `historical-with-residual`
   Most critical findings are resolved; remaining value is context for aggregate semantics and boundary follow-up.
3. `apps/vizij-authoring/docs/notes/quori-smoke-findings-2026-02-11.md`: `mostly-resolved`
   Keep as smoke-test evidence; unresolved threads are now captured as P1 backlog items.
4. `apps/vizij-authoring/docs/notes/audit.md`: `historical`
   Architecture debt reference for P2 planning.
5. `apps/vizij-authoring/docs/notes/pose_report.md`: `historical`
   Earlier regression evidence, now superseded by current tracker/test status.
6. `apps/vizij-authoring/docs/notes/review.md`: `historical`
   Keep for chronology; do not treat as current task source without tracker confirmation.

## Execution Source of Truth

1. Concrete tasks and status: `apps/vizij-authoring/docs/plans/BACKLOG.md` and `apps/vizij-authoring/docs/plans/TRACKER.md`.
2. Priority positioning: `apps/vizij-authoring/docs/plans/ROADMAP_BACKLOG.md`.
3. Pose architecture implementation contract: `apps/vizij-authoring/docs/plans/P1_POSE_AUTHORING_CHAIN_SPEC.md`.
