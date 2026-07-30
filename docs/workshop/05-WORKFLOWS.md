# Workflows — the paths people actually walk

_End-to-end journeys through Vizij, with the friction marked. These are the raw
material for the workflow-mapping exercise: walk each one on the wall, mark where
people stall, and decide which ones we commit to supporting._

Friction key: **🔴 blocker** · **🟠 real friction** · **🟡 papercut** · **⚪ smooth**

---

## W1 — New face, zero to rigged

_Persona: Rig Author. The canonical first-time workflow._

| #   | Step                                                             | Friction | Note                                                                                                                                                              |
| --- | ---------------------------------------------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Get a GLB from Blender (or pick a preset: Quori / Toasty / Hugo) |    🟠    | Three variants per preset (`Blender-Export` / `Current` / `Extended`) and no in-app explanation of the difference                                                 |
| 2   | Import                                                           |    ⚪    | Weighted multi-phase progress bar is genuinely good                                                                                                               |
| 3   | Confirm orientation                                              |    🟡    | A quarter-turn dialog on the way in. Correct, but it's a quiz before you've seen the face                                                                         |
| 4   | Resolve import discrepancies                                     |    🟠    | The discrepancy wizard with semantic-risk guidance. Or press "Import (Skip Checks)" and find out later                                                            |
| 5   | Discover the face's controls                                     |    🟠    | Hierarchy panel + Variables panel + Inputs panel + Inspector. Four places, no single "what can this face do?" view                                                |
| 6   | Name / range / lock controls                                     |    ⚪    | Inspector rig-driver mode is solid: slider, numeric field, Min/Def/Max, range, degrees/radians                                                                    |
| 7   | Wire links & formulas                                            |    🟠    | Powerful (arithmetic, comparison, boolean, pipeline stages) and heavily jargoned: binding / driver / animatable / propsrig / pipeline stage                       |
| 8   | Fix materials                                                    |    🔴    | **VIZ-68** — import/export broken. PR #58 (AgX tone mapping) addresses Blender emissive faces                                                                     |
| 9   | Fix face bounds                                                  |    🟠    | **PR #77** in flight. Bad baked `rootBounds` = off-center face, and it's sticky across re-exports                                                                 |
| 10  | Validate                                                         |    🔴    | **Five separate surfaces**: rig-graph fatals, GraphSpec normalization, pose-graph validation, bundle audits, RobotData audit — plus the import discrepancy wizard |
| 11  | Make a mistake                                                   |    🔴    | **No undo.** `AppMenuBar.tsx:180-181` — the menu items render and do nothing                                                                                      |
| 12  | Save your work                                                   |    🔴    | **There is no save.** "Save" and "Save As…" both route to GLB export. Close the tab and it's gone                                                                 |

**Where this workflow fails:** steps 10–12. A first-time user can do everything right
and still lose the session, and if something is wrong they'll be told about it in five
different dialects.

---

## W2 — Rigged face to expression library

_Persona: Motion Designer._

| #   | Step                       | Friction | Note                                                                                                                                                               |
| --- | -------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Set the resting face       |    🟠    | Neutral capture/apply; face-default vs. explicit; scoped neutral (inherit / pose-reference / direct-values). Three concepts for "what does it look like when idle" |
| 2   | Pose the face with sliders |    ⚪    | Live, runtime-truthful                                                                                                                                             |
| 3   | Capture as an expression   |    ⚪    |                                                                                                                                                                    |
| 4   | Repeat ×N                  |    🟠    | **VIZ-49**: "plan approach to designing 17 face combinations" is an open in-progress issue — the workflow doesn't scale by hand                                    |
| 5   | Group into expression sets |    ⚪    |                                                                                                                                                                    |
| 6   | Set layering / blend order |    🟠    | Blend stages, group blend mode, cross-group blend mode, `priority` with tie-break, topology validation. Correct and near-unexplainable                             |
| 7   | Preview blends             |    ⚪    | Weight sliders + compose-mode toggle in the inspector                                                                                                              |
| 8   | Undo a bad capture         |    🔴    | No undo                                                                                                                                                            |
| 9   | Export                     |    🟠    | Blend modes are **export toggles**, so the artifact's blend semantics are set at export time, not authoring time                                                   |

**Where this workflow fails:** step 4 (doesn't scale) and step 6 (the layering model is
the least-teachable thing in the product).

---

## W3 — Expression library to behaving face

_Persona: Interaction Designer._

| #   | Step                                        | Friction | Note                                                                                                                                                              |
| --- | ------------------------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the Program (motion-graph) panel       |    🟡    | It's an _exclusive center panel_ — opening it closes Animation and Reference Face                                                                                 |
| 2   | Drag nodes from the registry-driven palette |    ⚪    | Good: categories, search, docs/tooltips, typed edges, port-type legend                                                                                            |
| 3   | Choose input sources / output targets       |    🟠    | Input Sets / Output Sets panels are a separate concept from the graph itself                                                                                      |
| 4   | Wire and play                               |    ⚪    | **Now on the arora device** (VIZ-70). In-place patching (VIZ-79) means the face keeps running and stateful nodes stay warm                                        |
| 5   | Watch values                                |    ⚪    | Output value chart + value sampler                                                                                                                                |
| 6   | Hit a spring instability                    |    🟠    | **VIZ-75** — no substep or `dt` clamp                                                                                                                             |
| 7   | Two things drive the same control           |    🔴    | **VIZ-76 / VIZ-58** — invalid but unprevented; no combiner node; `mergeStrategy` ignored. The behavior is "depends on composition order"                          |
| 8   | Add speech                                  |    🟠    | Polly + Deepgram + OpenAI, keys in `localStorage`, PAP paths auto-provisioned. Works, but **VIZ-94** is moving TTS to a runtime module — so this is mid-migration |
| 9   | Set the face to auto-behave on load         |    ⚪    | `activeMotionGraphId` in the bundle metadata. Nice touch                                                                                                          |

**Where this workflow fails:** step 7. The single most likely question from a new
behavior author has no defined answer.

---

## W4 — Behaving face onto a web page

_Persona: Web Integrator. This is the Peerbots workflow._

| #   | Step                                              | Friction | Note                                                                                                                     |
| --- | ------------------------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------ |
| 1   | Get the GLB                                       |    ⚪    | One artifact, round-trippable                                                                                            |
| 2   | `pnpm add @vizij/runtime-react react react-dom`   |    🟠    | **React is mandatory.** No framework-agnostic option exists                                                              |
| 3   | Configure the bundler for WASM                    |    🟠    | `asyncWebAssembly` + `.wasm` asset rule. Documented, but it's a real integration tax                                     |
| 4   | Set COOP/COEP headers                             |    🔴    | Cross-origin isolation is required. **Most host sites cannot set these headers.** This is why an iframe fallback matters |
| 5   | Mount `VizijRuntimeProvider` + `VizijRuntimeFace` |    ⚪    | `tutorial-fullscreen-face` is the canonical minimal example and it's small                                               |
| 6   | Drive it                                          |    ⚪    | `useVizijRuntime`, write inputs at paths, `useAnimationTransport`                                                        |
| 7   | Keep versions aligned                             |    🟠    | `runtime-react` / `render` / `runtime` must stay on the same release line                                                |
| 8   | Survive an API change                             |    🟠    | `runtime-react` README says: _"Status: experimental. Public API is still moving."_                                       |

**Where this workflow fails:** steps 2 and 4. **This is the workflow the missing
`<vizij-face>` embed exists to fix**, and it's the one with a named external customer.

---

## W5 — Face onto a robot (ROS 2)

_Persona: Robot Integrator. The newest workflow, and the one with the least UI._

| #   | Step                                    | Friction | Note                                                                                                                                             |
| --- | --------------------------------------- | :------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Get a face GLB                          |    ⚪    |                                                                                                                                                  |
| 2   | Graft the ROS4HRI profile in            |    ⚪    | `vizij-bundle add-standard` — or, once PR #100 lands, `File > Standard Profiles` in the authoring app                                            |
| 3   | Run it                                  |    ⚪    | `vizij --ros2`. ROS4HRI is **on by default**; `--no-ros4hri` opts out                                                                            |
| 4   | Publish ROS4HRI topics                  |    ⚪    | `expression/<name>` (25), `viseme/<shape>` (15), gaze/lid, and `hri_msgs/FacialActionUnits` mapping losslessly through the FACS muscle tier      |
| 5   | Verify without a robot                  |    ⚪    | `vizij --headless` + the `ros4hri_drives_the_adapted_quori` golden test in CI                                                                    |
| 6   | Adapt the profile for a specific face   |    🔴    | **VIZ-93 (Profile edition)** — no authoring surface. Today you edit `profiles/ros4hri.json` or write graph-builder code                          |
| 7   | Check what the profile will actually do |    🔴    | **The authoring preview composes no profile.** You embed it blind                                                                                |
| 8   | Understand precedence                   |    🟠    | Profile composes between base graphs and program, so a playing program out-writes it. Correct, deliberate, and documented only in a Linear issue |

**Where this workflow fails:** steps 6–7. The most externally-visible feature Vizij has
shipped has no authoring surface and no preview.

---

## W6 — Live operation

_Persona: Operator._

| #   | Step                           | Friction | Note                                                                                                                                      |
| --- | ------------------------------ | :------: | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A face is running somewhere    |    ⚪    |                                                                                                                                           |
| 2   | Connect                        |    🟠    | Four bridges (local WS, ROS 2, Studio/Zenoh, ROS4HRI topics) with different setup paths                                                   |
| 3   | See current state              |    ⚪    | `list_keys` / `read_values`; `values_changed` push; Studio can view live data (VIZ-67)                                                    |
| 4   | Override a value               |    ⚪    | `write_values`                                                                                                                            |
| 5   | Invoke a device method         |    🔴    | `list_methods` / `invoke` are in the wire vocabulary but **unimplemented on the web side** (ARORA-62) — no `callDevice`, no claim/release |
| 6   | Use the built-in control panel |    🟠    | The same-port web panel lives in `vizij-standalone`, which is **maintenance-only**                                                        |
| 7   | Reconnect and re-align         |    🟠    | **VIZ-78** — component-addressed writes with leaf-first alignment, for the Studio live-data reconnect                                     |

**Where this workflow fails:** step 5 (protocol wider than implementation) and step 6
(the host is deprecated).

---

## W7 — Round-trip: reopen a face someone else made

_Nobody's persona, everybody's problem._

| #   | Step                        | Friction | Note                                                                                                                                                                                                                                                           |
| --- | --------------------------- | :------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open the GLB                |    ⚪    | Bundle is extracted automatically                                                                                                                                                                                                                              |
| 2   | See what's in it            |    ⚪    | Bundle audit / summary panel: graph, pose, animation counts, metadata                                                                                                                                                                                          |
| 3   | Edit something              |    ⚪    |                                                                                                                                                                                                                                                                |
| 4   | Re-export                   |    🔴    | **Until PR #100: your edit could be silently shadowed.** A stale load-time `VIZIJ_bundle` rode along on a descendant node, and first-match readers — including this app on re-import and the native runtime's `Bundle::from_gltf_json` — read the _stale_ copy |
| 5   | Keep what you didn't author |    🔴    | **Until PR #100: dropped.** A GLB with a CLI-embedded profile, opened and saved here, silently lost the profile                                                                                                                                                |
| 6   | Diff against the original   |    🔴    | No versioning, no diff, no provenance. The GLB is the document and the document has no history                                                                                                                                                                 |

**Where this workflow fails:** everywhere, until PR #100 merges — and step 6
permanently. This is the workflow that most needs a real save format.

---

## W8 — Compare two faces (reference face)

_Persona: Rig Author retargeting._

| #   | Step                                  | Friction | Note                                                                                                                                |
| --- | ------------------------------------- | :------: | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Load a second GLB as a reference face |    ⚪    | Own runtime instance, stepped only while visible                                                                                    |
| 2   | View side-by-side                     |    🟡    | Split horizontal/vertical. It's an _exclusive center panel_ — closes Animation and Program                                          |
| 3   | Co-drive both                         |    ⚪    | Inspector scope tabs: Main / Reference / **Both** (combined slider). Genuinely clever                                               |
| 4   | Copy variables and poses across       |    🟠    | Reference-face copy _proposals_ with mapping status/confidence and merge decisions. Powerful; the confidence model is invisible     |
| 5   | Trust it                              |    🟠    | PR #101 exists specifically to make the e2e smoke assert the pose-copy contract and run in CI — i.e. this workflow was under-tested |

---

## Cross-workflow findings

### The three blockers that appear in almost every workflow

1. **No undo** — W1, W2, W3
2. **No save** (and until PR #100, unreliable re-export) — W1, W7
3. **Collision precedence undefined** — W3, and implicitly W5's profile-vs-program rule

### The two workflows with no designed surface at all

- **W5 steps 6–7** (profile edition + profile preview) — the newest, most externally
  visible capability
- **Asset supply** (the 3D Artist's whole workflow) — never appears in the app

### The workflow with a named customer and a known fix

**W4.** The blocker is COOP/COEP + mandatory React; the fix is the `<vizij-face>`
embed with an iframe fallback; the customer is Peerbots (VIZ-66, Peerbots Vizij
Adoption).

### Exercise

> Print W1–W8 as swim lanes on butcher paper. Give everyone red/orange/yellow dots and
> have them place dots from memory _before_ reading the friction column. Compare their
> intuition to this table. The disagreements are the interesting part: where the team
> thinks it hurts vs. where it actually hurts.
