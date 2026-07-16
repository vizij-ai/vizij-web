# Proposal B — Role-based Workspaces

_Part of the Vizij front-end redesign set. Reads on top of
[`00-FOUNDATION.md`](./00-FOUNDATION.md) and the
[`FEATURE_INVENTORY.md`](../../apps/vizij-authoring/docs/FEATURE_INVENTORY.md).
Where this proposal and the foundation disagree, the foundation wins._

---

## 1. Thesis

Split the front end into three **role-tuned workspaces** — **Rig Studio**
(Rig Author), **Motion Studio** (Motion Designer), and **Deploy Studio**
(Integrator/Deployer) — mounted over one shared **project shell** and one shared
**Face Package core**. Each workspace shows only the tools its persona needs, in
a layout optimized for that job, so a user picks a workspace by _what they are
trying to do_ rather than hunting among twelve toggleable panels. Hand-offs are
first-class: work flows between roles through the single Face Package artifact
and a lightweight **Handoff Bar**, and a solo user who plays all three roles
simply switches workspaces like tabs without ever losing their project.

---

## 2. Software Requirements Document (SRD)

### 2a. Front-end organization

#### Information architecture

Today's app exposes four orthogonal navigation mechanisms at once (workspace
panels, workbench tabs, edit-focus modes, authoring surfaces —
`FEATURE_INVENTORY.md` §1). This proposal collapses them into **one** primary
axis: the **workspace**. Everything else (panels, tabs, focus modes) becomes an
_internal_ layout detail owned by a workspace, never a user-facing navigation
control.

```
┌───────────────────────────────────────────────────────────────────────┐
│  PROJECT SHELL  (persistent, identical across all workspaces)           │
│                                                                         │
│  ┌─ Workspace Switcher ──────────────────┐   [Checkup ▸]  [Save]  ◐    │
│  │  ◉ Rig Studio                          │                             │
│  │  ○ Motion Studio                       │   ← global: project title,  │
│  │  ○ Deploy Studio                       │      dirty-state, theme,     │
│  └────────────────────────────────────────┘      undo/redo, Checkup     │
│                                                                         │
│  ┌─ Handoff Bar ──────────────────────────────────────────────────┐   │
│  │  Face Package "quori-v3"  ·  Rig ✓  ·  Expressions 12  ·        │   │
│  │  Programs 2  ·  Speech ⚠ unset   ·  [Send to Motion ▸]          │   │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────── ACTIVE WORKSPACE ─────────────────────┐    │
│  │  (only the selected workspace's tools render here)              │    │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

- **The shell owns:** project identity, the loaded Face Package, the workspace
  switcher, global Save (a real save distinct from export — fixes gap §18),
  global undo/redo (a real history stack — fixes gap §18), theme toggle, and the
  cross-workspace **Checkup** entry point. The shell is a thin frame; it never
  contains editing surfaces.
- **The workspace owns:** its own panel layout, its own tools, its own empty
  states and onboarding. Switching workspace re-lays-out the entire working
  area, but never reloads the runtime, the GLB, or the device store.
- **One project, one runtime.** All three workspaces read and write the same
  in-memory Face Package and the same `VizijRuntimeProvider` device (foundation
  §6.1). A workspace switch is a view change, not a data change.

#### The workspace switcher

A three-item segmented control, top-left of the shell, always visible. Rules:

1. **Ordered by lifecycle.** Rig → Motion → Deploy reads left-to-right as
   DEFINE/CONTROL → ANIMATE → DEPLOY (foundation §3), so the switcher doubles as
   a subtle progress spine without forcing a wizard.
2. **State-aware badges.** Each item shows a tiny readiness badge sourced from
   runtime metadata (`resolveFaceControls()`, `inputConstraints`) — e.g. Rig
   Studio shows a green check once controls resolve and Checkup passes; Deploy
   shows a lock until a rig exists. Badges guide but never _block_ switching.
3. **No hidden modes.** The six "Edit Focus" modes (§1) and four workbench tabs
   (§1) disappear as concepts. Their layouts are absorbed into the three
   workspaces (see the matrix, §3).

#### Rig Studio (persona: Rig Author) — DEFINE

Job: turn a raw mesh into a controllable face with named controls, standard-control
mappings, and a clean Checkup. Layout optimizes for hierarchy + inspector + viewport.

```
┌─ Rig Studio ────────────────────────────────────────────────────────────┐
│ [Import ▾] [Standard Controls] [Checkup]                    (shell above) │
├──────────────┬───────────────────────────────────┬──────────────────────┤
│ FACE ELEMENTS│                                    │ CONTROL INSPECTOR    │
│  (hierarchy) │            LIVE 3D FACE            │  (scene/driver/       │
│   ▸ Head     │        (runtime-truthful)         │   material modes)     │
│   ▸ Eyes     │                                    │  • value slider       │
│     · L eye  │      ◐  ← selection glow           │  • range min/def/max  │
│     · R eye  │                                    │  • driver path        │
│   ▸ Mouth    │                                    │  • transform / morph  │
│  [filter…]   │  ┌─ overlay: play/pause ─┐         │  • material color     │
│              │  └────────────────────────┘         │  • links / formulas   │
├──────────────┴───────────────────────────────────┴──────────────────────┤
│ CONTROL MAP (Standard Controls)  ·  coverage: 18/24 mapped  ·  [Checkup] │
└───────────────────────────────────────────────────────────────────────────┘
```

- Center: the live face (`Viewer.tsx`, §9), selection glow, in-viewport
  transport overlay.
- Left: **Face Elements** (hierarchy/scene tree, §8) with viewport-synced
  selection, filter, reparent, duplicate/delete.
- Right: the **Control Inspector** — the scene-object / rig-driver / material
  inspector modes (§7), plus links/formulas (renamed from bindings/expressions).
  The _pose_ inspector mode moves to Motion Studio (see §3).
- Bottom: the **Control Map** (Standard Feature Spaces, §11) with a coverage
  meter, surfaced here because standardization is a Rig Author responsibility.
- Import (§2) and Checkup (§12) are Rig Studio's primary entry points.

#### Motion Studio (persona: Motion Designer) — ANIMATE + CONTROL

Job: author expressions, animations, and programs; preview them live; drive by
speech. Layout optimizes for a big preview + a mode-swappable authoring surface.

```
┌─ Motion Studio ───────────────────────────────────────────────────────────┐
│ Author: [ Expressions | Animation | Program | Speech ]     (shell above)    │
├──────────────┬─────────────────────────────────────────────────────────────┤
│ LIBRARY      │                LIVE 3D FACE  (driven by selected source)     │
│  Expressions │                                                              │
│   · smile    │        ◐                                                     │
│   · blink    │                                                              │
│   · surprise │   ┌─ Drive with: (Expression ▾ | Clip ▾ | Program ▾ |       │
│  Animations  │   │              Speech) ────────────────────────────┐      │
│   · wave      │  └───────────────────────────────────────────────────┘      │
│  Programs    │                                                              │
│   · idle      │                                                              │
│  [+ new ▾]   │                                                              │
├──────────────┴─────────────────────────────────────────────────────────────┤
│  AUTHORING SURFACE  (swaps with the "Author:" selector above)               │
│  ── Expressions: control grid + capture/apply + layering/sets              │
│  ── Animation:   timeline · tracks · keyframes · transport (0.5–2×, fps)   │
│  ── Program:     node-graph canvas · palette · IO sets · value chart       │
│  ── Speech:      TTS voice · Echo/Conversation · viseme + emotion mapping  │
└───────────────────────────────────────────────────────────────────────────┘
```

- The **"Author:"** selector is the only in-workspace mode control, and it maps
  1:1 to the four authored-motion kinds (expressions/animation/program/speech).
  It replaces today's Animation/Program/Reference-Face "exclusive center panel"
  logic (§1) with an explicit, labeled choice.
- Left **Library**: the authored-entity list (poses, clips, programs — the
  Variables/authoring-surfaces panel, §8) filtered to motion entities.
- Center: the same live face, now with a **Drive with** toolbar (the Runtime
  Source Toolbar, §9) choosing which authored system drives inputs.
- Bottom: the active authoring surface — Expression grid (§6), Timeline (§4),
  Program node-graph (§5), or Speech (§10).

#### Deploy Studio (persona: Integrator/Deployer) — DEPLOY

Job: validate, publish a Face Package, generate an embed, and connect/monitor
live control. Layout optimizes for a preview-as-consumer-sees-it + config forms.

```
┌─ Deploy Studio ───────────────────────────────────────────────────────────┐
│ [Checkup] [Publish Package] [Get Embed] [Live Control]     (shell above)    │
├───────────────────────────────────────┬─────────────────────────────────────┤
│         CONSUMER PREVIEW               │  PUBLISH & EMBED                    │
│    (the face as an embed sees it —     │   • Package contents (bundle audit) │
│     no editor chrome)                  │   • Export toggles (embed bundle,   │
│         ◐                              │     preserve anims, blend modes)    │
│                                        │   • Embed snippet:                  │
│   ┌─ Live Control status ─────┐        │       <vizij-face src=…>            │
│   │ WS ● connected             │        │     + writeValues/readValues API   │
│   │ ROS2 ○  · Studio ○         │        │   • Active behavior on load         │
│   └────────────────────────────┘        │                                     │
├───────────────────────────────────────┴─────────────────────────────────────┤
│  CHECKUP  ·  rig ✓ · bundle-contract ✓ · SFS export ✓ · robot-data ⚠ 2     │
└───────────────────────────────────────────────────────────────────────────┘
```

- Center: a **Consumer Preview** — the face rendered through the same L3 embed
  the integrator will ship, so "what I see is what I ship."
- Right: **Publish & Embed** — the Export dialog (§3) reframed as _publish a Face
  Package_, plus a generated `<vizij-face>` embed snippet and its JS control API
  (the L3 gap, foundation §7).
- **Live Control** panel: connect/monitor WebSocket / ROS 2 / Studio bridges
  (§`standalone`), mirroring the `write_values`/`read_values`/`list_keys`/
  `invoke` vocabulary (foundation §6).
- Bottom: **Checkup** — the consolidated diagnostics/audits (§12), the gate
  before publish.

#### Entry points

| Entry | Lands in | Why |
|---|---|---|
| Fresh open / no face | Rig Studio empty state → Import or Preset | DEFINE is step one; empty-state demo (§9) previews what a face can do |
| Open existing Face Package | Last-used workspace for that project | Solo users resume where they left off |
| "Import model" | Rig Studio | Import is a Rig Author job |
| "Design how it moves" | Motion Studio | |
| "Embed / deploy / drive it" | Deploy Studio | |
| Deep link `?ws=motion` | Named workspace | URL-addressable workspaces (new — today is not URL-routed, §1) |

### 2b. User-facing terminology (refinements)

Adopts the foundation glossary (§5) and refines it for a role framing. Internal
runtime terms stay hidden.

| Foundation term | This proposal | Refinement / rationale |
|---|---|---|
| (the app) | **Rig Studio / Motion Studio / Deploy Studio** | Workspaces named for the job, not the feature set |
| Control | **Control** | Kept |
| Standard Controls / Control Map | **Control Map** | The Rig Studio surface for cross-face interop mapping |
| Expression / Expression Set / Layering | **Expression / Expression Set / Layering** | Kept; live in Motion Studio's Library |
| Program / Behavior | **Program** | The node-graph is one editor for it (§5); representation stays open |
| Animation / Clip / Keyframe | **Animation / Clip / Keyframe** | Kept |
| Face Package | **Face Package** | The one artifact that flows between all three workspaces |
| Checkup / Validation | **Checkup** | One shell-level action; each workspace contributes its own checks |
| Live Control / Connections | **Live Control** | Deploy Studio panel |
| Import + guided Checkup | **Import** | Orientation/discrepancy prompts folded into Rig Studio's Checkup |
| (new) | **Handoff Bar** | The shell strip that shows package readiness + "Send to <role>" |
| (new) | **Workspace** | The single primary navigation concept |
| edit-focus mode / workbench tab / panel toggle | _(removed as concepts)_ | Absorbed into workspace layouts |

### 2c. Workflows facilitated

Concrete first-person journeys. Each shows workspace switches and role hand-offs.

**Workflow 1 — Rig a model (Rig Author).**
I open Vizij; it starts in **Rig Studio** with an empty-state demo. I click
**Import**, pick my `quori.glb`. A single **Import Checkup** appears: it confirms
orientation (folding in the orientation dialog, §2) and shows any discrepancies
in plain language — I accept. The face appears live in the center. In **Face
Elements** I select the left eye; the **Control Inspector** on the right lets me
set its range (Min/Def/Max), rename it, and lock the ones I don't want animated.
I open the **Control Map** at the bottom and map my controls onto standard names
(`left_eye/pos/x`) so downstream faces interoperate; a coverage meter reads
18/24. I run **Checkup** from the shell — two robot-data warnings, no fatals. I
hit **Save** (a real save, not an export). The Handoff Bar now reads
`Rig ✓`. I click **Send to Motion**.

**Workflow 2 — Author expression + animation + program (Motion Designer).**
"Send to Motion" dropped me into **Motion Studio**, same project, same live face,
no reload. The **Author:** selector is on **Expressions**. I click **+ new**,
pose the controls in the grid, and **Capture** a "smile"; I add "blink" and
"surprise" and drag them into an Expression Set with a layering order. I switch
**Author: Animation** — the bottom becomes a timeline; I add tracks from the
control catalog, double-click to drop keyframes, set cubic interpolation, and
scrub with the transport at 1.5×. I switch **Author: Program** — the node-graph
canvas opens; I wire an idle-gaze **Program** from the palette and hit Play; the
center face reacts live. Throughout, the **Drive with** toolbar lets me flip
which source drives the preview. I **Save**. The Handoff Bar reads
`Expressions 3 · Animations 1 · Programs 1`.

**Workflow 3 — Drive live / speech (Motion Designer → live).**
Still in **Motion Studio**, I switch **Author: Speech**. I pick a Polly voice,
type a line — visemes drive the mouth live. I flip to **Conversation** mode,
grant mic, and the face runs mic → LLM → emotion-tagged response, triggering my
emotion expressions. Because speech config embeds into the package (§10), I don't
have to re-wire anything for deploy.

**Workflow 4 — Checkup + publish/deploy + embed (Integrator/Deployer).**
I switch to **Deploy Studio**. The center shows the **Consumer Preview** — the
face as an embed will render it, no editor chrome. On the right, **Publish &
Embed** lists the package contents (rig, 3 expressions, 1 clip, 1 program, speech
config). I set the active behavior on load to my idle program. I run **Checkup**
(now including SFS export — fixing gap §18) — all green. I click **Publish
Package** → a `.glb` Face Package downloads. Below it, **Get Embed** generates:

```html
<script src="https://cdn.vizij…/vizij-face.js"></script>
<vizij-face src="quori-v3.glb" autostart></vizij-face>
<script>
  const face = document.querySelector('vizij-face');
  face.writeValues({ 'standard/semio/left_eye/pos/x': 0.3 });
</script>
```

I open **Live Control**, connect the **WebSocket** bridge, and watch
`values_changed` update the preview as my robot stack writes canonical
`rig/{faceId}/…` paths. Done — I never touched a rigging or timeline control.

**Workflow 5 — Solo creator playing all three roles.**
I'm one person building a face end-to-end. I treat the three workspaces like
tabs: Rig Studio to wire controls, Motion Studio to make it expressive, Deploy
Studio to ship. The **Handoff Bar** "Send to <role>" buttons are optional
shortcuts, not gates — I can jump straight to Deploy Studio at any time (it just
shows a "no rig yet" lock badge if I haven't defined one). No data is ever
duplicated or re-imported across the switch.

### 2d. Accessibility, discoverability, ease-of-use

- **Discoverability by role.** The single question "what am I trying to do?"
  routes to a workspace, replacing the current app's need to know which of 13
  panels holds a feature. Each workspace's empty state teaches its own job.
- **Progressive disclosure (foundation §8).** A newcomer in Rig Studio sees a
  face, a hierarchy, and an inspector — not timelines, node graphs, or bridges.
  Depth lives one workspace-switch away, not in a wall of toggles.
- **Reduced overwhelm.** Each workspace renders a bounded tool set (roughly 3–5
  regions) instead of twelve simultaneous panels.
- **Accessibility.** The workspace switcher is a labeled radio group,
  keyboard-navigable (arrow keys + `1/2/3` shortcuts). Readiness badges use
  icon + text, never color alone. All authoring surfaces inherit the existing UI
  kit (§1) hardened for screen-reader labels and light/dark contrast. Checkup
  results are a text list, not color-only.
- **Ease-of-use safeguards.** Real undo/redo at the shell (fixes §18); a real
  Save distinct from Publish (fixes §18); one Checkup concept instead of four
  scattered audit panels (§12).

---

## 3. Feature-coverage matrix

Every one of the 19 inventory areas, and where it lands. Nothing dropped.

| # | Inventory area | Workspace(s) | Disposition & why |
|---|---|---|---|
| 1 | App shell, layout & navigation | **Shell** (all) | Rebuilt: one workspace axis replaces panels/tabs/focus-modes/surfaces. Menu bar → shell actions. Panel-visibility store → per-workspace layout config. Onboarding guides → per-workspace empty states. UI kit reused. |
| 2 | Import | **Rig Studio** | Primary entry. "Skip checks" and orientation/discrepancy dialogs fold into the guided **Import Checkup**. Reference-face import → Rig Studio comparison tool. Rig/pose-graph JSON imports → advanced import menu (kept). |
| 3 | Export / Save | **Deploy Studio** (Publish) + **Shell** (Save) | Split: shell **Save** persists the project; Deploy **Publish Package** produces the GLB. Fixes §18 "Save==export." Advanced/legacy JSON exports live under an "Advanced" disclosure. |
| 4 | Keyframe animation editor | **Motion Studio** (Author: Animation) | Timeline/transport/tracks/clips move here intact. |
| 5 | Motion-graph editor ("Program") | **Motion Studio** (Author: Program) | Node-graph canvas/palette/IO sets/value chart move here. Renamed **Program** (representation stays open per §5). |
| 6 | Pose rig authoring (Posing) | **Motion Studio** (Author: Expressions) | Poses → **Expressions**; pose groups → Expression Sets; blend stages → Layering; neutral → Resting Face. Pose remap wizard kept. |
| 7 | Inspector (4 modes) | **Rig Studio** (scene/driver/material) + **Motion Studio** (pose) | Split by role: the pose-inspection mode follows expressions into Motion Studio; scene/driver/material stay with the Rig Author. Chain/breadcrumb nav kept within each. |
| 8 | Left-sidebar authoring surfaces | **Rig Studio** (hierarchy/materials/inputs) + **Motion Studio** (Library: poses/anims/programs) | The single Variables panel splits by entity type across the two authoring workspaces. |
| 9 | 3D viewport / runtime & preview | **All three** (shared runtime) | One `VizijRuntimeProvider` device; each workspace frames it differently (editor view vs. Consumer Preview). Runtime source toolbar → Motion "Drive with." Empty-state demo → Rig Studio. Reference-face runtime → Rig Studio. |
| 10 | Speech & conversational avatar | **Motion Studio** (Author: Speech) | Authoring lives here; config embeds into the package for Deploy. Live speech also drivable from Deploy's Live Control. |
| 11 | Standard Feature Spaces (mapping) | **Rig Studio** (Control Map) | A Rig Author responsibility (interop). **SFS export implemented** in Deploy's Checkup/Publish — fixes §18 "coming soon." |
| 12 | Diagnostics, audits & debug | **Shell Checkup** + per-workspace contributions | Unified: graph diagnostics + robot-data audit + bundle audit + debug consolidate into one **Checkup** with sections. Deep debug/memory harness behind an "advanced" flag. |
| 13 | Architecture & WASM engines (arora) | **Architecture §5** | Substrate. Preserved exactly; see §5. |
| 14 | Internal `@vizij/*` dependency map | **Architecture §5** | Substrate; remapped onto L0–L4. |
| 15 | Data model / authored-entity schemas | **Architecture §5** | Substrate; owned by shared Face Package core. |
| 16 | State management | **Architecture §5** | Substrate; project state in shared core, view state per workspace. |
| 17 | Persistence | **Architecture §5** + **Shell Save** | Add a real project save (fixes §18); Face Package remains the durable artifact. |
| 18 | Known gaps / caveats | **Fixed across shell + Deploy** | Real undo/redo (shell), real Save≠Publish (shell/Deploy), SFS export (Deploy). Stray `temp.txt` dropped in clean-slate. |
| 19 | Testing & build | **Architecture §6** | Per-package tests; workspace-level E2E; build/deploy unchanged. |

---

## 4. Review — self-critique

**Where this design is strong.**

- **Onboarding & overwhelm.** The single biggest win: three bounded workspaces
  instead of twelve simultaneous panels and four navigation axes (§1). A user
  never asks "which panel?"; they ask "which job?"
- **Clean lifecycle mapping.** Workspaces map cleanly onto DEFINE→ANIMATE→DEPLOY
  (foundation §3) without forcing a linear wizard.
- **Coverage.** All 19 areas land somewhere; the split forces us to _finally_
  implement SFS export and a real Save (§18) because Deploy Studio's whole reason
  to exist is producing a shippable package.

**Hand-off friction — the central risk of role separation.**

- **Risk:** a rig author's work must reach the motion designer without friction,
  and a solo user must not be taxed by role boundaries.
- **Mitigation 1 — one artifact, one runtime.** There is no export/import step
  between workspaces. All three read/write the same in-memory Face Package and
  the same live device (foundation §6.1). "Send to Motion" is a view switch, not
  a data transfer, so hand-off cost is essentially zero.
- **Mitigation 2 — the Handoff Bar.** It makes readiness legible ("Rig ✓,
  Speech ⚠ unset") so a hand-off is informed, and its "Send to <role>" buttons
  are shortcuts, not gates. Nothing is ever locked _out_; badges only advise.
- **Residual friction:** a feature that genuinely spans two roles (e.g. the
  Inspector's pose mode vs. driver mode, §7) forces a judgment call about which
  workspace it lives in. I split area 7 by role, which means a motion designer
  tweaking a pose can't simultaneously see the raw driver range without a switch.
  This is the sharpest tension; I accept it because the alternative (duplicating
  the inspector into both workspaces) risks divergence. `05-SYNTHESIS` should
  decide whether a small shared "inspect current control" affordance belongs in
  the shell.

**Shared vs. duplicated shell.**

- **Risk:** three workspaces could re-implement the viewport, transport, and
  inspector three times — exactly the monolith trap in a new costume.
- **Mitigation:** the viewport frame, transport bar, and Control Inspector are
  built once in **L2 `@vizij/components`** and _composed_ by each workspace
  (§5). The shell owns everything cross-cutting (save, undo, Checkup, theme). A
  workspace is a thin layout that arranges shared components — not a fork.

**Simplicity honest-assessment.**

- The three-workspace model is simpler _to navigate_ but adds one new concept
  (workspace) and a small amount of routing/handoff machinery. For a
  power-user who wants everything at once, three workspaces can feel like extra
  clicks versus one dense screen. The `?ws=` deep links and `1/2/3` shortcuts
  soften this, but it is a real trade: we optimize for the newcomer and the
  role-specialist over the expert generalist.
- Consolidating four audit surfaces (§12) into one **Checkup** is a genuine
  simplification but requires care that no diagnostic detail is lost — the
  Checkup must expose per-section drill-down (graph IR download, machine-report
  paste) that the current panels offer.

---

## 5. Architecture

### Preserving the arora contract (hard constraint — foundation §6)

Unchanged, verbatim in behavior:

1. **One composed graph, one device per face.** Each project mounts exactly one
   `VizijRuntimeProvider` (`packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`),
   composing rig + pose + program graphs into a single arora device. All three
   workspaces are children of that one provider — switching workspace never
   remounts it. Multiple faces = multiple providers with distinct namespaces.
2. **Unprefixed `params.path` is the cross-graph contract.** Node ids are
   namespaced; store paths are not. Rig/pose/program wire together by shared
   store path identity — unchanged. Workspaces read/write the same paths.
3. **`ValueJSON` I/O with step-ms / drain-changes.** The device advances by `dt`
   ms, drains changed keys, converts `ValueJSON → RawValue`, writes only changed
   keys. The pull model is untouched; a workspace switch does not re-render the
   device.
4. **Hot updates via `setGraphBundle(bundle, {tier})`.** Every authoring edit in
   Rig or Motion Studio pushes graphs with `tier: "graphs"`; only Import does a
   `tier: "assets"` reload. This is the sole authoring→runtime entry point, per
   the README (`setGraphBundle()` swaps rig/pose/animations/programs without
   reloading the GLB).

**Rule honored:** all workspaces speak `VizijAssetBundle` / `RuntimeGraphBundle`
and canonical paths, and go through `@vizij/runtime-react`. No workspace touches
the arora device directly. UI reads runtime-resolved metadata
(`resolveFaceControls()`, `inputConstraints`, pose groups as blend structure),
matching the `useWebSocketSync.ts` pattern
(`apps/vizij-standalone/src/hooks/useWebSocketSync.ts`) that builds slot metadata
straight from `inputConstraints`.

Two sharp edges (foundation §6) are tracked here: the **vestigial**
`@vizij/orchestrator-react` dependency in `runtime-react` should be dropped
during extraction, and the motion-graph editor's **live preview** still runs on
its own `OrchestratorProvider` (`orchestrator-wasm`) — that lives entirely inside
Motion Studio's Program surface and is the one place orchestrator stays
load-bearing until committed programs run in the arora device.

### Decomposition onto L0–L4

```
L4  Editor packages (one per workspace's heavy surfaces)
      @vizij/rig-studio-editors      → hierarchy, control inspector, control map
      @vizij/motion-studio-editors   → expression grid, timeline, program graph, speech
      @vizij/deploy-studio-editors   → publish/export, embed generator, live-control panel
      + @vizij/checkup               → the unified Checkup (shared by shell)
L3  @vizij/face-embed  → <vizij-face> web component + JS control API
      (writeValues/readValues/listKeys/invoke). Consumed BY Deploy Studio's
      Consumer Preview, and shipped to integrators. THE GAP TODAY.
L2  @vizij/components  → viewport frame, transport bar, control inspector,
      expression grid primitives, reference-face — shared by all L4 editors.
L1  @vizij/face-core   → framework-agnostic FaceRuntime controller extracted
      from VizijRuntimeProvider: load package → compose → step → get/set →
      resolve controls → transport. Owns the Face Package data model (§15).
L0  @vizij/arora-web-wasm, @vizij/node-graph-wasm  (unchanged)
```

### Shared core + per-workspace bundles

- **Shared Face Package core (L1).** The project — its rig, expressions, clips,
  programs, speech config, and metadata — lives in `@vizij/face-core`, extracted
  from `VizijRuntimeProvider.tsx` and today's `src/utils/runtimeBundle.ts`
  (already a clean `VizijAssetBundle` builder: `buildRuntimeBaseBundle` /
  `buildRuntimeGraphBundle`). This is the "single project/Face Package core" all
  three workspaces sit on. State management (§16) splits cleanly: **project
  state** (authored entities, history for undo/redo) lives in the core and is
  shared; **view state** (which panel is open, scroll position) is per-workspace
  and disposable.
- **Per-workspace component bundles (L4).** Each workspace is a thin assembly
  package that imports shared L2 components and its own L4 editors. Because the
  Control Inspector, viewport frame, and transport bar are L2, they are authored
  once and composed by whichever workspace needs them — no duplication (see
  Review §4). The authoring app becomes: `shell` + three workspace assemblies +
  shared core.
- **Data model & schemas (§15)** move into `@vizij/face-core`: bindings/rig,
  standard inputs, poses/pose groups, animation clips, programs, and the bundle
  payload. Canonical paths (`rig/{face}/poses/{poseId}.weight`, etc.) are owned
  here and re-exported so no workspace hard-codes them.

### Where the L3 embed fits (Integrator focus)

The L3 `<vizij-face>` web component (foundation §7, the headline gap) is built on
`@vizij/face-core` (no React needed at runtime for the embed's own logic; it
mounts the renderer internally). It matters most to **Deploy Studio**:

- Deploy Studio's **Consumer Preview** renders the face _through the same L3
  embed_ the integrator will ship — dogfooding the deliverable so parity is
  guaranteed.
- **Get Embed** generates the `<script>` + `<vizij-face>` snippet and documents
  the JS control API, which mirrors the live-control wire vocabulary
  (`writeValues`/`readValues`/`listKeys`/`invoke`, foundation §6) so a robot
  stack or host app drives the embed the same way the WebSocket bridge does.
- **Live Control** reuses the standalone bridge vocabulary
  (`apps/vizij-standalone`) — everything reduces to writing normalized floats at
  canonical `rig/{faceId}/…` paths.

---

## 6. Development plan

Clean-slate build with a continuous migration path from today's
`apps/vizij-authoring`. Guiding rule from the foundation: **extract the shared
core first, build workspaces on it, keep shipping.**

### Phase 0 — Extract the shared core (no UI change)

1. Lift the framework-agnostic controller out of `VizijRuntimeProvider.tsx` into
   **`@vizij/face-core`** (L1); drop the vestigial `@vizij/orchestrator-react`
   dependency (foundation §6).
2. Move `src/utils/runtimeBundle.ts` and the authored-entity schemas (§15) into
   the core as the canonical Face Package data model. Add a **real project save**
   distinct from Publish (fixes §18).
3. Ship the core _behind_ the existing app — no user-visible change. Validate
   against `demo-vizij-player` and today's authoring app (per README dev note).

### Phase 1 — Shared shell + component library

1. Build **L2 `@vizij/components`**: viewport frame, transport bar, Control
   Inspector, expression grid primitives — extracted from `src/components/app/*`
   and the editors.
2. Build the **project shell**: workspace switcher (radio group + `1/2/3`),
   global Save, **real undo/redo history** on the core (fixes §18), theme, and
   the Handoff Bar. Add `?ws=` deep-link routing (new capability).
3. At this point the shell can host today's monolith as a single "legacy"
   workspace — proving the frame before splitting.

### Phase 2 — Rig Studio (wrap, then thin out)

1. Assemble **Rig Studio** from L2 components + `@vizij/rig-studio-editors`
   (hierarchy, Control Inspector scene/driver/material modes, Control Map).
2. Fold Import's orientation + discrepancy dialogs into the guided **Import
   Checkup**. Wire the unified **`@vizij/checkup`** package (start with graph +
   robot-data audits, §12).
3. **Wrap vs rewrite:** wrap existing hierarchy/inspector/SFS components
   initially; rewrite only the navigation glue. Keep the legacy workspace live as
   a fallback until Rig Studio reaches parity.

### Phase 3 — Motion Studio

1. Assemble the **Author:** selector over Expressions (poses, §6), Animation
   (timeline, §4), Program (node-graph, §5), Speech (§10).
2. Reuse the Runtime Source Toolbar as the **Drive with** control. Keep the
   Program live-preview `OrchestratorProvider` isolated inside this workspace
   until committed programs run in-device.
3. Rename in UI: poses→Expressions, pose groups→Expression Sets, blend
   stages→Layering (schemas unchanged underneath).

### Phase 4 — Deploy Studio + L3 embed

1. Build **L3 `@vizij/face-embed`** (`<vizij-face>` + JS control API) on
   `@vizij/face-core` — the headline reuse deliverable.
2. Assemble **Deploy Studio**: Consumer Preview (rendered via L3), Publish &
   Embed (reframed Export dialog + snippet generator), and **Live Control**
   mirroring the standalone bridge vocabulary.
3. **Implement SFS export** and wire it into Checkup/Publish (fixes §18).

### Phase 5 — Retire the monolith

1. Remove the legacy-workspace fallback once all three workspaces reach parity;
   delete `App.tsx`'s orchestration role (the ~4,600-line file becomes the thin
   shell assembly). Drop the stray `src/layouts/temp.txt` (§18).
2. Consolidate the four audit panels (§12) fully into `@vizij/checkup`.
3. E2E: per-workspace Playwright smoke + a cross-workspace hand-off workflow
   test (rig → motion → deploy on one project). Keep the existing memory harness.

**Ship-continuously guarantee:** after Phase 1 the app is always runnable —
either via the legacy workspace or the new ones — so no phase requires a big-bang
cutover. Each workspace can reach parity and flip its default independently.
