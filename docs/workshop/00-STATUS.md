# Vizij Status — as of 2026-07-30

_Snapshot for the mental-models workshop. Sources: `vizij-web` `main` @ `418d7f2f`,
open PRs, and the Linear **Vizij (VIZ)** team._

---

## 1. The one-paragraph version

Over the last ~8 weeks Vizij stopped being "a web app with a WASM engine bolted on"
and became **a runtime with several front ends**. The bespoke orchestrator is gone,
replaced by **arora** as the single execution model; the same arora runs in the
browser (`@vizij/runtime`, WASM), natively (`vizij` crate — now the primary app),
and headless (CI snapshot tests). On top of that, a **face standard** landed —
a shared vocabulary of gaze/lid/expression/viseme/muscle paths plus a registry of
**standard profiles** (first one: ROS4HRI) that ship built into the runtime and can
be embedded into a face asset. Publishing is automated from CI for both npm and
crates.io. What has _not_ moved is the authoring app's user experience: `App.tsx` is
still 4,632 lines, undo/redo are still stubs, Save still means Export, and the
redesign work that addressed all of that (PR #65) is still an unmerged draft.

**So: the engine and the interop story raced ahead; the authoring UX and the
packaging-for-reuse story stayed put.** That gap is the workshop's subject.

---

## 2. What changed — landed on `main`

### 2.1 The orchestrator is gone; arora is the runtime

| Issue              | What landed                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| VIZ-38             | Orchestrator replaced with arora                                                                                                                 |
| VIZ-33/34/35/36/37 | Node-graph implements arora's `Behavior`; Vizij storage implements arora's data store; HAL abstraction; graph edition inside arora's abstraction |
| VIZ-53             | `@vizij/arora-web` package; engine swapped under `@vizij/runtime-react`                                                                          |
| VIZ-70             | `vizij-authoring` (motiongraph **and** Viewer) migrated off `orchestrator-react` onto the arora device                                           |
| VIZ-62             | Post-swap cleanup: no-op props, `value-json` everywhere, `toPlain` dropped                                                                       |
| VIZ-63 / VIZ-71    | Bevy plugin crates removed (after-care still open)                                                                                               |
| —                  | `bef1e6f1` "prune the orchestrator ghost" — the last references deleted                                                                          |

**Consequence for the redesign docs:** the two "sharp edges" that PR #65's foundation
flagged — the vestigial `@vizij/orchestrator-react` dependency, and the motion-graph
editor's own private `OrchestratorProvider` — **are both resolved.** Any plan that
still lists them as risks is out of date.

### 2.2 In-place graph patching (VIZ-79)

Authoring edits no longer reload the whole graph spec. `@vizij/runtime` ^2.1.0 exposes
`applyGraphEdits`, `runtime-react` computes a `GraphDiff` (`graphSpecDiff.ts`) and
recomposes **in place**. Stateful nodes (springs, integrators, timers) stay warm across
a recompose.

**Mental-model impact:** "edit the graph → the face keeps running and keeps its state"
is now true. The old model — "every edit is a reload, so expect a hitch" — is wrong.

### 2.3 The face standard and standard profiles (VIZ-14 → VIZ-91)

The biggest _conceptual_ addition. Delivered in `vizij-rs`, surfaced to the web via
`@vizij/runtime` 2.2.0:

- **`standard`** — the face-standard vocabulary: de-facto gaze/lid paths,
  `expression/<name>` (ROS4HRI's 25), `viseme/<shape>` (the industry 15), and a muscle
  tier cherry-picked from FACS action units + ARKit blendshapes. FACS supplies the
  taxonomy so `hri_msgs/FacialActionUnits` maps losslessly; ARKit supplies
  lateralization and the names off-the-shelf assets ship with.
- **`ros4hri`** — the first built-in **profile**, shipped as a pure node-graph and a
  canonical JSON asset (`profiles/ros4hri.json`, 674 nodes). Editable and exportable
  as data; a test fails if the committed file drifts from the builder.
- **`profiles`** — a registry (list / look up / prefixed source / embed id) shared by
  the native host, the bundler CLI, and the authoring UI.
- **Composition** — `Bundle::compose` takes an explicit `profiles` argument, composed
  _between_ base graphs and program, so a playing program or clip out-writes the
  profile. The `vizij` binary enables ROS4HRI by default (`--no-ros4hri` opts out).
- **`vizij-bundle` CLI** (VIZ-90) — `add-standard` embeds a profile into a GLB; Quori
  JSON sidecar support.

**Mental-model impact:** interop moved **down the stack**. In PR #65's model,
"Standard Feature Spaces" was an authoring-app mapping feature whose export was
"coming soon". Now the standard is a runtime concept, profiles are runtime assets,
and the authoring app's job shrinks to _opting a face into a profile_ — see §3, PR #100.

### 2.4 One native app; the Tauri wrapper demoted

VIZ-47 (+81/83/84/85) shipped the **`vizij` crate as the single entry point**:
`cargo run` shows Vizij running an arora, with the animation module + clip transport,
program autoplay, neutral staging, `--headless` frame capture with visual-regression
tests, and bridges composed directly onto the one device (`--ros2`, `--studio`).
`apps/vizij-standalone` (Tauri) is now documented **maintenance-only** — its
webview↔native store mirror dissolves in the native app (VIZ-74).

Also landed: Zenoh support (VIZ-15), Android support (VIZ-13).

### 2.5 Packaging hygiene

- **CI publishes releases** for npm (VIZ-89) and crates.io (VIZ-88) — VIZ-86 done.
- **Renames** (this is the part most likely to confuse anyone reading older docs):

  | Old name in the docs                  | Actual name today                                 |
  | ------------------------------------- | ------------------------------------------------- |
  | `@vizij/arora-web-wasm`               | **`@vizij/runtime`** (^2.1.0; 2.2.0 for profiles) |
  | `@vizij/node-graph-wasm`              | **`@vizij/node-graph`** (^0.7.0)                  |
  | `@vizij/animation-wasm`               | **`@vizij/animation`** (^0.4.0)                   |
  | `@vizij/orchestrator-wasm` / `-react` | **deleted**                                       |
  | `@vizij/arora-types`                  | **retired** into `@vizij/value-json` (^0.2.0)     |
  | arora "golden" keys                   | arora **"built-in"** keys (ARORA-59)              |

- Node pinned to 24 via `.nvmrc`; dependency security updates merged (#92).

### 2.6 Asset fixes

`Toasty_Current` rootBounds corrected (the authored y-size was actually the Z extent).
Face-bounds authoring tooling is in flight — PR #77.

---

## 3. What is in progress right now

### Open PRs (7)

| PR                                                     | State        | What                                                                                                                                               | Workshop relevance                                                                                                                                                                                                            |
| ------------------------------------------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#101](https://github.com/vizij-ai/vizij-web/pull/101) | ready        | reference-face e2e smoke asserts the pose-copy contract, runs in CI                                                                                | Locks the reference-face workflow                                                                                                                                                                                             |
| [#100](https://github.com/vizij-ai/vizij-web/pull/100) | ready        | **`File > Standard Profiles`** (VIZ-92): check a profile to embed it into the open GLB under `standard::<profile>`, rig-prefixed, replace-in-place | **The new interop workflow.** Also fixes two real export bugs: `@vizij/render` re-exports carried a stale descendant bundle that shadowed _all_ post-load edits; `buildVizijBundle` silently dropped non-authored graph kinds |
| [#86](https://github.com/vizij-ai/vizij-web/pull/86)   | draft, stale | Track 2 R0+R1: release plumbing, `@vizij/face-core` scaffold, headless `FaceRuntime` extraction, headless-Node wasm smoke gate                     | The reuse/packaging track. Needs re-basing onto the post-arora `main`                                                                                                                                                         |
| [#77](https://github.com/vizij-ai/vizij-web/pull/77)   | ready        | Face Bounds tooling (edit `rootBounds` from an inspector section)                                                                                  | Fixes off-center faces from bad baked bounds                                                                                                                                                                                  |
| [#65](https://github.com/vizij-ai/vizij-web/pull/65)   | draft, stale | **The redesign PR** — feature inventory + 4 proposals + synthesis + Track 1 (undo/redo, unified Checkup, terminology, autosave)                    | The subject of §4                                                                                                                                                                                                             |
| [#59](https://github.com/vizij-ai/vizij-web/pull/59)   | draft        | starred functionality panel                                                                                                                        | An early discoverability increment; owns the same files as any Track 1 work                                                                                                                                                   |
| [#58](https://github.com/vizij-ai/vizij-web/pull/58)   | draft        | AgX tone mapping for Blender-authored emissive faces                                                                                               | Feeds materials (VIZ-68)                                                                                                                                                                                                      |

### Linear — active

| Issue                                                         | Owner  | State       | Note                                                         |
| ------------------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------ |
| VIZ-92 Profile import in GLB when authoring                   | Victor | In Progress | PR #100                                                      |
| VIZ-93 Profile **edition**                                    | Victor | Todo        | Next after #100: editing a profile, canonical JSON re-export |
| VIZ-94 TTS module for ROS4HRI                                 | Victor | Todo        | Speech moves toward a runtime module                         |
| VIZ-49 Plan approach to designing 17 face combinations        | Saad   | In Progress | Asset/design scale problem                                   |
| VIZ-6 Load existing UI library                                | Andy   | In Progress | Under _Vizij Tooling Easy Mode_                              |
| VIZ-80 Define Vizij Rig Components                            | Saad   | Todo        | **Directly a mental-model question**                         |
| VIZ-77 Port Studio Vizij improvements to vizij-web            | Saad   | Todo        | This worktree's issue                                        |
| VIZ-68 Fix materials imports and exports                      | Saad   | Todo        |                                                              |
| VIZ-69 Demo of gaze/visemes/emotions as authoring empty state | Saad   | Todo        | First-run experience                                         |
| VIZ-66 Fix authoring issues needed for Peerbots integration   | Saad   | Todo        | First external adopter                                       |
| VIZ-1 Stakeholder Map                                         | Saad   | Backlog     | **Workshop output should close this**                        |

### Linear — active projects

| Project                        | Status                      | Lead   |
| ------------------------------ | --------------------------- | ------ |
| Vizij + Arora Integration      | In Progress                 | Victor |
| ROS4HRI Integration            | In Progress                 | Victor |
| Vizij Tooling Easy Mode — Plan | In Progress                 | Saad   |
| Peerbots Vizij Adoption        | Planned                     | Saad   |
| Vizij Face Designer            | Backlog                     | —      |
| Vizij PESOSE Application       | Backlog (target 2026-09-01) | —      |
| HRI 2027                       | Planned                     | —      |
| Vizij Standalone as Native App | **Completed**               | —      |

### Known-bug backlog worth naming in the workshop

These are all _model_ bugs — places where the system's rules are ambiguous, not just
code defects:

- **VIZ-76** — two publishers on the same variable is invalid. There is no defined
  merge; whoever writes last wins.
- **VIZ-58** — graph-composition fidelity: no combiner node for output collisions,
  `mergeStrategy` not honored.
- **VIZ-75** — spring node is numerically unstable at large `dt`.
- **VIZ-78** — component-addressed writes for the Studio live-data reconnect
  (leaf-first alignment).
- **VIZ-72** — built-in (`arora/*`) keys still leak through some paths.
- **VIZ-87** — the animation module's generated IDs are not exported.
- **VIZ-73** — animation transport/feedback functions still missing on the module.
- **VIZ-59** — the JS pose-control bridge is still there, pending store-feedback parity.
- **VIZ-74** — `vizij-standalone`'s dual store.

---

## 4. What PR #65 said, and what still holds

PR #65 (`sbeleidy/vizij-authoring-features-inventory-4d4be1`, draft) contains:

- `apps/vizij-authoring/docs/FEATURE_INVENTORY.md` — an exhaustive 19-area inventory
  (dated 2026-07-15).
- `docs/redesign/00-FOUNDATION.md` — personas, the DEFINE→CONTROL→ANIMATE→DEPLOY
  lifecycle, feature-parity checklist, terminology, the arora contract, the L0–L4
  package target.
- Four standalone proposals: **A** Lifecycle Studio, **B** Role Workspaces,
  **C** Headless + Component Kit, **D** Progressive-Disclosure Canvas.
- `05-SYNTHESIS.md` — the recommended hybrid: _a progressive-disclosure canvas app (D),
  built on a headless package suite (C), guided by the lifecycle as wayfinding (A),
  presettable by role (B)_, plus a two-track plan (Track 1 = user-facing value first,
  Track 2 = repackaging last).
- Track 1 implementation: real undo/redo, unified Checkup, canonical terminology
  relabel, working-document autosave.
- A companion branch (`claude/pr-65-track-2-planning-4swlj0`, PR #86) with
  `06-track-2-implementation.md`, the `@vizij/face-core` scaffold and the headless
  `FaceRuntime` extraction.

### Status check against today's `main`

**Nothing from PR #65 has merged.** `main` has 26 commits since the merge-base;
`docs/redesign/`, `FEATURE_INVENTORY.md`, `src/checkup/`, `src/state/history/`,
`src/workingSave/`, and `src/state/starredStore.ts` are all absent from `main`.

| PR #65 claim                                                        | Still true on `main`?                                                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `App.tsx` ~4,600 lines                                              | ✅ 4,632 lines                                                                                                       |
| Undo/Redo are non-functional stubs                                  | ✅ `AppMenuBar.tsx:180-181` — bare `<MenuItem>Undo</MenuItem>`                                                       |
| Standard Feature Spaces export "coming soon"                        | ✅ `StdFeatureSpacesEditor.tsx:135`                                                                                  |
| Save == Export; no project persistence                              | ✅                                                                                                                   |
| 13 toggleable panels, 6 edit-focus modes, 4 workbench tabs          | ✅ `workspaceStore.ts`, `AuthoringUiProvider.tsx`                                                                    |
| Four orthogonal navigation mechanisms                               | ✅                                                                                                                   |
| Vestigial `orchestrator-react` dep                                  | ❌ **fixed** (VIZ-62/70)                                                                                             |
| Motion-graph preview on a private `OrchestratorProvider`            | ❌ **fixed** (VIZ-70)                                                                                                |
| `@vizij/arora-web-wasm` / `node-graph-wasm` / `animation-wasm`      | ❌ **all renamed** (§2.5)                                                                                            |
| `setGraphBundle` hot updates as the authoring→runtime entry point   | ⚠️ still the entry point, but recompose is now a **`GraphDiff` patch**, not a reload (VIZ-79)                        |
| "SFS export is coming soon" is the interop gap                      | ⚠️ **superseded** — the standard moved into the runtime; profiles are embeddable via CLI and (PR #100) the File menu |
| L1 `@vizij/face-core` does not exist                                | ✅ still not on `main` (scaffold lives on PR #86)                                                                    |
| `@vizij/components`, `<vizij-face>` embed                           | ✅ still don't exist                                                                                                 |
| "7 open PRs to coordinate with (#63, #59, #60, #61, #51, #58, #64)" | ❌ **stale** — #63 landed as the arora migration; the current set is in §3                                           |

### The judgment call

- **The problem statement holds.** Everything PR #65 identified as a UX problem is
  still there, verbatim, and is now the _only_ part of the stack that hasn't been
  reworked.
- **The diagnosis of the substrate is half-obsolete.** The arora contract section, the
  package names, and the "coordinate with these PRs" section need rewriting. The
  L0–L4 target is still directionally right, but L0 is now one runtime family with a
  native host, not "external WASM engines" — and L3's `<vizij-face>` embed is a
  _bigger_ win than it was, because the native `vizij` app now proves the same
  runtime works in three hosts.
- **The interop layer needs re-siting.** PR #65 put Standard Controls in L4 as an
  editor package. The standard is now L0. The authoring surface is a _profile picker_,
  not a mapping editor — much smaller, and mostly already built (PR #100).
- **The plan's sequencing assumption is broken.** "Track 1 ships entirely before
  Track 2 starts" assumed a stable substrate. The substrate moved under it for eight
  weeks, which is why both tracks are stale drafts. Any revived plan needs to be
  robust to the runtime continuing to move.

---

## 5. Three numbers for the room

- **4,632** — lines in `App.tsx`. Unchanged through the entire arora migration.
- **674** — nodes in the built-in `ros4hri` profile graph. Interop is now _large,
  data-defined, and versioned_ — not a hand-mapped table.
- **26 / 0** — commits landed on `main` vs. commits landed from the redesign PRs, in
  the same window.
