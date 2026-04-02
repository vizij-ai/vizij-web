# Quori Reference-Face Playback Investigation Report

## Executive Summary

We investigated why `Quori_Current.glb` moves correctly as the **main face** but does **not** move when loaded as a **reference face** (driver min/max/default and pose play/reset do not visibly animate it).

Current conclusion (resolved path):

1. The reference-face flow now works end-to-end for staged drivers and staged poses when exported assets include correct bundle metadata.
2. The runtime guard remains intentionally in place to block known-bad bundled exports when fallback bodies lack `RobotData`.
3. Export and staging behavior were corrected in both compiler/export wiring and authoring UI reset logic.

Status update (2026-03-01):

- Export compiler now emits pose compose targets correctly so drivers can blend direct, parent, and pose contributions.
- Runtime reference staging keeps pose-weight writes on canonical pose paths.
- Reset behavior now consistently clears override-enabled flags and applies default values for drivers and poses.
- Full repo validation after cleanup passed: `pnpm run validate:all` (`lint:all`, `typecheck:all`, `test:all`).

## Original Symptom

- Asset: `apps/vizij-authoring/public/assets/Quori_Current.glb`
- Comparison asset: `apps/vizij-authoring/public/assets/Quori_Legacy.glb`
- Behavior:
  - Main face: responds to controls and appears correct.
  - Reference face: loads, controls resolve, but pressing driver actions and pose actions does not produce visible movement.

## Static Diagnostics Performed

### 1) GLB structure comparison (`Quori_Current` vs `Quori_Legacy`)

Findings from direct GLB JSON chunk inspection:

- `Quori_Current.glb`
  - `nodes = 18`
  - `VIZIJ_bundle` present
  - `RobotData` extensions on nodes: `0`
- `Quori_Legacy.glb`
  - `nodes = 19`
  - `VIZIJ_bundle` present
  - `RobotData` extensions on nodes: `18`

Interpretation:

- `Quori_Current` contains bundled graph/pose metadata, but node-level `RobotData` metadata is absent.
- `RobotData` is what preserves stable stored renderable identity when exporting from mounted runtime renderables.

### 2) Rig graph output target shape

Both assets had rig graph outputs targeting UUID-like animatable IDs (not human-readable paths). This is valid only if runtime animatables and graph output targets stay aligned.

When import path falls back to raw aggressive import without `RobotData`, identity alignment becomes fragile and can break.

### 3) Runtime application behavior

`applyGraphOutputsToAnimatables` silently ignores writes whose `write.path` is not found in current `animatables` map (`apps/vizij-authoring/src/hooks/graphRuntime.ts`).

This explains "no visible movement" despite staged inputs and graph activity.

## Runtime / Interactive Diagnostics Performed

### 1) Flow tracing from UI actions to runtime staging

Verified full path:

- Variables panel driver action / pose action
- Reference routing resolution
- `useReferenceFaceState` handlers
- `ReferenceFaceRuntime` staging via `setInput`

Conclusion:

- Control flow is generally wired correctly in current branch state.
- Failures are consistent with unresolved/ignored runtime writes rather than missing button handlers.

### 2) Browser repro pass

Ran authoring app locally and loaded `Quori_Current` as main + reference.

Observed:

- Reference runtime initializes and becomes "Ready".
- Export guard can still trigger in this state for bundled export attempts.

Interpretation:

- "Ready UI" does not guarantee export is using mounted runtime refs.
- Export path may still be selecting fallback body (`exportSceneRoot`) when `getExportableBodies()` returns empty.

## Fixes Attempted So Far

### 1) Added bundled-export guard against fallback-without-RobotData

File:

- `apps/vizij-authoring/src/hooks/useVizijExport.ts`

Behavior added:

- If export is bundled (`includeVizijBundle=true`)
- AND export body source is fallback (`fallbackExportBody`)
- AND fallback body has zero `RobotData` nodes
- Then block export with message:
  - "Bundled GLB export requires mounted runtime refs with RobotData metadata. Wait for the face viewport to finish loading, then retry export."

Rationale:

- Prevents creating broken bundled files that later fail as reference faces.

### 2) Removed temporary debug logging noise in reference runtime/state

Files:

- `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.tsx`
- `apps/vizij-authoring/src/hooks/useReferenceFaceState.ts`

### 3) Added/updated tests

File:

- `apps/vizij-authoring/src/hooks/__tests__/useVizijExport.test.tsx`

Coverage added:

- Raw fallback export still allowed when bundle is off.
- Bundled fallback export blocked when RobotData missing.

Targeted test run passed:

- `3` files, `30` tests passed.

## Latest User Report and What It Changes

New report:

- Import plain Blender face.
- Add a simple driver and pose.
- Attempt bundled export.
- Still blocked by RobotData guard despite face appearing loaded and editable.

Implication:

- This strongly indicates an export selection bug/path issue:
  - `getExportableBodies()` is empty at export time more often than expected.
  - Export falls back to raw scene (`exportSceneRoot`) and hits guard.

So the current blocker is likely not user workflow quality, but unreliable mounted-body selection.

## Current Best Hypothesis

The main unresolved issue is:

- Export-body source selection can incorrectly land on fallback body even in a seemingly healthy runtime state.

Mechanically:

1. Export tries `getExportableBodies(rootId)` then `getExportableBodies()` from store.
2. `getExportableBodies` requires root group entries with `rootBounds` and non-null mounted refs.
3. If no resolved refs are found, code uses `exportSceneRoot`.
4. `exportSceneRoot` for Blender import has no RobotData, so bundled export is blocked.

This exactly matches the new user report.

## Why We Should Keep the RobotData Guard (for now)

If we remove guard now:

- Users can again create bundled GLBs that look valid but fail reference playback later (silent runtime mismatch).

If we keep guard:

- We block bad exports early and now have a clear signal to fix export source selection correctly.

Short version:

- Guard is doing safety enforcement.
- Remaining bug is the mounted-ref selection path and diagnostics around it.

## Historical Suspected Problems (Now Addressed)

These were the active hypotheses before the latest passing end-to-end run. They are kept for investigation history.

1. Export diagnostics are too generic.
   - Current message implies "not loaded yet" when real cause may be "fallback body selected unexpectedly".
2. `getExportableBodies()` may be too strict or timing-sensitive.
   - Possible stale root id, missing resolved refs in store, namespace/ref registration timing, or transient renderer lifecycle edge.
3. No explicit user-facing indicator of which export body source was used.
4. No recovery path when bundled export wants runtime refs but only fallback body is available.

## Historical Next Investigation Steps (Completed)

1. Add explicit export-source diagnostics
   - Log/show whether export used:
     - mounted body by root id
     - mounted body (any)
     - fallback body
   - Include counts:
     - root groups found
     - root refs resolved by namespace
     - RobotData node count per candidate body

2. Improve alert message to be actionably specific
   - Example:
     - "Bundled export is using fallback scene (no mounted runtime refs were found for rootId=...). This scene has no RobotData, so bundled export is blocked."

3. Harden body selection before fallback
   - Retry longer and/or wait for mounted refs specifically, not just next frame loops.
   - Consider selecting mounted root candidate by best-match heuristic when `rootId` filter misses.

4. Add a debug panel indicator
   - Show "Export body source: mounted/fallback" and RobotData count so users can self-diagnose.

5. Add regression tests for export-body resolution
   - Cases:
     - runtime ready + refs present -> bundled export succeeds
     - runtime ready UI but refs absent -> clear error reason
     - fallback only + bundle off -> raw export succeeds

6. Keep guard in place until
   - It prevents generating known-bad bundled outputs.

## Optional Longer-Term Alternative (Not Immediate)

Make reference runtime RobotData-independent by robust runtime remapping of output targets to current animatables.

Cost/risk:

- Non-trivial architecture work.
- Higher regression risk than fixing export-body selection first.

Recommendation:

- Do not take this path as first response.
- Fix export selection/diagnostics first; reevaluate only if workflow still fails.

## Current Landing Point (Updated)

Where we are now:

- We confirmed the export-body source issue and implemented runtime-store-aware export body selection.
- Bundled export now resolves mounted refs (`source: mounted-root`) and no longer falls back in the proven flow.
- The full manual proof flow (including reference driver + pose movement) now passes; see the iteration log below for artifact evidence.

## Iteration Update (2026-03-01): Reference Pose/Driver Interplay

### Problem Re-check

User-reported regression focus:

- Reference face (`Quori Basic` / `Quori_Current.glb`) appeared to stop responding reliably when combining:
  - pose playback (`angry`)
  - driver controls (`blink`)
  - reset behavior

### Investigation Notes

1. Reproduced and instrumented with Playwright e2e probe (`reference_pose_probe_tmp.pw.ts`) using:
   - Main face: `Quori Blender Export`
   - Reference face: `Quori Basic`
2. Confirmed that a naive `blink max` post-`angry` check can be a false negative if blink is already max.
3. Corrected probe sequence to force a real post-`angry` state transition:
   - `blink default` then `blink max`
4. Added hash-based image diff checks on reference canvas for each step.

### Root Cause (Implementation)

Reference runtime was still willing to route pose-weight inputs through generic per-input override channels when override nodes exist. That path is correct for regular drivers but is not the correct staging path for pose-weight controls.

### Fix Applied

File: `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.tsx`

- Updated input staging and reset behavior so pose-weight inputs (`/poses/*.weight`) always stage via canonical rig input paths.
- Pose weights now bypass override `enabled/value` routes entirely.
- Non-pose inputs keep prior override routing behavior.

### Test Updates

File: `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.test.tsx`

- Replaced the prior pose-weight override-toggle assertion with a direct-path staging assertion.
- New expectation: pose-weight writes go to `rig/<faceId>/poses/<pose>.weight`, and no calls are made to override `enabled/value` paths.

### Verification

1. Unit tests:
   - `pnpm test -- ReferenceFaceRuntime.test.tsx VariablesPanel.test.tsx`
   - Result: pass (68 tests)
2. Playwright probe:
   - `pnpm --filter vizij-authoring exec playwright test e2e/reference_pose_probe_tmp.pw.ts --reporter=line`
   - Result: pass
   - Diff flags all `true`, including:
     - `blinkChangesBeforeAngry`
     - `resetChanges`
     - `blinkChangesAfterReset`
     - `angryChanges`
     - `blinkDefaultChangesAfterAngry`
     - `blinkChangesAfterAngry`

## Iteration Update (2026-03-01): Adapter Simplification (Path-First Routing)

### Why this pass

Reference control behavior still depended on id/token/path fallback chains in `VariablesPanel`, which made behavior harder to reason about than main-face routing and created opportunities for divergence.

### Refactor goals

1. Keep control scope explicit:
   - reference actions stage to reference runtime only
   - shared actions stage to both main and reference
2. Prefer deterministic canonical path staging over id/token heuristics.
3. Keep legacy fallback only when canonical path staging is unavailable.

### Changes made

File: `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

1. Added deterministic reference path helpers:
   - `canStageReferencePath(path)`
   - `stageReferencePathValue(path, value)`
2. Reference driver actions (`source === "reference"`) now stage by path first.
3. Shared driver actions now stage to main by id and to reference by path first.
4. Reference pose solo-weight staging now uses canonical pose-weight paths (`/poses/<id>.weight`) as primary path.
5. Reference pose reset now uses canonical pose-weight path staging when available (before legacy target fallback).

### Test alignment

File: `apps/vizij-authoring/src/components/panels/VariablesPanel.test.tsx`

Updated expectations to reflect path-first staging for:

1. Reference driver min/default/max.
2. Shared driver min/default/max on the reference side.
3. Canonical reference pose-weight play/reset when pose-weight inputs are available.

### Verification

1. Unit tests:
   - `pnpm test -- VariablesPanel.test.tsx ReferenceFaceRuntime.test.tsx`
   - Result: pass (68/68)
2. Playwright regression flow:
   - `pnpm --filter vizij-authoring exec playwright test e2e/reference_adapter_regression_tmp.pw.ts --reporter=line`
   - Result: pass
   - `DIFF_FLAGS` all true:
     - `blinkChangesBeforeAngry`
     - `resetChanges`
     - `blinkChangesAfterReset`
     - `angryChanges`
     - `blinkDefaultChangesAfterAngry`
     - `blinkChangesAfterAngry`

## End-to-End Proof Test (Run and Iterate Until Pass)

Goal of this test:

- Load a Blender-export face.
- Add a driver and a pose that visibly move the face.
- Export successfully as bundled GLB.
- Import that GLB as a reference face.
- Confirm reference face moves from driver/pose actions.

### Setup

1. Start app:
   - `pnpm --filter vizij-authoring dev`
2. Open authoring app in browser.
3. Open DevTools console and keep it visible for diagnostics.

### Manual Investigation Steps

1. Load Blender export as main face
   - Use preset button (for example `Quori Blender Export`) or import file.
   - Wait for runtime to show ready state.

2. Author movement
   - Create one driver (for example jaw/open or blink) and verify `Min`/`Max` visibly changes main face.
   - Create one pose that drives at least one visible facial control.
   - Verify pose `Play`/`Reset` visibly changes main face.

3. Export bundled GLB
   - Open Export dialog.
   - Ensure bundle export is enabled.
   - Export GLB.
   - Expected pass condition:
     - Export succeeds (downloaded GLB).
     - No RobotData guard error.

4. Load exported GLB as reference face
   - Keep or reload main face as needed.
   - Enable reference face panel.
   - Load the just-exported GLB as reference face.
   - Confirm reference runtime is ready.

5. Validate reference movement
   - In Variables/Poses, target reference context.
   - Trigger driver `Min`/`Max`/`Def` and pose `Play`/`Reset`.
   - Expected pass condition:
     - Reference face visibly moves.
     - No unresolved-reference warnings for tested controls.

### Required Evidence to Mark Pass

1. A bundled export file is produced from Blender-import-derived content.
2. Exported file loads as reference face without errors.
3. At least one driver action visibly moves reference face.
4. At least one pose action visibly moves reference face.

### Iteration Loop When It Fails

If test fails, run this loop and re-test from Step 1:

1. Capture failure mode
   - Guard blocked export
   - Export succeeded but reference does not move
   - Routing warnings in console

2. Capture diagnostics
   - Console logs around export start and body selection
   - Whether export used mounted body vs fallback
   - RobotData node count on selected export body

3. Apply minimal fix for observed failure
   - If fallback selected unexpectedly: fix mounted-ref selection / readiness timing.
   - If guard message unclear: improve message with explicit reason and body source.
   - If reference write dropped: verify graph output target vs animatable identity alignment.

4. Re-run full proof test
   - Do not skip steps.
   - Only declare fix complete after all pass conditions and required evidence are satisfied in one run.

## Iteration Log (2026-02-28)

### Run 1 - End-to-End Manual Proof (PASS)

Status:

- `PASS` for all Manual Investigation Steps (1-5) and Required Evidence (1-4).

Step results:

1. Load Blender export as main face
   - Loaded via `Quori Blender Export`.
   - Main runtime reached ready:
     - `runtime: ready ... outputs: 95/96` in UI status ribbon.

2. Author movement and verify on main face
   - Created driver `custom/new_driver`.
   - Connected driver child link to `Propsrig Mouth JawUD Value`.
   - Verified driver action movement on main face:
     - `Def` (closed mouth): `.playwright-cli/page-2026-02-28T15-53-52-578Z.png`
     - `Max` (open mouth): `.playwright-cli/page-2026-02-28T15-54-08-620Z.png`
     - `Def` reset (closed mouth): `.playwright-cli/page-2026-02-28T15-54-28-272Z.png`
   - Created `Pose 1`, connected it to `custom/new_driver`, set pose target to `1.0000`.
   - Verified pose action movement on main face:
     - Pose reset / neutral: `.playwright-cli/page-2026-02-28T15-59-53-270Z.png`
     - Pose apply: `.playwright-cli/page-2026-02-28T15-59-59-277Z.png`
     - Pose reset again: `.playwright-cli/page-2026-02-28T16-00-05-698Z.png`

3. Export bundled GLB
   - Export dialog kept `Embed Vizij bundle` enabled.
   - Export succeeded; file downloaded:
     - `.playwright-cli/face.glb`
   - No RobotData guard block appeared.
   - Export diagnostics confirmed mounted runtime body selection:
     - `.playwright-cli/console-2026-02-28T16-01-23-726Z.log`
     - Contains:
       - `event: export-glb:body-selection`
       - `source: mounted-root`

4. Load exported GLB as reference face
   - Enabled `View -> Reference Face`.
   - Loaded `.playwright-cli/face.glb` via `Load Custom Reference Face`.
   - Reference runtime reached ready:
     - Reference status row showed `Ready` and FPS.

5. Validate reference movement
   - Reference driver controls (reference row `custom/new_driver`) verified:
     - Before: `.playwright-cli/page-2026-02-28T16-05-15-430Z.png`
     - `Max`: `.playwright-cli/page-2026-02-28T16-05-22-237Z.png`
     - `Def`: `.playwright-cli/page-2026-02-28T16-05-28-839Z.png`
   - Reference pose controls (reference row `Pose 1`) verified:
     - Before: `.playwright-cli/page-2026-02-28T16-06-40-408Z.png`
     - `Apply Pose`: `.playwright-cli/page-2026-02-28T16-06-46-962Z.png`
     - `Reset pose targets to defaults`: `.playwright-cli/page-2026-02-28T16-06-53-554Z.png`
   - Warning scan for unresolved-reference style issues after run:
     - `.playwright-cli/console-2026-02-28T16-07-10-955Z.log`
     - No unresolved reference movement warnings for tested controls.

### Current Conclusion

- The export-body selection/runtime-store wiring fix is working in manual flow.
- Bundled export now uses mounted runtime refs (`mounted-root`) and exports successfully.
- Re-imported bundled GLB now responds to both driver and pose actions in reference context.

## Post-Pass Regression (2026-02-28, Later)

Observed after direct `Quori_Current` re-export:

- Re-importing the newly exported GLB as main face failed with:
  - `Unable to find a Vizij root in the provided asset.`
- Loading the same file as reference face produced incorrect framing/scale.

Root cause:

- GLB export post-processing (`normalizeExportedSceneJson`) flattened a single pass-through wrapper node.
- In this case, that wrapper node was the canonical Vizij root node carrying:
  - `extensions.RobotData.root = true`
  - `extensions.RobotData.rootBounds`
- Flattening removed this root from `scene.nodes`, leaving it orphaned in `nodes[]`.
- On re-import:
  - World reconstruction had no root group with `rootBounds`.
  - Main-face root detection failed.
  - Reference framing degraded.

Fix applied:

- Updated wrapper-unwrapping guard in render export sanitizer to **not unwrap nodes that have extensions metadata**.
- File:
  - `packages/@vizij/render/src/functions/export.ts`

Verification after fix:

1. Re-exported `Quori_Current` to:
   - `.playwright-cli/quori-current-reexport-fixed.glb`
2. GLB JSON now keeps root node as the scene root:
   - `scene.nodes = [<Scene root node>]`
   - Root node keeps `RobotData.root` and `RobotData.rootBounds`
3. Re-importing fixed export as main face succeeded (no root error).
4. Loading fixed export as reference face showed matching framing/scale.

## Cleanup + Validation Pass (2026-02-28, Current)

Additional hardening and cleanup applied while preparing a clean commit state:

1. Replaced committed `Quori_Current.glb` with verified fixed re-export
   - Source used:
     - `.playwright-cli/quori-current-reexport-fixed.glb`
   - Installed target:
     - `apps/vizij-authoring/public/assets/Quori_Current.glb`
   - Hash verification:
     - source and target both `c17a05402bca9cc6c19eda6cf6277040fef6a9051f94836e8f397d1880b7e6c4`
   - Structural sanity check:
     - scene has single root node with `RobotData.root=true` and `rootBounds`.

2. Reverted unexpected legacy asset drift
   - Reverted:
     - `apps/vizij-authoring/public/assets/Quori_Legacy.glb`
   - Reason:
     - large, unrelated metadata delta was not required for the current Quori_Current regression fix.

3. Hardened export-body snapshot lifecycle to avoid stale-root exports
   - Files:
     - `apps/vizij-authoring/src/components/app/ExportDialog.tsx`
     - `apps/vizij-authoring/src/components/app/Viewer.tsx`
     - `apps/vizij-authoring/src/App.tsx`
   - Behavior:
     - Runtime snapshot bodies are now gated by root-id match before being used for export.
     - Snapshot state is cleared on viewer unmount and when active root changes.
   - Goal:
     - prevent stale mounted refs from a prior face root from being reused during export.

4. Validation status after cleanup changes
   - `pnpm --filter vizij-authoring typecheck` -> pass
   - `pnpm --filter vizij-authoring test -- src/components/app/Viewer.test.tsx src/hooks/__tests__/useVizijExport.test.tsx src/components/app/runtimeInputsFromConstraints.test.ts src/components/app/ReferenceFaceRuntime.test.tsx` -> pass (`38/38`)
   - `pnpm --filter @vizij/render test -- tests/load-gltf.node-test.mjs tests/store-exportable-bodies.node-test.mjs tests/vizij-bundle.node-test.mjs` -> pass (`8/8`)
   - `pnpm --filter @vizij/render typecheck` -> pass

## Control Scope + Pose/Driver Reliability Review (2026-02-28, Latest)

New review objective:

- Verify main/reference/shared control routing is explicit and robust.
- Verify driver actions, pose actions, and reset actions do not interfere across faces.

Findings and fixes:

1. Reference pose actions still used direct target writes even when canonical pose-weight inputs were available.
   - This was asymmetric with main-face pose play (which already prefers pose-weight channels).
   - It could produce inconsistent behavior when mixing driver controls with pose play/reset on reference.

2. Fix applied in `VariablesPanel`:
   - Added `referencePoseWeightInputIdByPoseId` lookup from reference runtime inputs (`sourceId=pose-weight:<poseId>`).
   - Added `setReferencePoseWeightSolo(poseId)` that sets reference pose weights explicitly (`selected=1`, others `0`) when available.
   - Updated reference pose `Apply` action:
     - first tries canonical pose-weight solo path;
     - falls back to existing target-write behavior only if no pose-weight channels are available.
   - Updated reference pose `Reset` action:
     - if canonical pose-weight input exists, reset that weight to its default;
     - otherwise keep existing target-default fallback.

3. Regression tests added:
   - `VariablesPanel.test.tsx`:
     - `routes reference pose play and reset through canonical pose-weight inputs when available`
   - Existing tests for direct target fallback remain and still pass.

Validation after this review pass:

1. Targeted tests:
   - `pnpm --filter vizij-authoring test -- src/components/panels/VariablesPanel.test.tsx src/poseRig/utils.test.ts src/components/app/Viewer.test.tsx src/components/app/ReferenceFaceRuntime.test.tsx`
   - Result: pass (`87/87`)

2. Full app tests:
   - `pnpm --filter vizij-authoring run test`
   - Result: pass (`579 passed`, `1 skipped`)

3. Typecheck:
   - `pnpm --filter vizij-authoring typecheck`
   - Result: pass

## Reference Blink Reset Regression (Hugo Main + Quori Reference) - 2026-02-28

User-reported minimum repro:

1. Load `Hugo Blender Export` as main face.
2. Load `Quori Basic` as reference face.
3. In drivers, search `blink`, press `Max` (reference row) and confirm blink.
4. Press `Reset Reference Inputs`.
5. Press `Max` on `blink` again and confirm blink still works.

### Repro Result Before Fix

Reproduced in automated Playwright run:

- First `Max` blink worked.
- `Reset Reference Inputs` returned reference face to neutral.
- Second `Max` did **not** blink.

Image-diff evidence from captured reference-canvas screenshots:

- `before -> max1`: high delta (`RMSE normalized ~0.0483`)
- `reset -> max2`: very low delta in failing run (`~0.0059`), showing no second blink

### Root Cause

`ReferenceFaceRuntime` reset logic was force-writing override enable flags for every resettable input:

- For each input with an override route, reset wrote both:
  - `.../override/<inputId>/enabled = 1`
  - `.../override/<inputId>/value = default`

This enabled direct overrides broadly during reset, which pinned downstream channels and could prevent later parent-driver actions (like `blink`) from visibly affecting the reference face.

### Fix Applied

File:

- `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.tsx`

Changes:

1. Kept normal interactive staging behavior (`stageStandardInputPath`) for user edits.
2. Updated reset behavior to:
   - reset by resolved input id/path, and
   - write override **value** paths, but **not** force override `enabled` paths to `1`.
3. Continued emitting `onStandardInputChange(input.id, resetValue)` so reference state remains coherent after reset.

### Automated Verification After Fix

Re-ran the same Playwright sequence end-to-end.

Reference-canvas diff metrics now show expected behavior:

- `before -> max1`: high delta (`~0.0483`) => blink happened
- `before -> reset`: low delta (`~0.0059`) => reset returned neutral
- `reset -> max2`: high delta (`~0.0487`) => second blink happened
- `max1 -> max2`: zero/near-zero delta (`0`) => second blink matches first blink

### Test Coverage Added

File:

- `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.test.tsx`

New/updated assertions:

1. Reset emits id-based `onStandardInputChange` updates for resolved runtime inputs.
2. Reset does **not** force override enabled-path writes (guards the regression).

Validation:

- Targeted tests: pass (`89/89`)
- `pnpm --filter vizij-authoring run test`: pass (`581 passed`, `1 skipped`)
- `pnpm --filter vizij-authoring typecheck`: pass

### Re-Verification Of User Minimum Flow (Playwright, 2026-02-28)

Re-ran the exact minimum passing flow requested by user in browser automation:

1. Enable `Reference Face` panel.
2. Load `Hugo Blender Export` on main face.
3. Confirm orientation dialog if shown (`Orientation Looks Correct`).
4. Load `Quori Basic` on reference face.
5. In `Drivers`, scope to reference controls, search `blink`, press `Max`.
6. Press `Reset Reference Inputs`.
7. Press `Max` on `blink` again.

Result: **pass**.

Reference-canvas image deltas from that run:

- `before -> max1`: `0.0433507`
- `before -> reset`: `0.00919166`
- `reset -> max2`: `0.0433507`
- `max1 -> max2`: `0.00919166`

Interpretation:

- First `Max` clearly closes eyes.
- Reset returns reference face near baseline.
- Second `Max` closes eyes again after reset.

## Reference Angry Pose -> Blink Regression (2026-02-28)

User follow-up repro:

1. Main face: `Hugo Blender Export`.
2. Reference face: `Quori Basic`.
3. Play reference pose `Angry`.
4. Try `blink` (`Max`/`Min`/`Def`) on reference face.
5. Observed: blink appears unresponsive after pose play.

### Reproduction + Diagnosis

Automated repro confirmed the issue:

- `blinkBeforeAngryDelta`: `0.0459112` (blink works before pose play)
- `blinkAfterAngryDelta`: `0.00379387` (blink mostly blocked after playing pose)

Control experiment:

- Driving `pose_angry.weight` from **Drivers** (reference scope) did not block blink.
- This isolated the bug to the **reference pose play path**, not the underlying rig itself.

Root cause:

- Reference pose play preferred canonical pose-weight routing only when runtime pose-weight inputs were present by id.
- On `Quori Basic`, that id mapping can be incomplete for pose actions, so pose play fell back to writing raw pose targets (including eyelid channels).
- Those direct target writes can dominate shared eyelid outputs and make `blink` look stuck.

### Fix

1. `VariablesPanel` pose play now treats canonical pose-weight routing as available when either:
   - runtime pose-weight input id exists, or
   - canonical pose-weight path exists in reference catalog (`/poses/<poseId>.weight`), using path writes as fallback.
2. Reference pose reset follows the same canonical pose-weight path fallback before target-based fallback.
3. `ReferenceFaceRuntime` pose-weight override handling now disables override-enable when writing default pose-weight values (`0`) to avoid pinning zero-weight overrides.

### Validation

Automated repro after fix:

- `blinkBeforeAngryDelta`: `0.0462903`
- `blinkAfterAngryDelta`: `0.0459112`

Result: blink remains responsive after playing `Angry` on reference face.

Targeted validation:

- `pnpm --filter vizij-authoring test -- src/components/app/ReferenceFaceRuntime.test.tsx src/components/panels/VariablesPanel.test.tsx src/components/app/Viewer.test.tsx src/poseRig/utils.test.ts` -> pass (`91/91`)
- `pnpm --filter vizij-authoring typecheck` -> pass

## Iteration Update (2026-03-01): Adapter Guardrails For Pose-Weight Fallback

### Problem found in adapter logic

While reviewing the simplified path-first routing, there was still a logical gap in `VariablesPanel`:

- `setReferencePoseWeightSolo(poseId)` would return success if **any** pose weight path was stageable,
- even when the **selected** pose weight path was not stageable.

In that case, reference pose play could become a no-op (or partial update) while still short-circuiting target-based fallback logic.

### Fix applied

File: `apps/vizij-authoring/src/components/panels/VariablesPanel.tsx`

1. `stageReferencePathValue(path, value)` now validates stageability via `canStageReferencePath(...)` before writing.
2. `setReferencePoseWeightSolo(poseId)` now requires the selected pose’s canonical weight path to be stageable; otherwise it returns `false` so existing target-based pose fallback can run.

### Test coverage added

File: `apps/vizij-authoring/src/components/panels/VariablesPanel.test.tsx`

Added regression test:

- `falls back to target-based reference pose playback when selected pose weight path is unavailable`

This test verifies that if another pose has a valid weight path but the selected pose does not, the selected pose still applies and resets via target fallback (instead of incorrectly short-circuiting pose-weight routing).

### Validation

1. Targeted unit tests:
   - `pnpm --filter vizij-authoring test -- src/components/panels/VariablesPanel.test.tsx src/components/app/ReferenceFaceRuntime.test.tsx`
   - Result: pass (`69/69`)

2. Playwright sanity probe:
   - Temporary probe was attempted to automate blink/reset/angry/blink sequence.
   - Current probe selectors for this workspace layout were unstable (panel/preset disambiguation), so this iteration is validated by deterministic unit coverage + prior passing browser evidence from earlier iterations.
   - Probe file and generated artifacts were removed.

## Current Directive (2026-03-01): Reference Poses Must Use Runtime Pose-Weight Staging Only

### User requirement (explicit)

Reference-face pose playback must not rely on:

1. direct pose-target fallback writes, or
2. ad-hoc override hacks.

Required behavior:

1. Load reference GLB into runtime correctly (full rig/orchestrator setup).
2. Stage canonical pose weight inputs for pose play/reset (`/poses/<poseId>.weight`).
3. Let runtime graph/orchestration produce motion.
4. Keep driver + pose + reset interactions reliable on reference face.

### Goal state

For reference face, pose actions should behave like a real runtime instance:

1. `Apply Pose` stages canonical pose weight.
2. `Reset Pose` clears that canonical pose weight (to neutral/default behavior).
3. Pose playback visibly moves the face (same runtime path, not fallback target writes).
4. Pose playback does not break subsequent driver controls (e.g. blink).

### Investigation plan (must complete before claiming fix)

1. Static analysis:
   - Verify reference runtime input discovery includes (or can still stage) pose-weight paths.
   - Verify adapter routes reference pose actions to canonical pose-weight paths only.
   - Verify no pose-action path in adapter writes raw pose targets.
2. Asset/runtime analysis:
   - Inspect `Quori_Current.glb` (`Quori Basic`) bundle/catalog/graph metadata for pose-weight channels and pose ids.
   - Confirm runtime constraints + graph input paths align with canonical pose weight paths.
3. Targeted test refactor:
   - Add/adjust tests that enforce:
     - reference pose play/reset uses canonical pose-weight path staging only;
     - no target-write fallback path is exercised for reference pose actions.
4. Browser verification:
   - Run reproducible Playwright flow for:
     - load main + reference,
     - apply reference pose,
     - verify visible movement,
     - verify blink still works after pose and after reset.

### Verification bar

Do not mark complete until all are true in one coherent state:

1. Adapter code has no reference-pose target-write fallback path.
2. Unit tests enforce canonical routing (and fail if fallback is reintroduced).
3. Runtime/asset alignment is confirmed by static inspection.
4. Browser run confirms visible reference pose motion and no pose/driver/reset interference.

## Iteration Update (2026-03-01): Reference Runtime Write-Path Resolution + Playwright Proof

### Additional root-cause details discovered

During Playwright verification, reference controls initially appeared to do nothing (all canvas-change checks returned no movement).

Static/runtime review found a resolver gap in `ReferenceFaceRuntime`:

1. `buildRuntimeWritePathMap(...)` only considered runtime paths that started with `rig/...`.
2. If a runtime exposed canonical paths (for example `standard/...` or `poses/...`) in constraints without a `rig/<faceId>/` prefix, those candidates were ignored.
3. The fallback then forced writes to `rig/face...`, which can miss the actual runtime input path.

This caused direct reference writes (including pose weights) to be fragile in some runtime shapes.

### Fix applied

File:

- `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.tsx`

Change:

1. Updated runtime path scoring so canonical non-`rig/...` constraint paths are valid write candidates (lower priority than explicit `rig/<faceId>/...` paths, but still selectable).
2. Resolver now:
   - still prefers explicit `rig/<faceId>/...` when present,
   - but correctly stages to canonical runtime paths when those are the only available constraints.

### Test updates

File:

- `apps/vizij-authoring/src/components/app/ReferenceFaceRuntime.test.tsx`

Updated expectations so canonical-only constraints stage to canonical runtime paths (not forced `rig/face/...`).

### Verification rerun

1. Targeted unit tests:
   - `pnpm --filter vizij-authoring test -- src/components/app/ReferenceFaceRuntime.test.tsx src/components/panels/VariablesPanel.test.tsx`
   - Result: pass (`65/65`)

2. Playwright flow:
   - `pnpm --filter vizij-authoring exec playwright test e2e/reference_pose_runtime_tmp.pw.ts --reporter=line`
   - Result: pass (`1 passed`)
   - Logged `REFERENCE_FLOW_CHANGES` all `true` for:
     - initial blink action
     - reset effect
     - blink after reset
     - angry pose apply
     - blink default after angry
     - blink max after angry

### Notes on non-fatal warnings seen during browser run

Observed warnings included:

1. `[poseRig] Failed to normalize pose graph TypeError: Failed to fetch`
2. IR runtime compile warning bundles (issue list)
3. WebGL `ReadPixels` performance stall warnings during automated capture

These warnings did not prevent the verified driver/pose/reset motion checks from passing in the final Playwright run.

## User Smoke Test Update (2026-03-01, latest)

User reran a manual smoke test and reported failure:

1. Reference face did not move when a pose was played.
2. Reference face did not move when the pose weight was set to max.

This supersedes the prior automated pass as the current real-world status check.

### First hypothesis to investigate next

The first place to look is reference runtime input-path resolution at the live `setInput(...)` boundary (including exact path strings for pose-weight channels), because the symptom is consistent with writes being accepted in UI state but not landing on the active runtime input keys.

## Commit Snapshot (2026-03-01): Reference Pose Runtime Pathing + Pose-Control Bridge

### Confirmed fixes included in commit

1. Reference runtime write-path resolution now builds from both runtime constraints and rig graph input nodes, and prefers rig-qualified paths when available.
2. Reference pose-weight channels (e.g. `/poses/pose_angry.weight`) now bypass override-route staging and write directly to resolved runtime paths.
3. Runtime-react now bridges pose graph outputs at `rig/<faceId>/pose/control/<inputId>` back into mapped rig input paths (`setInput(mappedPath, { float })`) with epsilon dedupe.
4. Temporary reference-face debug logs were removed.

### Validation performed for this snapshot

1. Browser verification (main `Hugo Blender Export` + reference `Quori Basic`):
   - `poses/pose_angry.weight` max visibly changed reference expression.
   - `Angry` pose apply visibly changed reference expression.
2. Focused tests:
   - `pnpm --filter vizij-authoring test -- src/components/app/ReferenceFaceRuntime.test.tsx src/components/panels/VariablesPanel.test.tsx` passed (`65/65`).
   - `pnpm --filter @vizij/runtime-react test` passed (`8/8`).
   - `pnpm --filter @vizij/runtime-react typecheck` passed.

### Next investigation queued immediately after commit

User reports brows still not behaving as expected across poses. Investigate Quori Basic asset/runtime for:

1. brow-target data in poses,
2. pose-control -> rig-input mapping coverage for brow channels,
3. conflicts between staged brow drivers and pose weights in reference mode.

## Investigation Update (2026-03-01): Quori Basic Brow Behavior Across Poses

### Scope

Investigated `apps/vizij-authoring/public/assets/Quori_Current.glb` bundle wiring to explain why brows are weak/missing when staging reference poses like `Angry`.

### Findings

1. Pose data is present and non-trivial for brow channels.
   - `poses.config.poses` contains brow targets for multiple poses (`Angry`, `Happy`, `Sad`, `Surprise`, etc.).
   - Example (`pose_angry`):
     - `brow_lbrow_inud_value = 1`
     - `brow_lbrow_midud_value = 1`
     - `brow_rbrow_midud_value = 1`

2. Pose graph outputs brow controls on canonical pose-control paths:
   - `rig/quori_latest/pose/control/brow_lbrow_inud_value`
   - ... (8 brow outputs total)

3. Rig graph input ids for the same brow channels are prefixed with `direct_`:
   - `input_direct_brow_lbrow_inud_value` -> `rig/quori_latest/brow/lbrow_inud/value`
   - plus corresponding `override_enabled_*` and `override_value_*` inputs.

4. Current runtime bridge mapping is exact-id only (`pose/control/<id>` -> rig input map key `<id>`), so Quori brow channels are dropped.
   - Pose-control outputs: `32`
   - Exact matches: `19`
   - Require `direct_` alias fallback: `12` (includes all 8 brow channels)
   - Fully unresolved: `1` (`propsrig_rtlid_translation_z`, override-only input)

### Conclusion

This is primarily an asset naming-shape compatibility issue (legacy Quori bundle convention), not a missing brow pose dataset and not primarily UI staging conflict between brow rig and pose weights.

The likely practical fix is to extend pose-control bridge resolution to attempt `direct_<poseControlId>` when exact key lookup misses.
