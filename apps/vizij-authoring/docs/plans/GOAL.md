# Vizij Authoring Goal

Last updated: 2026-02-18
Owner: Vizij Authoring

## Mission

Make `vizij-authoring` the authoritative, runtime-truthful authoring surface for rig and pose workflows.

## North Star Outcomes

1. Authored rig + pose state compiles into deterministic runtime-valid graphs.
2. Inspector workflows are complete enough that users can create/edit/delete and traverse chains without leaving context.
3. Import/export flows are deterministic and migration-safe across legacy and current assets.
4. The development branch stays continuously green (`typecheck`, `lint`, `test`).

## Current Program Objective

Restore and hold engineering baseline health before expanding new UX scope.

Required gate:

1. `pnpm --filter vizij-authoring run typecheck` passes.
2. `pnpm --filter vizij-authoring run lint` passes.
3. `pnpm --filter vizij-authoring run test` passes, or any intentional quarantines are documented in `TRACKER.md` with explicit rationale.

## Success Criteria (Release-Level)

1. Variables, poses, and pose groups each support full per-item lifecycle editing.
2. Face/pose inspector values reflect authoritative runtime/autorig state.
3. Locking is channel-level at the autorig layer.
4. Runtime exposes rig inputs and pose-weight controls.
5. Import normalizes face naming and retargets invalid abstract-rig -> animatable links safely to autorig links.
6. Pose definitions are reusable and can belong to multiple groups.

## Non-Goals (Current Stage)

1. Full visual redesign unrelated to authoring usability.
2. Broad runtime platform redesign outside authoring contract needs.
3. Work outside `vizij-authoring` unless required for contract compatibility.
