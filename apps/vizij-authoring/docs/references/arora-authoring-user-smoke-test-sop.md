# Arora Authoring User Smoke Test SOP

Last updated: 2026-05-31
Status: `active`

## Purpose

Use this runbook to prove, from a user perspective, that the Arora-backed Vizij
authoring path is functional after the Arora integration work.

The primary proof surface is `vizij-authoring`, because it is the
runtime-truthful app for loading, editing, compiling, playing, exporting, and
reloading faces. The supplemental demo surfaces are useful only when a failure
needs to be isolated to animation, graph editing, or runtime consumption.

## What This Proves

This smoke test should show that:

1. A face bundle loads into the authoring app through the Arora web backend.
2. The main runtime renders and responds to direct input changes.
3. Existing animations still play.
4. UI-edited animations compile, register, execute, and export with the edited
   values.
5. UI-edited motion graphs compile, register, execute, and export with the
   edited values.
6. Reference-face and pose-copy workflows still work.
7. Pose config export/import still works.
8. Bundled GLB export and reload round-trip authored animation and program
   targets.
9. A downstream runtime consumer can load and play the exported bundle.

Out of scope for this runbook:

1. Studio exported fixture-pack validation.
2. Native desktop service execution.
3. Replacing the compatibility orchestrator path.

## Preconditions

Run from the Arora integration worktree. Replace `<workspace>` with the parent
directory where you checked out the three experiment repos:

```bash
cd <workspace>/vizij-web-vizij-engine-backend-experiment
```

Install dependencies if the workspace is fresh:

```bash
pnpm install
```

Make sure the browser Arora assets exist:

```bash
pnpm --filter vizij-authoring ensure:arora-web
```

If the engine or wasm modules changed, refresh rather than just ensure:

```bash
pnpm --filter vizij-authoring prepare:arora-web
```

The prepare script defaults to a sibling engine checkout named
`engine-vizij-backend-experiment`. If your engine checkout is somewhere else,
replace `/path/to/engine-vizij-backend-experiment` with that checkout path:

```bash
ARORA_ENGINE_PATH=/path/to/engine-vizij-backend-experiment pnpm --filter vizij-authoring prepare:arora-web
```

## Automated Confidence Gate

Before manual testing, run the checks that cover the critical Arora authoring
flows:

```bash
pnpm --filter vizij-authoring typecheck
pnpm --filter vizij-authoring test
pnpm --filter vizij-authoring test:e2e:arora
pnpm --filter vizij-authoring test:e2e:smoke
```

Expected result:

1. `test:e2e:arora` passes the Arora web composed execution workflows.
2. `test:e2e:smoke` passes the broader authoring smoke workflows.
3. Warnings about generated Rust wasm code, Three duplicate imports, chunk size,
   or color environment variables are acceptable if the tests pass.

## Launch The Authoring App

For local desktop testing:

```bash
NODE_ENV=development pnpm --filter vizij-authoring dev -- --host 127.0.0.1 --port 5173
```

Open:

```text
http://localhost:5173/?memoryInvestigation=1&memoryScope=main-runtime-only
```

For phone testing over Tailscale:

```bash
NODE_ENV=development pnpm --filter vizij-authoring dev -- --host 0.0.0.0 --port 5173
tailscale ip -4
```

Open this from the phone, replacing `<tailscale-ip>` with the printed address:

```text
http://<tailscale-ip>:5173/?memoryInvestigation=1&memoryScope=main-runtime-only
```

## Manual Smoke Checklist

### 1. Boot And Load A Face

1. Open the authoring app.
2. Load the built-in `Quori Latest` main preset.
3. Wait until the main face is visible.
4. Confirm the runtime status shows `Runtime: Idle`.
5. Open DevTools and confirm there are no red console errors.

Pass criteria:

1. The face renders, not a blank canvas.
2. The runtime reaches idle.
3. No fatal load, wasm, or Arora initialization errors appear.

### 2. Direct Inputs And Reset

1. Open the face/input controls area.
2. Move a few visible controls, such as blink, gaze, jaw, smile, or pose-weight
   sliders.
3. Confirm the rendered face changes in real time.
4. Click the main runtime reset inputs control.

Pass criteria:

1. User edits visibly affect the face.
2. Reset returns the face to the neutral or default state.
3. The runtime remains idle or returns to idle without errors.

### 3. Existing Animation Playback

1. Open the Animations area.
2. Select an existing animation, such as `Nonesense`.
3. Press play.
4. Let it run for a few seconds.
5. Pause or stop it.

Pass criteria:

1. Runtime status includes `Animation: Playing` while playback is active.
2. The face or canvas visibly changes during playback.
3. Stop returns the runtime to `Runtime: Idle`.

### 4. Animation Editing And Studio-Compatible Interpolation

1. In the Animations area, duplicate `Nonesense`.
2. Select the copied animation.
3. Open the animation editor and inspector.
4. Select the `gaze_left_right` track.
5. Change interpolation through the visible options:
   - `linear`
   - `step`
   - `cubic`
6. Leave the track on `step`.
7. Select a keyframe and change its value to `0.55`.
8. Wait for the compile status to show the animation compiled or registered.
9. Play the copied animation.

Pass criteria:

1. The keyframe UI reflects the edited value.
2. The animation compile target recovers to compiled or registered.
3. Playback visibly affects the face.
4. The runtime status includes `Animation: Playing`.

Current interpolation expectation:

1. The authoring inspector exposes `linear`, `step`, and `cubic`.
2. Cubic tangent data is preserved through the animation/export IR path.
3. There is not a separate Bezier interpolation mode in the current authoring
   app UI.

### 5. Motion Graph Editing And Program Playback

1. Switch to the procedural animation or programs authoring mode.
2. Select the `Live` program.
3. Confirm the motion graph panel is visible.
4. Press play and confirm the program runs.
5. Stop playback.
6. Edit a visible numeric node parameter. The automated proof edits the noise
   node `frequency` value to `0`.
7. Edit a visible port default value. The automated proof edits an `operand_1`
   default to `0.68`.
8. Wait for the motion graph compile target to show compiled.
9. Play the program again.

Pass criteria:

1. Runtime status includes `Program: Playing` while active.
2. The graph compile target recovers to compiled or registered.
3. The rendered face receives runtime writes after the graph edit.
4. Stop returns the runtime to `Runtime: Idle`.

### 6. Node Graph Palette And Input Editing

1. Keep the motion graph panel open.
2. Search the graph/palette controls for `blink`.
3. Add an input or node from the palette.
4. Confirm a node appears on the canvas.
5. Remove the added input or node.
6. Confirm the graph remains usable.

Pass criteria:

1. Palette search returns relevant graph/input entries.
2. Adding and removing does not break the editor.
3. The graph panel remains interactive.

### 7. Reference Face And Pose Copy

1. Switch to reference-face mode.
2. Load the built-in `Quori Basic` reference preset.
3. Wait for the reference face ready flag.
4. Open the Poses area.
5. Trigger copy from reference pose to main pose.
6. Confirm the pose copy mapping dialog opens.
7. Confirm it reports a matching main pose when one exists.
8. Use `Overwrite Pose` once.
9. Repeat the copy flow and choose `Cancel`.
10. Reset main runtime inputs.

Pass criteria:

1. The reference face loads and can be reset.
2. Copy opens a review dialog before writing.
3. Confirm writes only after approval.
4. Cancel closes without applying another write.
5. The main runtime remains ready afterward.

### 8. Pose Config Export And Import

1. Open File -> Export.
2. Open advanced export options.
3. Export the pose config JSON.
4. Import that pose config JSON back into the app.
5. Close the dialog and return to the Poses area.

Pass criteria:

1. A non-empty pose config JSON downloads.
2. Import succeeds without runtime errors.
3. The Poses area shows the imported or duplicated pose data.

### 9. Bundled GLB Export And Reload

1. Keep the edited animation and edited program in the session.
2. Open File -> Export.
3. Export the bundled GLB.
4. Reload that GLB through the main face file import.
5. Wait for the face to become ready again.
6. Confirm the copied animation still appears.
7. Play the copied animation.
8. Confirm the `Live` program, or the copied program, still appears.
9. Play the program.

Pass criteria:

1. The exported file is a `.glb`.
2. Reloading it produces a working face.
3. The copied animation survives reload and plays.
4. The program survives reload and plays.
5. Runtime status reaches `Runtime: Idle` after stopping playback.

### 10. Downstream Runtime Consumer Check

Use `demo-vizij-player` as the reference consumer for exported bundles.

Prepare and launch it:

```bash
pnpm --filter demo-vizij-player ensure:arora-web
NODE_ENV=development pnpm --filter demo-vizij-player dev -- --host 127.0.0.1 --port 5174
```

If the engine changed or the player assets are stale, refresh them first:

```bash
ARORA_ENGINE_PATH=/path/to/engine pnpm --filter demo-vizij-player prepare:arora-web
```

Open:

```text
http://localhost:5174/
```

Then:

1. Load the GLB exported from the authoring app.
2. Confirm diagnostics report the Arora web backend.
3. Play the exported animation.
4. Play the exported program.
5. Move generated face controls if available.

Pass criteria:

1. The exported bundle loads outside the authoring app.
2. The runtime consumer registers animations/programs through the Arora path.
3. Animation, program, and face-control interactions visibly affect the face.

## Supplemental Isolation Surfaces

Use these only when the authoring smoke test fails and the failure needs to be
isolated.

### Animation Isolation

```bash
NODE_ENV=development pnpm --filter demo-animation-studio dev -- --host 127.0.0.1 --port 5175
```

Check that animation presets load, transport controls work, seek/speed/loop
controls respond, and edited animation values change the output/event log.

### Graph Isolation

```bash
NODE_ENV=development pnpm --filter demo-graph-studio dev -- --host 127.0.0.1 --port 5176
```

Check that the graph palette, node canvas, inspector parameter edits, import,
export, and transport controls still work.

### Player Consumer Isolation

```bash
pnpm --filter demo-vizij-player test:e2e:arora
```

Use this when authoring export works but downstream runtime consumption is
unclear.

## Overall Pass Criteria

The Arora-backed authoring path is smoke-test clean when:

1. Automated Arora and smoke E2E tests pass.
2. A user can load a face, edit inputs, play an animation, edit an animation,
   edit a graph, play a program, use reference pose copy, export pose config,
   export GLB, reload GLB, and replay the authored assets.
3. The exported GLB also works in `demo-vizij-player`.
4. No user-facing workflow leaves the app blank, frozen, or stuck in an error
   status.
5. No red console errors appear during normal use.

## Failure Capture

If anything fails, capture:

1. Browser URL, including query string.
2. Exact face preset or imported file.
3. Workflow step that failed.
4. Screenshot or short recording.
5. Browser console errors.
6. Vite terminal output.
7. Whether these pass:

```bash
pnpm --filter vizij-authoring test:e2e:arora
pnpm --filter vizij-authoring test:e2e:smoke
```

The highest-value failure report says whether the automated proof still passes
and whether the failure reproduces after a full page reload.
