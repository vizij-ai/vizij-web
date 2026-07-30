# Feature Inventory — refreshed for the workshop

_A workshop-usable restatement of `FEATURE_INVENTORY.md` from PR #65 (dated
2026-07-15), corrected against `main` @ `418d7f2f` and re-organized **by lifecycle
stage** rather than by code area — because the workshop is about workflow, not about
file layout._

The original 19-area, code-anchored inventory is still the reference for
_implementation_ questions. It lives at
`apps/vizij-authoring/docs/FEATURE_INVENTORY.md` on branch
`sbeleidy/vizij-authoring-features-inventory-4d4be1` (PR #65). **Read that one when
you need file paths. Read this one when you need to reason about the product.**

Maturity key: **● solid** · **◐ works, rough edges** · **○ stub / gap** ·
**△ in flight**

---

## DEFINE — "What can this face do?"

| Feature                                        | Maturity | Notes                                                                                                                                                                           |
| ---------------------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GLB / glTF import                              |    ●     | Main asset load; high-poly GLBs from Vizij or any DCC                                                                                                                           |
| "Import (Skip Checks)" variant                 |    ◐     | Bypasses discrepancy validation — an escape hatch that hides problems                                                                                                           |
| Preset faces                                   |    ●     | Quori and Toasty (Blender-Export / Current / Extended variants); Hugo GLBs also shipped                                                                                         |
| Weighted multi-phase load progress             |    ●     | load-asset → validate-root → bundle-sync → rig-import-normalization → pose-graph-bootstrap → runtime-stabilization                                                              |
| Orientation confirmation dialog                |    ◐     | Quarter-turn root-rotation correction on import                                                                                                                                 |
| Import discrepancy wizard                      |    ◐     | Reconciles imported data vs. rebuilt rig, with semantic-risk guidance. One of **four** separate validation surfaces                                                             |
| Rig-graph JSON import                          |    ●     | Optional `.graph.json` alongside the GLB                                                                                                                                        |
| Pose graph / config / IR import + remap wizard |    ◐     | Remap wizard maps imported pose-graph inputs onto the current rig                                                                                                               |
| Reference-face import                          |    ●     | Load a second GLB side-by-side to compare and retarget; own runtime instance                                                                                                    |
| Hierarchy / Face Elements panel                |    ●     | Tree, viewport-synced selection, filter, duplicate/move/delete, smart transform locks, selection glow                                                                           |
| Scene-composer hierarchy                       |    ●     | Searchable tree, expand/collapse, reparenting                                                                                                                                   |
| Inspector — scene object mode                  |    ●     | Position / Rotation / Scale rows                                                                                                                                                |
| Inspector — material mode                      |    ◐     | Color picker, opacity, label, create/assign. **VIZ-68**: import/export broken                                                                                                   |
| Inspector — morph targets                      |    ●     | Per-target rows, lock/unlock all                                                                                                                                                |
| Inspector — rig driver mode                    |    ●     | Value slider + numeric field, Min/Def/Max, range, driver path, degrees/radians, lock, rename, delete                                                                            |
| Links & formulas (binding editor)              |    ◐     | Parent/child driver links, expressions with arithmetic + comparison/boolean ops, pipeline stages, connections graph, legacy-binding migration. Deep, powerful, heavily jargoned |
| Chain / breadcrumb navigation                  |    ◐     | Traverse between connected entities: Pose, Rig, PropsRig, Animatable                                                                                                            |
| Materials panel                                |    ●     | Manage shared materials, filter, create                                                                                                                                         |
| Face Bounds editing                            |    △     | PR #77 — edit `rootBounds` from an inspector section. Fixes off-center faces from bad baked bounds                                                                              |
| Standard Feature Spaces mapping                |    ◐     | Setup / Channels / Mapping tabs; coverage panel; `/standard/{ns}/{channel}/{track}/{attr}`                                                                                      |
| **Standard Feature Spaces export**             |    ○     | **Still "coming soon"** (`StdFeatureSpacesEditor.tsx:135`) — but see the note below                                                                                             |
| **Standard profile import**                    |    △     | **PR #100** — `File > Standard Profiles` checkbox list from `standardProfiles()`; embeds under `standard::<profile>`, rig-prefixed, replace-in-place                            |

> **The important shift.** Standard Feature Spaces was designed as an _authoring-side
> mapping tool_ whose export never shipped. The face standard + profile registry
> (VIZ-91) moved that responsibility **into the runtime**. So the DEFINE-stage interop
> feature is becoming "check a box to opt this face into ROS4HRI" rather than "hand-map
> 24 channels and hope export lands." The old mapping editor and the new profile picker
> now overlap — resolving that overlap is a workshop decision (see
> [`08-DECISIONS.md`](./08-DECISIONS.md) D4).

---

## CONTROL — "Make it do this, now."

| Feature                                  | Maturity | Notes                                                                                                                                    |
| ---------------------------------------- | :------: | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Live value editing via inspector sliders |    ●     | Drives the real runtime                                                                                                                  |
| Runtime source toolbar                   |    ●     | Choose which authored system drives live inputs (poses / clip / program / speech); Play/Pause/Stop; create/select/name runtime targets   |
| In-viewport transport overlay            |    ●     | Play/Pause on the canvas                                                                                                                 |
| Reference-face scope tabs                |    ◐     | Main Face / Reference Face / **Both Faces** (combined slider) — co-drive two faces                                                       |
| Empty-state interactive demo             |    ◐     | Idle + mouse gaze tracking, emotion and voice demo rows before a face loads. **VIZ-69** wants this expanded to gaze + visemes + emotions |
| Speech — TTS                             |    ●     | AWS Polly, voice picker, viseme/lip-sync driving the face                                                                                |
| Speech — STT                             |    ●     | Deepgram push-to-talk                                                                                                                    |
| Speech — LLM conversation                |    ●     | OpenAI (default `gpt-4o-mini`), system prompt, agent name, history, emotion-tagged JSON responses triggering emotion expressions         |
| Speech — Echo / Conversation modes       |    ●     | mic→avatar repeat, or mic→LLM→avatar                                                                                                     |
| Speech — PAP input mapping               |    ◐     | `/speech/speaking`, `/speech/user_speaking`, `/speech/thinking` + emotion/viseme groups, auto-provisioned into the rig                   |
| Speech config persistence                |    ◐     | API keys in `localStorage`; embedded into the exported bundle                                                                            |
| **TTS as a runtime module**              |    △     | **VIZ-94** — moves TTS toward ROS4HRI. Will make speech a runtime concern, not an app concern                                            |
| Live external control (bridges)          |    ●     | See [`04-INTERFACES.md`](./04-INTERFACES.md)                                                                                             |

---

## ANIMATE — "Make it move over time / react."

### Expressions (poses)

| Feature                                                  | Maturity | Notes                                                                                                             |
| -------------------------------------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------- |
| Create / duplicate / delete / rename / describe          |    ●     |                                                                                                                   |
| Capture from current values; create from snapshot; apply |    ●     |                                                                                                                   |
| Per-input value editing; add/remove pose inputs          |    ●     |                                                                                                                   |
| Per-input compose mode (add / average)                   |    ◐     |                                                                                                                   |
| Resting face (neutral)                                   |    ◐     | Capture/apply neutral; face-default vs. explicit modes; scoped neutral (inherit / pose-reference / direct-values) |
| Expression sets (pose groups)                            |    ●     | Create/rename/delete, group blend mode, group neutral source, membership, batch updates                           |
| Layering (blend stages)                                  |    ◐     | Ordered compositing pipeline with topology validation; cross-group override modes incl. `priority` with tie-break |
| Pose diagnostics                                         |    ◐     | Errors/warnings/info in the inspector                                                                             |
| Pose inspection in inspector                             |    ●     | Grouped pose variables, target vs. current sliders, weight preview/blend, compose-mode toggle                     |

### Animations (keyframe clips)

| Feature                           | Maturity | Notes                                                                                            |
| --------------------------------- | :------: | ------------------------------------------------------------------------------------------------ |
| Transport                         |    ●     | Play/pause/stop/step, loop, speed 0.5×–2×, seconds or frames (32 fps)                            |
| Timeline editor                   |    ●     | Scrubbable ruler, playhead, per-track lanes, double-click to add keyframe                        |
| Draggable keyframes               |    ●     | Click to select, drag to retime                                                                  |
| Interpolation                     |    ●     | Per-track linear / step / cubic + per-keyframe overrides, in/out tangents                        |
| Add-track modal                   |    ●     | Searchable catalog of editable/selectable rig inputs, dedupe                                     |
| Upsert keyframes from live values |    ●     |                                                                                                  |
| Multiple clips                    |    ◐     | Authored clips as "targets" + imported-from-bundle clips (name/duration overrides, hide toggles) |
| Clip IR compiler + curve sampling |    ●     | `AnimationClipIR` schemaVersion 1                                                                |
| Runtime transport bridge          |    ●     | Now arora-backed (was orchestrator)                                                              |
| **Generated ID export**           |    ○     | **VIZ-87** — the animation module's generated IDs aren't exported                                |
| **Transport feedback**            |    ○     | **VIZ-73** — module functions still missing                                                      |

### Behavior (motion-graph programs)

| Feature                    | Maturity | Notes                                                                                                                                                                                     |
| -------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Graph canvas               |    ●     | Pan/zoom, minimap, grid, auto-fit, drag-from-palette, typed edges with compatibility validation, double-click edge delete, multi-select, copy/paste with edge remapping, port-type legend |
| Node palette               |    ●     | Registry-driven categories from the WASM node-graph registry, search, docs/tooltips                                                                                                       |
| Special nodes              |    ●     | Input Source, Output Target                                                                                                                                                               |
| Inspectors & IO sets       |    ●     | Node inspector, input-source inspector, Input Sets / Output Sets panels                                                                                                                   |
| Live value inspection      |    ●     | Output value chart + value sampler                                                                                                                                                        |
| Program playback           |    ●     | Play/Pause/Stop, split viewport + editor. **Now on the arora device** (VIZ-70) — the private `OrchestratorProvider` is gone                                                               |
| In-place graph patching    |    ●     | **VIZ-79** — `applyGraphEdits` / `GraphDiff`; stateful nodes stay warm                                                                                                                    |
| Edge-selector preservation |    ●     | Fixed in `00691793`                                                                                                                                                                       |
| Multiple programs          |    ◐     | Authored + bundle-imported (`kind: "motiongraph"`)                                                                                                                                        |
| **Spring stability**       |    ○     | **VIZ-75** — no substep or `dt` clamp                                                                                                                                                     |
| **Output collisions**      |    ○     | **VIZ-58** — no combiner node, `mergeStrategy` ignored. **VIZ-76** — two publishers on one variable is invalid but unprevented                                                            |

---

## DEPLOY — "Ship it and run it elsewhere."

| Feature                                        | Maturity | Notes                                                                                                                                                                                          |
| ---------------------------------------------- | :------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bundled-GLB export                             |    ●     | `.glb` with round-trippable `VIZIJ_bundle`: rig graphs + IR, pose configs/graphs, clips, motion graphs, speech config, metadata (incl. `activeMotionGraphId` so a face "just starts behaving") |
| Export toggles                                 |    ●     | Embed bundle on/off, preserve imported animations, pose-group blend mode, cross-group blend mode                                                                                               |
| Advanced / legacy JSON exports                 |    ◐     | Rig graph spec + `.ir.json`, pose graph, pose config, pose IR                                                                                                                                  |
| Pre-export validation that can block export    |    ◐     | Rig-graph fatals, GraphSpec normalization, pose-graph validation, bundle-contract audits                                                                                                       |
| Dirty-state Save button                        |    ◐     | Highlights on unsaved changes — but **"Save" and "Save As…" both route to export**                                                                                                             |
| **Working-document save / autosave**           |    ○     | No project persistence. `localStorage` holds only speech keys, theme, a rig persistence helper, and hierarchy expand state                                                                     |
| **Stale-bundle shadowing on re-export**        |    △     | **Fixed in PR #100** — `applyVizijBundle` now strips descendant bundle copies for the export window. This bug silently shadowed _all_ post-load edits on re-export                             |
| **Non-authored graph kinds dropped on export** |    △     | **Fixed in PR #100** — `buildVizijBundle` now carries forward graph kinds it didn't author (e.g. a CLI-embedded profile)                                                                       |
| `vizij-bundle` CLI                             |    ●     | **VIZ-90** — `add-standard` embeds a profile; Quori JSON sidecar                                                                                                                               |
| Native `vizij` app                             |    ●     | **VIZ-47** — the primary runtime host; `--headless`, `--ros2`, `--studio`, `--no-ros4hri`                                                                                                      |
| `vizij-standalone` (Tauri)                     |    ◐     | **Maintenance-only.** WebSocket server + same-port web control panel, ROS2 feature, Studio Bridge feature, speech pipeline, transport inventory                                                |
| **Framework-agnostic embed**                   |    ○     | Does not exist. React is required to embed a face on a web page                                                                                                                                |
| **`@vizij/face-core` headless controller**     |    ○     | Scaffold on PR #86 only                                                                                                                                                                        |

---

## Cross-cutting

| Feature                                 | Maturity | Notes                                                                                                                          |
| --------------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------ |
| **Undo / Redo**                         |    ○     | **Still stubs** — `AppMenuBar.tsx:180-181`. Motion-graph has its own local copy/paste; there is no global history              |
| Debug panel                             |    ●     | Runtime status, playback, rig health, frame-step/stop                                                                          |
| Graph diagnostics panel                 |    ●     | Search issues, download IR graph, open inspector, paste/parse machine-report JSON                                              |
| RobotData audit                         |    ●     | Nodes without RobotData, missing animatables, feature drift                                                                    |
| Bundle audit / summary                  |    ●     | Graph/pose/animation counts, metadata                                                                                          |
| Memory-investigation harness            |    ◐     | Debug/perf mode that can bypass the runtime                                                                                    |
| **Unified validation**                  |    ○     | The four audit surfaces above + the import discrepancy wizard are **five separate places to be told something is wrong**       |
| Resizable multi-pane workspace          |    ●     |                                                                                                                                |
| Menu bar (File/Edit/Mode/View/Settings) |    ●     | + dirty-state Save, theme toggle, rotation display, selection highlight, dark mode                                             |
| 13 toggleable panels                    |    ◐     | With an exclusive-center rule for Animation / Program / Reference Face                                                         |
| 6 edit-focus modes                      |    ◐     | Auto-configure the panel layout                                                                                                |
| 4 workbench tabs                        |    ◐     | Import/Export, Rigging, Posing, Standard Feature Spaces                                                                        |
| Onboarding / instructional guides       |    ◐     | Per-workbench callouts                                                                                                         |
| Light/dark theme                        |    ●     | Persisted                                                                                                                      |
| Starred functionality panel             |    △     | **PR #59** (draft) — an early discoverability increment                                                                        |
| Reusable UI kit                         |    ●     | Button, Slider, NumberField, Modal, Tabs, Combobox, TreeRow, Switch, Checkbox, MenuBar, Tooltip, Card, Badge, Chip, EmptyState |
| Command palette                         |    ○     | Doesn't exist. Proposed as PR #65 U2                                                                                           |

---

## The gap list, current

Everything the room might reasonably ask "is that fixed yet?" about:

**Still open, unchanged since 2026-07-15:**

1. Undo/Redo non-functional (`AppMenuBar.tsx:180-181`)
2. Standard Feature Spaces export "coming soon" (`StdFeatureSpacesEditor.tsx:135`)
3. "Save"/"Save As…" both route to export; no working-document persistence
4. `App.tsx` is 4,632 lines
5. Five separate validation surfaces
6. No command palette, no global search
7. `docs/references/ui-component-inventory.md` partly stale (dated 2025-11-20)
8. Stray `src/layouts/temp.txt`

**Closed since:**

1. ~~Vestigial `@vizij/orchestrator-react` dependency~~ → VIZ-62/70
2. ~~Motion-graph preview on a private `OrchestratorProvider`~~ → VIZ-70
3. ~~Recompose reloads the whole graph~~ → VIZ-79 (`GraphDiff` patching)
4. ~~No CI publishing~~ → VIZ-86/88/89

**Closed by PRs awaiting merge:**

1. Stale-bundle shadowing on re-export → PR #100
2. Non-authored graph kinds dropped on export → PR #100
3. `rootBounds` not editable → PR #77

**New since, and not in any plan yet:**

1. Preview deliberately omits embedded profiles (PR #100) — no UI indicator
2. Profile _edition_ (VIZ-93) has no authoring surface
3. Speech split between app-side and runtime-side during the VIZ-94 transition
