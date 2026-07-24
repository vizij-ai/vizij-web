# Vizij Authoring Goal

Last updated: 2026-03-01
Owner: Vizij Authoring

## Mission

Make `vizij-authoring` the authoritative, runtime-truthful authoring surface for rig, pose, and animation workflows.

## North Star Outcomes

1. Authored rig + pose state compiles into deterministic runtime-valid graphs.
2. Authored animation playback runs through the same runtime path used for final output.
3. Workspace layout and panel semantics stay clear and consistent for dense authoring sessions.
4. Import/export flows are deterministic and migration-safe across legacy and current assets.
5. Canonical sample assets (Quori, Toasty) and Vizij standard-rig mappings are validated.
6. The development branch stays continuously green (`typecheck`, `lint`, `test`).
7. Speech/viseme integration is designed as a clean extension path (provider-based, runtime-integrated).

## Current Program Objective

Hold engineering baseline health while executing wave-based animation/runtime integration and workspace clarity priorities.

Required gate:

1. `pnpm --filter vizij-authoring run typecheck` passes.
2. `pnpm --filter vizij-authoring run lint` passes.
3. `pnpm --filter vizij-authoring run test` passes, or any intentional quarantines are documented in `TRACKER.md` with explicit rationale.

## Success Criteria (Release-Level)

1. Variables, poses, and pose groups each support full per-item lifecycle editing.
2. Face/pose inspector values reflect authoritative runtime/propsrig state.
3. Locking is channel-level at the propsrig layer.
4. Runtime exposes rig inputs and pose-weight controls.
5. Import normalizes face naming and retargets invalid abstract-rig -> animatable links safely to propsrig links.
6. Pose definitions are reusable and can belong to multiple groups.

## Non-Goals (Current Stage)

1. Full visual redesign unrelated to authoring usability.
2. Broad runtime platform redesign outside authoring contract needs.
3. Work outside `vizij-authoring` unless required for contract compatibility.
