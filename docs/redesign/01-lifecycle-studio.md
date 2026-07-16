# Proposal A — Lifecycle Studio

_One of four redesign proposals for the Vizij face-authoring front end. Shared
basis: [`00-FOUNDATION.md`](./00-FOUNDATION.md) (personas, the
DEFINE→CONTROL→ANIMATE→DEPLOY lifecycle, the 19-area feature checklist, the arora
runtime contract, and the L0–L4 package target) and the
[`FEATURE_INVENTORY.md`](../../apps/vizij-authoring/docs/FEATURE_INVENTORY.md)._

---

## 1. Thesis

Organize the **entire** front end around the four lifecycle verbs as top-level
modes: **Define → Control → Animate → Deploy**. The user picks a mode (or is
walked through them in order for a brand-new face), and the mode decides which
panels and tools appear — so at any moment the screen shows only what that stage
needs. Today's jargon (rig, binding, driver, motiongraph, IR) is remapped onto
these four stages, giving one app, mode-switched, that teaches itself by matching
the natural mental model of "making a face."

The hard part — some tasks legitimately span stages (tweak a control while
animating; test speech while still rigging) — is handled by a **persistent Stage
(the live face)** that never changes between modes and a lightweight **borrow**
mechanism, not by collapsing the modes back together.

---

## 2. System Requirements Document

### 2a. Front-end organization

**One app, four modes, one persistent Stage.** The lifecycle is the spine of the
IA. Everything else hangs off it.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Vizij Studio   [Quori · Extended]   ● unsaved      ⟲ ↺   ◐   ⚙   Publish │  ← App bar
├──────────────────────────────────────────────────────────────────────────┤
│  ①DEFINE ───────▶ ②CONTROL ──────▶ ③ANIMATE ──────▶ ④DEPLOY   [Checkup ✓] │  ← Lifecycle rail
├───────────────┬──────────────────────────────────────────┬───────────────┤
│               │                                            │               │
│  MODE PANEL   │                THE STAGE                   │   DETAILS     │
│  (left)       │            (live arora face)               │   (right)     │
│               │                                            │               │
│  Stage-       │     ┌────────────────────────────────┐     │  Contextual   │
│  specific     │     │                                │     │  inspector    │
│  tools &      │     │         3D face preview        │     │  for the      │
│  lists.       │     │        (always runtime-        │     │  current      │
│  Changes per  │     │         truthful, arora)       │     │  selection.   │
│  mode.        │     │                                │     │  Changes per  │
│               │     └────────────────────────────────┘     │  mode +       │
│               │     ◀ ▮▮ ▶  ↺   source: [Expression ▾]     │  selection.   │
│               │     (transport shown in CONTROL/ANIMATE)   │               │
├───────────────┴──────────────────────────────────────────┴───────────────┤
│  TIMELINE / GRAPH DRAWER  (opens only in ANIMATE; collapsed otherwise)      │
└──────────────────────────────────────────────────────────────────────────┘
```

Three regions are **constant** across all four modes: the **App bar** (identity,
undo/redo, save state, theme, Publish), the **Lifecycle rail** (mode switch +
Checkup status), and **the Stage** (the live face). Only the **Mode panel**
(left) and **Details** (right) re-skin per mode. This constancy is deliberate:
the face never disappears, so the user always sees the consequence of any edit.

**What each mode contains:**

| Mode | Question | Left "Mode panel" | Right "Details" | Bottom drawer |
|---|---|---|---|---|
| **① Define** | "What can this face do?" | Face Elements tree (hierarchy), Controls list, Materials, Standard Controls (Control Map) | Element inspector: transform / material / morph targets / control range+default | — |
| **② Control** | "Make it do this, now." | Controls board (grouped sliders), Live Control / Connections | Selected-control detail (range, links/formulas, standard-control mapping) | — |
| **③ Animate** | "Make it move / react." | Library: Expressions, Expression Sets, Animations, Programs | Selected-item editor (expression values, clip tracks, program node) | **Timeline** (Animation) or **Graph** (Program) — the one mutually-exclusive heavy surface |
| **④ Deploy** | "Ship it, run it elsewhere." | Face Package summary, Checkup results, Embed & Connections | Selected issue / embed-target detail | — |

**Top-level navigation** is the Lifecycle rail. It is *ordered* (a subtle arrow
chain) because a new face flows Define→Control→Animate→Deploy, but it is *not*
locked — any mode is one click away at any time. A mode you have not "unlocked"
yet (e.g. Deploy before a face is loaded) is dimmed with a tooltip explaining the
prerequisite, never hidden.

**Entry points** (a launcher screen shown before the Stage exists):

- **New face** → prompts for a model (drag a GLB, or pick a preset: Quori,
  Toasty, Hugo). Lands in **Define** with the guided flow active.
- **Open face** → drag/pick an existing Face Package (`.glb` with `VIZIJ_bundle`).
  Lands in **Control** (the face already works; you start by driving it), with a
  banner offering "Continue in Define" if the package looks incomplete.
- **Embed** → not an editor entry at all; it is an **output** of Deploy. The
  launcher's third card, "Embed on my site," opens Deploy directly in read/ship
  mode against an already-published package and generates snippets.

**Cross-stage tasks — the "borrow" rule.** Because the Stage is always live, any
mode can *read* the face. For the common case of needing a tool from another
stage without leaving your flow, a control offers **"Adjust this control"** /
**"Tweak in Define"**: it opens that stage's single relevant editor in a **focused
overlay** on top of the current Stage, commits through the same runtime, and
returns you exactly where you were. You borrow one tool; you do not change modes.
This is the explicit answer to "tweaking a control while animating" (see §4b for
where it strains).

### 2b. User-facing terminology

Refinements to the foundation glossary. The rule: every word names an **intent or
artifact**, never an implementation. Runtime internals (arora, orchestrator,
GraphSpec, IR, device, compile) are **never** shown.

| Foundation term | Lifecycle Studio term | Where it lives | Refinement / note |
|---|---|---|---|
| Control (rig/binding/driver/animatable) | **Control** | Define, Control | Kept. A single driveable knob (an eye's X, a jaw open). |
| link / formula (binding/expression) | **Link** (a control follows another) / **Formula** (a control computed from others) | Define | Split the two: a "Link" is a plain follow; a "Formula" carries math. Users grasp "link" instantly; "formula" only appears when math is added. |
| Standard Controls / Control Map | **Universal Controls** / **Control Map** | Define | "Universal" reads better than "Standard" for the interop promise ("this face speaks the universal control language"). Path shape stays hidden. |
| Expression / Expression Set / Layering / Resting Face | **Expression** / **Expression Set** / **Blend order** / **Resting Face** | Animate | "Layering" → "Blend order" (what it actually decides). "Neutral" → **Resting Face** everywhere. |
| Program / Behavior | **Behavior** | Animate | Prefer **Behavior** as the noun ("this face has an idle Behavior"); "Program" only as the verb-y label on its editor tab. The node graph is *one* editor for a Behavior, not the concept. |
| Animation / Clip / Keyframe | **Animation** / **Keyframe** | Animate | Kept; drop "Clip" from the UI (an Animation *is* the clip). |
| Face Package / Face File | **Face Package** | Deploy, App bar | The one artifact you Save, Publish, embed. |
| Checkup / Validation | **Checkup** | Deploy (+ rail badge) | One reviewable step. Rolls up import discrepancy, RobotData audit, bundle audit, pose/graph validation. |
| Reference / Comparison Face | **Comparison Face** | Define, Control | Kept. |
| Live Control / Connections | **Connections** | Control, Deploy | "Connect a voice / a robot / a remote operator." Speech is one kind of Connection. |
| endpoints (WS/ROS2/Studio) | **Connection types** | Deploy | Named plainly: Web link, Robot (ROS 2), Remote Operator. |
| Save (== export today) | **Save** (working) vs **Publish** (shareable) | App bar / Deploy | Fixes inventory §18: Save writes the working Face Package locally; Publish runs Checkup and produces the deployable/embeddable artifact. Two distinct verbs. |
| arora / orchestrator / IR / GraphSpec / device / compile | _(hidden)_ | — | Never surfaced. |

### 2c. Workflows facilitated

First-person journeys, with the **mode-switch visible** at each hinge.

#### (i) Rig a new imported model

1. I click **New face**, drag `robot_head.glb` onto the launcher. The Stage
   appears with my raw model; I land in **① Define**, guided flow on.
2. Define shows the **Face Elements** tree on the left and my face on the Stage.
   A guided callout says "Let's find your controls." I confirm the model's
   orientation in a single **Checkup** step (folds today's orientation dialog +
   discrepancy wizard into one reviewable card — no "skip checks" trap).
3. I select the left eye in the tree; it highlights on the Stage. In **Details** I
   name a **Control** for its horizontal motion, set its range and resting value
   with Min/Def/Max buttons. I repeat for the controls I care about; morph targets
   and materials are edited from the same Details panel.
4. I add a **Link** so the right eye follows the left, then upgrade it to a
   **Formula** (`right = -left`) for mirrored gaze. Define never mentions graphs.
5. I open **Universal Controls** (still in Define), and the Control Map suggests
   mappings from my named controls onto universal names (`left_eye/pos/x`). A
   coverage meter shows how "universal" my face is. I map the important ones.
6. The Lifecycle rail's **Checkup** badge is green. I click **② Control** to
   sanity-check by hand.

#### (ii) Author an expression + an animation + a program

1. In **② Control** I grab sliders on the **Controls board** and pose a smile by
   hand on the Stage. Happy with it, I hit **"Save as Expression."** The app
   switches me to **③ Animate** and drops me on the new Expression, pre-filled
   from the live values (this is a capture, not a retype).
2. In **Animate**, the left **Library** lists Expressions / Expression Sets /
   Animations / Behaviors. I duplicate the smile into a "big smile," tweak values
   in Details, and group both into an **Expression Set** with a **Blend order**.
3. I switch the Library to **Animations** and click **New**. The **Timeline
   drawer** opens at the bottom (the one heavy surface, mutually exclusive with the
   Graph). I add tracks from the searchable control catalog, double-click to drop
   **keyframes**, drag to retime, set per-keyframe interpolation
   (linear/step/cubic). Transport (play/pause/step/loop/speed) sits under the
   Stage and drives the real face.
4. I switch the Library to **Behaviors** and click **New**. The Timeline drawer
   swaps for the **Graph** editor (nodes/edges, palette, copy-paste, live value
   chart). I wire an idle-gaze Behavior, choosing which controls it reads and
   writes via Input/Output sets. I Play it; the Stage reacts. I mark it the face's
   **starting Behavior** so a deployed face "just behaves."
5. Mid-Behavior I realize one control's range is wrong. I click **"Tweak in
   Define"** on that control — a focused overlay opens the range editor over the
   live Stage, I fix it, close, and I am back in the Graph exactly where I left.

#### (iii) Drive the face live / connect speech

1. From **② Control** I open **Connections** on the left. I pick **Voice** and
   choose a mode: **Echo** (mic → face repeats) or **Conversation** (mic → LLM →
   face responds). I paste my Polly / Deepgram / OpenAI keys into the Connection's
   settings (stored locally, embedded into the package on Publish).
2. I choose a TTS voice; I speak; the Stage lip-syncs via **visemes**, and
   emotion-tagged replies trigger my emotion **Expressions**. The runtime source
   selector under the Stage shows **Voice** is now driving inputs.
3. I add a second Connection — **Remote Operator** — to preview how a live
   operator would push gaze/emotion. The Stage responds to the incoming values at
   the same universal-control paths. Nothing about arora is exposed; I just see
   "Voice" and "Remote Operator" as sources.
4. I flip the runtime source back to **Expression** to confirm my authored looks
   still read correctly alongside live control.

#### (iv) Run a Checkup and publish / deploy + embed

1. I click **④ Deploy**. The left panel shows a **Face Package summary** (controls,
   expressions, animations, behaviors, connections) and the **Checkup** results —
   RobotData audit, bundle-contract audit, universal-control coverage, missing
   targets — each with an "open in the owning mode" link if I need to fix it.
2. One warning: an Animation references a control I renamed. Clicking it jumps me
   to **Animate** with that track selected. I fix it, return to Deploy; Checkup
   re-runs and goes green.
3. I click **Publish**. This produces the shareable **Face Package** (`.glb` with
   `VIZIJ_bundle`) — distinct from the local **Save** I've been doing all along.
   Publish sets the starting Behavior and speech config into the package.
4. Deploy's **Embed & Connections** tab generates ready-to-paste snippets: a
   framework-agnostic **`<vizij-face src="…">`** web-component tag, an iframe, and
   a React `<VizijRuntimeFace>` snippet — each with a JS control example
   (`face.writeValues({...})`). It also lists live **Connection types** (Web link,
   Robot/ROS 2, Remote Operator) for driving the deployed face.
5. I drop the `<vizij-face>` tag onto another site; it loads the package, starts
   its Behavior, and I drive it from my host page's JS. Done — one artifact, no
   arora knowledge required.

### 2d. Accessibility, discoverability, ease-of-use

- **Guided flow for newcomers.** New face → the Lifecycle rail lights the four
  stages in order with inline callouts (reusing today's workbench-guide content).
  The rail is a progress narrative, not a wizard you can't escape — every mode is
  always clickable.
- **Progressive disclosure.** Define opens on just the face + Elements tree +
  "find your controls." Formulas, Universal Controls, blend order, and Behaviors
  reveal only when reached. A first-timer can pose and drive a preset face
  (Control) without ever seeing a graph.
- **Empty states as teachers.** Before a face loads, the Stage shows the existing
  interactive demo (idle/mouse gaze, emotion, voice rows) so a visitor *sees* what
  a finished face does. Each mode has an empty state that states its job and its
  first action ("No expressions yet — pose the face and Save as Expression").
- **Keyboard navigation.** Mode switch on `⌘1–⌘4`; the borrow overlay on `Esc` to
  return. Standard editor keys retained (timeline: space=play, arrows=step;
  graph: copy/paste, delete). Tab order runs App bar → Rail → Mode panel → Stage →
  Details → Drawer, with a visible focus ring and a "skip to Stage" link.
- **Screen-reader & non-color status.** Checkup uses icon+text (✓ pass, ⚠ warn,
  ✕ block), never color alone. The rail announces mode changes via an ARIA live
  region. Controls board sliders carry name, value, range, and units as labels.
- **Real undo/redo** (fixes §18) is global on the App bar (`⌘Z` / `⇧⌘Z`), with a
  visible history scope per mode.
- **Discovering depth.** Every mode has a single "Advanced" affordance in Details
  (e.g. legacy JSON import/export, IR download in Checkup) so power features exist
  without cluttering the default surface.

---

## 3. Feature-coverage matrix

All 19 inventory areas. Nothing dropped silently.

| # | Inventory area | Lands in | Treatment |
|---|---|---|---|
| 1 | App shell, layout & navigation | **All modes** (App bar + Lifecycle rail + Stage) | **Rebuilt.** 4 lifecycle modes replace the 13-panel visibility store, workbench tabs, and 6 edit-focus modes. Resizable regions kept; the mode picks the layout so users don't. |
| 2 | Import | **Define** (entry: New face) | Model load, presets (Quori/Toasty/Hugo), rig-graph/pose JSON import, Comparison Face load. "Skip checks" removed; folded into guided **Checkup**. |
| 3 | Export / Save | **Deploy** + App bar | **Split into Save (working) vs Publish (shareable)** — fixes §18. Export toggles, advanced JSON exports live under Deploy → Advanced. |
| 4 | Keyframe animation editor | **Animate** (Timeline drawer) | Full transport, tracks, keyframes, interpolation, add-track catalog, multiple Animations. Timeline is one of two mutually-exclusive drawers. |
| 5 | Motion-graph editor ("Program") | **Animate** (Graph drawer), as **Behavior** | Full ReactFlow editor, palette, IO sets, live value inspection, playback. Renamed **Behavior**; graph is its editor. Multiple Behaviors; one can be the starting Behavior. |
| 6 | Pose rig authoring (Posing) | **Animate** (Expressions) + capture from **Control** | Poses → **Expressions**; pose groups → **Expression Sets**; blend stages → **Blend order**; neutral → **Resting Face**. Capture-from-live starts in Control. |
| 7 | Inspector (4 modes) | **Details** panel, everywhere | The right panel *is* the inspector; its four modes map by mode — scene object & material & morph in Define, rig-driver in Define/Control, pose in Animate. Chain/breadcrumb kept. Comparison-face scope tabs kept. |
| 8 | Left-sidebar authoring surfaces | **Mode panel**, split by stage | Hierarchy/Materials/Inputs → Define; Controls board → Control; Expressions/Animations/Behaviors library → Animate. One surface per stage instead of all stacked. |
| 9 | 3D viewport / runtime & preview | **The Stage** (constant) | Promoted to the persistent center of every mode. Controls overlay, runtime source selector, empty-state demo, Comparison-face split all retained on the Stage. |
| 10 | Speech & conversational avatar | **Control → Connections** (Voice) | Polly TTS + visemes, Echo/Conversation, Deepgram STT, LLM emotion tags. Reframed as one **Connection** type; config embedded on Publish. |
| 11 | Standard Feature Spaces (mapping) | **Define → Universal Controls** | Renamed **Universal Controls / Control Map** with a coverage meter. **SFS export gap (§18) fixed** — becomes part of the Publish package. |
| 12 | Diagnostics, audits & debug | **Deploy → Checkup** (+ rail badge); debug under Advanced | Discrepancy, RobotData audit, bundle audit, graph diagnostics rolled into one **Checkup**. Memory/debug harness lives under an Advanced/dev toggle, off by default. |
| 13 | Architecture & WASM engines (arora) | **Architecture §5** | Unchanged engine; front end speaks the arora contract only. |
| 14 | Internal `@vizij/*` dependency map | **Architecture §5** | Reorganized onto L0–L4; vestigial `orchestrator-react` dep tracked for removal. |
| 15 | Data model / authored-entity schemas | **Architecture §5** | Unchanged schemas; UI maps them to user terms. |
| 16 | State management | **Architecture §5** | Consolidated behind a mode-aware store + `@vizij/face-core` controller. |
| 17 | Persistence | **Deploy / App bar** | **Adds a real working Save** (local Face Package) distinct from Publish — fixes §18's "Save==export." Local settings (keys/theme) retained. |
| 18 | Known gaps (undo/redo, SFS export, Save==export) | **§2d + this matrix** | **All three fixed:** real global undo/redo; SFS/Universal-Controls export in Publish; Save≠Publish. |
| 19 | Testing & build | **Development plan §6** | Kept (vitest, Playwright, Firebase). New per-package tests as L1–L4 are extracted. |

---

## 4. Review

### 4a. Completeness — anything made awkward or lost?

- **Nothing is dropped.** Every one of the 19 areas has a home (matrix §3). The
  gains are real: three §18 gaps fixed, "skip checks" trap removed, one Checkup
  instead of four audit panels.
- **Awkward: expression authoring straddles Control and Animate.** You *pose* in
  Control (sliders on the live face) but *manage* the result in Animate. The
  "Save as Expression jumps you to Animate" handoff is smooth, but a designer who
  thinks of "making a smile" as one act now touches two modes. Mitigated by the
  jump-and-prefill, but it is the seam most likely to confuse.
- **Awkward: Comparison Face spans Define and Control.** Retargeting a reference
  face is a Define act; co-driving two faces is a Control act. It lives in both,
  which risks a "where did my reference go?" moment when switching modes. We keep
  it available in both and persist its visibility on the Stage.
- **At-risk power feature: the graph.** Renaming motion-graph → **Behavior** and
  hiding it one level down (Animate → Behaviors → editor) is right for newcomers
  but adds a click for the power user who lives in the graph all day. Acceptable,
  but worth a "pin the graph" preference.
- **Debug/memory harness demoted.** Moving it under an Advanced/dev toggle is
  correct for users but means an internal dev must opt in. Fine, but document it.

### 4b. Simplicity — where does this add friction?

- **The mode model is a bet that tasks cluster by stage. They mostly do — but not
  always.** The honest strain: *iterating* a face is not linear. You author an
  expression (Animate), notice a control range is wrong (Define), fix it, test
  live (Control), and loop. The **borrow overlay** ("Tweak in Define") is the
  pressure valve, but if a user borrows constantly, the modes start to feel like
  friction instead of focus. If usage data shows heavy borrowing between two
  specific stages, that is a signal the boundary is drawn wrong — the design must
  be willing to merge Control's Controls board into Animate as a docked strip.
- **First-timer hits.** (1) The Control/Animate expression seam above. (2) The
  ordered-but-not-locked rail: some users will read the arrows as a wizard and feel
  blocked; the "always clickable, dimmed-with-reason" treatment must be obvious.
  (3) "Save vs Publish" is a new distinction — clearer than today's silent
  "Save==export," but two verbs still need a one-line explainer on first use.
- **Two heavy drawers, one slot.** Timeline and Graph are mutually exclusive at
  the bottom (inherited from today's exclusive-center rule). A user animating
  *and* wiring a Behavior that reacts to that animation must toggle between them.
  This is a real limit; we accept it to keep the Stage central and the layout
  legible.
- **Where it is genuinely simpler:** a newcomer with a preset face never leaves
  Control — pick a face, drive it, connect a voice — and never sees a graph, an
  IR, or the word "rig." That is the win the mode model buys.

---

## 5. Architecture

### 5a. Decomposition onto L0–L4

Lifecycle Studio is a **thin assembly of L4 editor surfaces over an L2 React kit,
over the L1 headless controller, over the L0 engines** — exactly the foundation
baseline. Each mode is a composition of packaged components; the app owns almost
no runtime logic.

| Layer | Package | What Lifecycle Studio uses it for |
|---|---|---|
| **L0** | `@vizij/arora-web-wasm`, `@vizij/node-graph-wasm` | Unchanged engines. Never touched directly by the app. |
| **L1** | **`@vizij/face-core`** (new) | Framework-agnostic `FaceRuntime` controller extracted from `VizijRuntimeProvider.tsx`: load package → compose → step → get/set inputs → resolve controls → transport. All four modes read/write the face through this. |
| **L2** | `@vizij/runtime-react` (exists) + **`@vizij/components`** (new) | Provider/hooks + extracted functional components: Stage frame, controls overlay, transport bar, Controls board, Comparison-face split. The constant Stage is one `@vizij/components` piece reused by every mode. |
| **L3** | **`<vizij-face>` embed** (new) | The Deploy output. Wraps L1 in a web component + iframe + JS control API (`writeValues`/`readValues`/`listKeys`/`invoke`) mirroring the standalone WS vocabulary. |
| **L4** | **editor surfaces** (extracted) | One per stage's heavy tool: rigging inspector + Control Map (Define), Expression/pose editor (Animate), Timeline editor (Animate), Behavior/graph editor (Animate), Checkup (Deploy). The app imports these into modes. |

**Modes ⇒ components mapping.** A mode is a layout that mounts a subset of L2/L4
pieces around the constant `<Stage>`:

- **Define** = `<Stage>` + `HierarchyTree` + `ControlInspector` + `MaterialEditor`
  + `ControlMapEditor` (L4) + Checkup card.
- **Control** = `<Stage>` + `ControlsBoard` (L2) + `ConnectionsPanel`
  (Voice/Robot/Operator) + transport.
- **Animate** = `<Stage>` + `LibraryPanel` + one of `{ExpressionEditor,
  TimelineEditor, BehaviorEditor}` (L4) in the drawer.
- **Deploy** = `<Stage>` + `PackageSummary` + `Checkup` (L4) + `EmbedPanel`
  (emits L3 snippets).

### 5b. Preserving the arora contract

Non-negotiable; every mode obeys the foundation's four invariants:

1. **One composed graph, one device per face.** All authored sources (rig, pose,
   Behaviors) still compose into a single `{nodes, edges}` run by one arora device
   per Stage. Multiple faces (Comparison Face) = multiple `VizijRuntimeProvider`
   instances with distinct namespaces — the design mounts a second provider, never
   a second device inside one.
2. **Unprefixed `params.path` is the cross-graph contract.** The Controls board,
   Timeline, and Behaviors all read/write the *same* canonical paths (e.g.
   `rig/{faceId}/poses/{poseId}.weight`); a value written by one mode is read by
   another next tick. The UI never invents paths — it resolves them via
   `resolveFaceControls()` / `inputConstraints` / pose-group structure, per the
   README's auto-detection contract.
3. **`ValueJSON` I/O with step-in-ms / drain loop.** The Stage steps the device by
   `dt` ms and drains changed keys into the render store (pull model). All four
   modes share this one loop; borrowing a tool does not spin up a second loop.
4. **Hot updates via `setGraphBundle(bundle, {tier})`.** Every authoring edit
   (add a control, edit an expression, rewire a Behavior) pushes
   `tier: "graphs"`; only re-importing a model uses `tier: "assets"`. This is the
   sole authoring→runtime entry point. The app **never** calls the device
   directly — it speaks `VizijAssetBundle` / `RuntimeGraphBundle` and goes through
   `@vizij/runtime-react` / `@vizij/face-core`.

**Two sharp edges tracked.** (a) `runtime-react`'s vestigial
`@vizij/orchestrator-react` dependency — L1 extraction is the moment to drop it.
(b) The motion-graph editor's live preview still runs on its own
`OrchestratorProvider` (`orchestrator-wasm`). In this design the **Behavior editor
previews inside the Stage's arora device via `setGraphBundle({tier:"graphs"})`**,
retiring the separate orchestrator preview — a committed and a previewing Behavior
run the same way. This is a hard requirement of the migration, not a nicety.

### 5c. Reuse boundaries & the L3 embed

- **L1/L2 is the reuse core.** Any host (this Studio, `demo-vizij-player`, a
  third-party site) drives a face through the same L1 controller and L2
  components. The Studio adds only L4 editors and the mode shell.
- **L3 `<vizij-face>` is the headline deliverable** and is produced *by Deploy*.
  Its JS API mirrors the `apps/vizij-standalone` wire vocabulary
  (`write_values`/`read_values`/`list_keys`/`invoke` + `values_changed`), so the
  same host code drives an embedded face or a robot over WS/ROS 2/Zenoh. Deploy's
  Embed panel is literally a snippet generator for L3.
- **Connections** in Control/Deploy are thin clients over the same vocabulary:
  Voice (speech-react), Robot (ROS 2), Remote Operator (Studio/Zenoh) — all
  writing normalized floats at canonical `rig/{faceId}/...` paths.

---

## 6. Development plan

### 6a. Phased clean-slate build

| Phase | Milestone | Ships |
|---|---|---|
| **P0 — Spine** | App bar + Lifecycle rail + constant Stage, mode routing, real undo/redo, Save-vs-Publish plumbing | A shell that loads a preset face and switches modes with an empty right/left per mode. |
| **P1 — Control first** | Controls board + transport + runtime source selector on the Stage | A user can open a package and drive a face by hand. (Earliest useful product; also the simplest mode.) |
| **P2 — Define** | Hierarchy, control inspector, materials/morphs, Link/Formula, Universal Controls + coverage | Rig a new imported model end-to-end; guided Checkup replaces skip-checks. |
| **P3 — Animate** | Library + Expression editor + Timeline drawer + Behavior/graph drawer (previewing via `setGraphBundle`) | Author expressions, animations, behaviors; capture-from-Control handoff. |
| **P4 — Connections** | Voice (Polly/Deepgram/LLM), Remote Operator, Robot | Live speech + external drive. |
| **P5 — Deploy** | Package summary, unified Checkup, Publish, Embed panel emitting L3 snippets | Full lifecycle + the framework-agnostic embed (today's gap). |

Each phase is shippable: the tool is usable after P1 for driving, after P2 for
rigging, and complete after P5.

### 6b. Migration from today's `vizij-authoring`

The goal is to **keep shipping** while dismantling the ~5,300-line `App.tsx`
(`apps/vizij-authoring/src/App.tsx`) and its 13-panel store. Strategy: **extract
into packages first, then reassemble as modes.**

1. **Extract L1 `@vizij/face-core` first.** Pull the framework-agnostic controller
   out of `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx` (load →
   compose → step → get/set → transport). Rewire `runtime-react` to consume it.
   Drop the vestigial `@vizij/orchestrator-react` dep here. Lowest-risk, highest-
   leverage — everything else depends on it.
2. **Lift the Face Package builder into a package.** `src/utils/runtimeBundle.ts`
   (`buildRuntimeBaseBundle` / `buildRuntimeGraphBundle`) already speaks
   `VizijAssetBundle` — move it beside `face-core` as the canonical package
   builder for Save/Publish.
3. **Extract L2 components as-is (wrap, don't rewrite).** The Stage frame, controls
   overlay, reference-face split, and empty-state demo in
   `src/components/app/*` are already functional; move them to `@vizij/components`
   behind stable props. `RigControllerProvider`'s runtime concerns fold into
   `face-core`; its authoring-state concerns stay app-side for now.
4. **Wrap the four heavy editors as L4, keep their internals.** The Timeline
   (`src/components/animation/*`), the motion-graph editor (`src/motiongraph/*`),
   the pose/expression editor (`src/poseRig/*` + inspector sections), and the
   audits (`bundleAudit.ts`, `robotDataAudit.ts`, discrepancy) are large and
   working — **wrap** them as L4 packages with clean prop boundaries; do **not**
   rewrite their logic. The one required behavior change: the Behavior editor
   previews through the Stage's arora device (`setGraphBundle`), retiring its
   private `OrchestratorProvider`.
5. **Build the mode shell in parallel behind a flag.** Stand up the App
   bar + rail + Stage (P0) in the same app behind a `?studio=1` flag, composing the
   extracted packages. The legacy 13-panel UI keeps working until each mode reaches
   parity, then flips per-mode.
6. **Consolidate state last.** Replace the panel-visibility / edit-focus / workbench
   stores (`src/state/workspaceStore.ts`, `AuthoringUiProvider.tsx`,
   `workbenchConfig.ts`) with a single mode-aware store once modes are the only UI.
   Keep the provider-scoped face stores; they map cleanly onto `face-core`.
7. **Add the SFS/Universal-Controls export, real Save, and global undo/redo** as
   part of P2/P0 respectively — these are the §18 fixes and are new code, not
   migrations.
8. **Ship L3 `<vizij-face>` last (P5)**, built on the now-stable L1 — the deliverable
   that does not exist today.

Testing rides along: keep the Playwright smoke/workflow suites green against the
flagged app; add per-package vitest suites as L1–L4 land; validate every runtime
change against one bundle-first app (`demo-vizij-player`) and the Studio, per the
`runtime-react` README's guidance.
