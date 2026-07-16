# Proposal D — Progressive-Disclosure Canvas

_One of four redesign proposals. Shares the personas, lifecycle spine, feature
checklist, terminology, runtime contract, and L0–L4 package targets defined in
[`00-FOUNDATION.md`](./00-FOUNDATION.md). Read that first. Feature areas cited as
"§N" refer to
[`apps/vizij-authoring/docs/FEATURE_INVENTORY.md`](../../apps/vizij-authoring/docs/FEATURE_INVENTORY.md)._

---

## 1. Thesis

The 3D face is the interface. A single always-present canvas holds the center;
everything you can do is reached by **acting on the face** — click a mesh, hover
a control, drag a value — and a single **contextual inspector** shows exactly the
tools relevant to what you touched. Complexity is revealed on demand through
three disclosure levels (novice → intermediate → expert), never laid out as a
dozen standing panels, and never hidden from a power user who knows what they
want — a command palette, pinning, and a one-key **Expert Mode** give experts
full density and speed without forcing beginners through it.

---

## 2. Structured Requirements Document (SRD)

### 2a. Front-end organization

#### The core loop: selection drives the UI

Today's app already contains the seed of this model. `selectionStore.tsx` keeps
a `selectionStack: Selection[]` and the inspector
(`components/inspector/InspectorPanel.tsx`) switches between four modes — scene
object / rig driver / pose / material — based on what is selected. Proposal D
takes that latent idea and makes it **the** organizing principle: there is no
persistent panel taxonomy to learn, only _the face_ and _the thing you last
touched_.

```
                 ┌──────────────┐
   click / hover │  3D FACE     │  selection or hover
   on the face → │  (canvas)    │ ─────────────┐
                 └──────────────┘              ▼
                        ▲            resolveFaceControls() +
                        │            inputConstraints resolve
        runtime write   │            metadata for the target
        (setInput,      │                     │
         setGraphBundle)│                     ▼
                        │            ┌──────────────────────┐
                        └────────────│ CONTEXTUAL INSPECTOR │
                                     │ shows only relevant   │
                                     │ tools for the target  │
                                     └──────────────────────┘
```

Every edit is runtime-truthful: the inspector writes through
`@vizij/runtime-react` (`setInput`, `setGraphBundle`, transport calls) and the
canvas reflects it on the next tick. There is no "preview vs edit" split — you
are always editing the live face.

#### Canvas-centric information architecture

The IA has exactly **three durable regions** plus transient overlays:

1. **Canvas** (always, center-and-most-of-screen) — the live arora-driven face.
2. **Contextual Inspector** (right rail, collapsible) — controls for the current
   selection/hover. Empty state = a short "click the face to begin" affordance.
3. **Transport + Status strip** (bottom, thin) — play/pause/scrub for whatever
   source is currently driving the face (expression, animation, program, speech,
   live), plus non-color status (see 2d).

Transient, summoned overlays (not standing panels):

- **Command palette** (`⌘K`) — search-driven access to every action and object.
- **Sheets** — a dense editor (timeline, program graph, control map) slides up
  or docks as a bottom/side **sheet** only when that mode is active, then
  dismisses. This is how dense editors coexist with a minimal default.
- **Pins** — any inspector section or a mini-control can be pinned to a
  left utility rail for at-a-glance multi-control work.

#### Disclosure levels

Level is a per-user preference (persisted), not a mode you must manage per task.
It gates _default density_, never capability — an expert action is always one
`⌘K` away regardless of level.

| Level | Who | Canvas interaction | Inspector shows | Hidden until asked |
|---|---|---|---|---|
| **L-Novice** (default) | first-timer, integrator poking around | click a region → one grouped slider set ("eyes", "mouth"); drag directly | resolved **Standard Controls** for the clicked region, plus "Try an expression" chips | raw control paths, ranges, formulas, programs, maps |
| **L-Intermediate** | motion designer, returning user | click a mesh or control → that control | full control (value/min/def/max, rename, lock), expression capture, "add to animation" | node graph internals, IR, audits, SFS mapping editor |
| **L-Expert** | rig author, power user | click anything; marquee-select; right-click context actions | everything: driver path, formula editor, connections, morph targets, per-keyframe interpolation, control-map cells | nothing — plus Expert Mode reveals docked dense sheets and a persistent object list |

Switching L-Novice→L-Expert is a single toggle in the status strip (and
`⌘K → "Expert Mode"`). Crucially, **disclosure is additive**: raising the level
adds sections/affordances to the _same_ contextual inspector; it never
rearranges the layout, so muscle memory survives.

#### Command palette / search-driven discovery

The palette is the antidote to "progressive disclosure hides things." It indexes:

- **Actions** — Import, Export/Publish, Run Checkup, New Expression, New
  Animation, New Program, Connect Live Control, Map Standard Controls, Undo…
- **Objects** — every control, expression, expression set, animation clip,
  program, material, standard-control channel — searchable by name or path.
- **Navigation** — "Go to mouth controls", "Open timeline for Wave clip".

Selecting an object result **selects it on the face** (highlights the mesh,
opens its inspector) — so search and direct manipulation are the same door.
Fuzzy, keyboard-first, shows the keybind for each result so users learn the fast
path by using the slow one.

#### Entry points

- **Cold start (no face):** the canvas shows the existing empty-state
  interactive demo (`components/app/emptyStateDemo/*`) — a gaze/emotion/voice
  toy — with two calls to action: **Import a model** and **Start from a preset**
  (Quori / Toasty / Hugo). This is the current `Get Started` header idea, made
  the whole screen.
- **After load:** face is centered and idle-animated; a one-line coach mark says
  "Click the face to tweak it, or press ⌘K." Nothing else competes for
  attention.
- **Returning to a Face Package:** open a `.glb` → same canvas, last selection
  and disclosure level restored.

#### ASCII layout — default (minimal / L-Novice)

```
┌────────────────────────────────────────────────────────────────────┐
│  Vizij   Quori.glb ●            ⌘K search…            [Publish] ◐/◑  │  top bar: file, palette, publish, theme
├──────────────────────────────────────────────┬─────────────────────┤
│                                                │  INSPECTOR          │
│                                                │  ── Eyes ──         │
│                                                │  gaze  ◄────●────►   │  grouped Standard Controls
│                 ( live 3D face )               │  blink [   ● ]      │  for the clicked region only
│                 click a region                 │                     │
│                                                │  Try:  😊  😳  😴    │  expression chips (novice)
│                                                │                     │
│                                                │  ⌵ show more…        │  reveals L-Intermediate depth
├──────────────────────────────────────────────┴─────────────────────┤
│  ▶  ■  ◀◀ ─────────●──────── 0:03 / 0:12   Source: Idle   ● ready    │  transport + non-color status
└────────────────────────────────────────────────────────────────────┘
```

#### ASCII layout — expanded (Expert Mode, timeline sheet docked)

```
┌────────────────────────────────────────────────────────────────────┐
│  Vizij   Quori.glb ●   ⌘K   [Novice|Inter|▣Expert]   [Publish] ◐/◑   │
├───┬────────────────────────────────────────────┬────────────────────┤
│ P │                                             │  INSPECTOR (rig)    │
│ I │                                             │  jaw_open           │
│ N │            ( live 3D face )                 │  path rig/…/jaw ⓘ   │  expert: real path shown
│ S │       mesh "jaw" selected (glow)            │  val ●──── 0.42     │
│   │                                             │  min 0  def 0 max 1 │
│ ⋮ │                                             │  formula  ⌵         │  expression/link editor
│ ⋮ │                                             │  connections ⌵      │  parent/child links
├───┴────────────────────────────────────────────┴────────────────────┤
│ TIMELINE  clip: Wave ▾   [+track]        ▶ ■  ◀◀ ──●── 0:03/0:12      │  dense editor as docked SHEET
│ jaw_open  ●───────◆────────────◆─────────────●   (linear)            │
│ brow_L    ────◆──────◆──────────────◆───────────  (cubic)            │
│ gaze_x    ●────────────────◆────────────────────  (step)             │
├───────────────────────────────────────────────── status: ● ready ───┘
   ▲ left PIN rail: pinned controls / mini-sliders for cross-cutting work
```

The dense editor is **the same canvas + inspector**, with a sheet added. The
face never disappears; you keyframe while watching it move.

---

### 2b. User-facing terminology

Adopts the FOUNDATION §5 starter glossary; refinements below reflect the
canvas-first framing (verbs of _direct manipulation_, not panel names).

| FOUNDATION term | Proposal D refinement | Why |
|---|---|---|
| Control | **Control** (kept). Verb: "tweak/drive a control" | Direct-manipulation verb reinforces click-the-face model |
| Standard Controls / Control Map | **Standard Controls** (per-control) / **Control Map** (the mapping surface) | The map is reached from a control's inspector ("map this to a standard control"), not a separate workbench |
| Expression / Expression Set | **Expression** / **Expression Set**; capture verb = **"Snapshot as expression"** | Snapshot = capture-from-current-values, the primary novice authoring act |
| Program / Behavior | **Behavior** (concept) authored in the **Behavior editor** (graph) | "Behavior" is what beginners understand; "graph" is just its editor's shape |
| Animation / Clip / Keyframe | **Animation** / **Clip** / **Keyframe** (kept) | Already clear |
| Face Package | **Face Package** (kept). Actions: **Publish** (deploy) vs **Save** (working) | Fixes today's Save==export confusion (§18) |
| Checkup / Validation | **Checkup** (kept) — surfaced as an inline **health chip** | Non-modal, non-color status in the strip |
| Live Control / Connections | **Live Control** (kept) — "Connect" from the transport strip | Framed as a driving source, peer to expression/animation |
| Reference Face | **Comparison Face** | "Compare" is the verb; appears as a second ghosted face on-canvas |
| _(hidden)_ | orchestrator, IR, GraphSpec, arora device, propsrig, animatable, binding, pipeline stage — **never shown** | Runtime internals; expert path/formula UIs show canonical **paths** only |

---

### 2c. Workflows facilitated (first-person journeys)

**Rig a model (DEFINE) — "click a mesh, define a control".**
> I drop `newbot.glb` on the canvas. It loads and I confirm orientation inline (a
> ghost arrow on the face, "is this up?"). I click the jaw mesh — the inspector
> shows its transform and a button **"Make this a control"**. I click it, name it
> _jaw_open_, drag the jaw in the viewport to set the max, and the range fills in
> from `inputConstraints`. A health chip says "3 meshes not yet controlled" — I
> click it to see them highlighted on the face. I repeat for the eyes. When I
> want interop, the jaw control's inspector has **"Map to Standard Control"** →
> I pick `mouth/jaw/open`; the Control Map sheet opens focused on that cell.

**Author expression + animation + program (ANIMATE).**
> With controls in place, I drag sliders until the face smiles, then hit
> **Snapshot as expression** → _smile_. I do it again for _blink_. To animate, I
> press `⌘K → New Animation`; the timeline sheet docks. I scrub, tweak controls
> on the face, and double-click a lane to drop keyframes — the face plays back
> live. For reactivity I open the **Behavior editor** (a graph sheet): I drag an
> Input Source (`/speech/speaking`) → an oscillator → the _jaw_open_ Output
> Target. I hit play in the strip and the mouth flaps. Committing the behavior
> pushes it into the composed graph via `setGraphBundle({programs})`.

**Drive live / speech (CONTROL).**
> From the transport strip I open **Source ▾** and pick **Speech**. I paste a
> Polly key (stored locally), type a sentence, and the face lip-syncs via
> visemes. Switching **Source ▾ → Live Control**, I get a connection card: a
> WebSocket URL to copy into my robot stack. Incoming `write_values` at
> `rig/{face}/…` paths drive the on-canvas face in real time; the status chip
> shows "Live: 42 keys/s".

**Checkup + publish + embed (DEPLOY).**
> The health chip turns amber: "SFS coverage 80%, 2 controls unmapped." I click
> it → a **Checkup** sheet lists issues, each with a "reveal on face" and a fix
> action; nothing blocks me but publishing warns. I press **Publish** → I choose
> embed options (bundle on, blend modes), and get (a) a downloaded Face Package
> `.glb` and (b) a copy-paste `<vizij-face src="…">` snippet plus a JS
> `writeValues()` example. I paste the tag into my site; the L3 embed renders the
> exact face I just authored.

---

### 2d. Accessibility, discoverability, ease-of-use (the strong suit)

**Ease-of-use / lowest floor.**
- The _only_ thing a newcomer must learn is "click the face." No panel tour, no
  mode vocabulary. The empty-state demo teaches the interaction before any face
  is even loaded.
- Disclosure is additive and layout-stable: raising the level never moves
  existing controls, so learning is monotonic.

**Discoverability without a menu tour.**
- `⌘K` is the master index — every action and object is findable by typing, and
  each result shows its keybind so the fast path is learned in passing.
- **Progressive reveal is signposted:** every collapsed depth is a labeled
  "⌵ show more" / "map to standard control" / "add formula" affordance _in
  context_, so capability advertises itself exactly where it applies.
- Selecting a search result highlights the corresponding mesh — search and
  canvas reinforce each other.

**Keyboard.**
- Full keyboard path: `Tab`/`Shift+Tab` cycles canvas-selectable regions (with a
  visible focus ring on the mesh), `Enter` opens its inspector, arrow keys nudge
  the focused slider (with `Shift` for coarse), `⌘K` for anything.
- Timeline: arrow keys move the playhead, `[`/`]` jump keyframes, `Enter`
  edits the selected keyframe — no pointer required.
- Behavior graph: keyboard node creation via palette search (`/` opens it),
  `Tab` between ports; a "linearized list" alt-view (see §5, §3-area-5) is fully
  keyboard-operable for users who can't drag on a canvas.

**Screen-reader.**
- The canvas exposes an **accessible object tree** mirroring the hierarchy:
  each selectable region is an ARIA node named from its control
  (`resolveFaceControls`) with role/value, so a face is navigable without sight.
- Every slider is a labeled `role="slider"` with `aria-valuemin/max/now` from
  `inputConstraints`; value changes announce live.
- Selection changes announce the target ("jaw control selected, value 0.42").
- The command palette is a standard combobox pattern (listbox + `aria-activedescendant`).

**Focus order.**
- Deterministic: top bar → canvas → inspector → transport. Opening a sheet traps
  focus within it and returns focus to the triggering control on close.

**Non-color status.**
- The single **health chip** uses shape + text, not just color: `● ready`,
  `▲ 2 warnings`, `✕ blocked`. Live-control state shows a text rate. Dirty state
  is a `●` next to the filename plus the word "unsaved," never color alone.
- Keyframe interpolation is shown by glyph (◆ cubic, ● linear, ▪ step), not hue.

---

## 3. Feature-coverage matrix

All 19 inventory areas. Nothing dropped. Column "Where in Proposal D" states how
each surfaces in the canvas/contextual/disclosure model.

| # | Inventory area | Where in Proposal D | Disposition |
|---|---|---|---|
| 1 | Shell, layout & navigation (§1) | Collapses 13 panels + 4 nav mechanisms into **canvas + contextual inspector + transport strip + palette**. Edit-focus modes → disclosure levels; workbench tabs → contextual actions on the target | **Merged/renamed** — biggest simplification |
| 2 | Import (§2) | Drag-onto-canvas or `⌘K → Import`. Orientation + discrepancy folded into an **inline, on-face Checkup** (ghost arrow, reveal-on-face); "skip checks" becomes "review later" | **Merged** into guided load |
| 3 | Export / Save (§3) | **Publish** (Face Package + embed snippet) is a top-bar action; **Save** is a genuine working-state save (fixes §18). Export toggles live in the Publish sheet | **Renamed + gap fixed** |
| 4 | Keyframe animation editor (§4) | **Timeline sheet** docked from the transport strip; transport controls _are_ the strip. Authoring is canvas-first: scrub, tweak control on face, double-click lane to key. Dense but summoned | **Kept as docked sheet** (hard case — see Review) |
| 5 | Motion-graph editor / "Program" (§5) | **Behavior editor** sheet (ReactFlow graph). Reached from a control ("drive this with a behavior") or `⌘K`. Ships a keyboard-first **linearized rule-list alt-view** for a11y/novices | **Kept as sheet + new alt-view** |
| 6 | Pose rig authoring / Posing (§6) | **Expressions.** Snapshot-from-canvas is the primary act; groups/blend stages/neutral live in an **Expression Set** inspector (intermediate+). Layering pipeline surfaces as an ordered list under "Layering" | **Renamed** (pose→expression) |
| 7 | Inspector, 4 modes (§7) | This _is_ the contextual inspector — its four modes become selection-driven views. Chain/breadcrumb nav kept as a "related" trail. Formula/connections/morph under expert disclosure | **Core mechanism** |
| 8 | Left-sidebar authoring surfaces (§8) | No standing left sidebar by default. Hierarchy/variables/materials/inputs are reachable via `⌘K` (as object search) and via Expert Mode's optional **object list** (left rail). Materials edited by clicking a mesh's material | **Merged into palette + canvas selection** |
| 9 | 3D viewport / runtime & preview (§9) | **The center of everything** — always present, always arora-driven. Overlay controls, source toolbar → transport strip. Empty-state demo = cold-start entry. Comparison Face = second ghosted face on-canvas | **Elevated to primary** |
| 10 | Speech & conversational avatar (§10) | A **driving Source** in the transport strip (Speech). Config (Polly/Deepgram/LLM keys) in a Speech sheet; PAP input mapping auto-provisioned as today. Emotion tags trigger Expressions | **Kept as a source** |
| 11 | Standard Feature Spaces / mapping (§11) | **Control Map** sheet, reached per-control ("Map to Standard Control") or globally via `⌘K`. Coverage shown as the health chip + reveal-on-face. **SFS export implemented** (fixes §18) | **Renamed + gap fixed** (hard case) |
| 12 | Diagnostics, audits & debug (§12) | Unified **Checkup** sheet: rig-graph, RobotData, bundle audits, graph diagnostics in one issue list, each with reveal-on-face + fix. Debug/memory harness behind Expert Mode | **Merged** into Checkup |
| 13 | Architecture & WASM engines / arora (§13) | Unchanged engine. See §5 (Architecture) — single composed graph, one device per `VizijRuntimeProvider` | **Preserved (substrate)** |
| 14 | Internal `@vizij/*` dep map (§14) | Repackaged onto L0–L4; see §5. Vestigial `orchestrator-react` tracked | **Substrate / repackage** |
| 15 | Data model / schemas (§15) | Unchanged authored-entity schemas (poses, clips, programs, bundle). UI labels change, paths do not | **Preserved (substrate)** |
| 16 | State management (§16) | `selectionStore` becomes the UI's spine (selection→inspector). Zustand/context stores kept; add a real history store (§18) | **Preserved + extended** |
| 17 | Persistence (§17) | Adds a real **Save** (working document) distinct from Publish; still GLB-backed. Disclosure level + last selection persisted | **Extended (gap fix)** |
| 18 | Known gaps (§18) | **Real undo/redo** (history store, `⌘Z`), **Save≠Publish**, **SFS export** all fixed by design | **Fixed** |
| 19 | Testing & build (§19) | Vitest + Playwright retained; new e2e for selection→inspector, palette, disclosure levels, keyboard/a11y flows | **Preserved + extended** |

### The hard cases: dense editors in a contextual/disclosure model

Progressive disclosure's real risk is the **timeline (§4)**, **behavior graph
(§5)**, and **control-map (§11)** — inherently dense, many-element editors that
resist "show one relevant thing." Proposal D's answer is the **sheet**:

- A sheet is a full-width (or side) surface **summoned by context** — you enter
  the timeline by choosing to animate a control, enter the map by choosing to
  map one, enter the graph by choosing to give a control a behavior. Entry is
  always _from a target_, so the dense surface opens **pre-focused** on that
  target (that control's track selected; that control's map cell highlighted;
  that Output Target node placed). This preserves "contextual" without pretending
  a timeline is a slider.
- The canvas stays visible above/beside the sheet — you never lose runtime
  truth while editing dense data.
- Sheets are dismissible and, in Expert Mode, **dockable** so a power user can
  keep the timeline open across selections (see Review for the tension this
  resolves).
- The **control map** additionally gets a grid view (namespace × channel) that is
  _not_ contextual — it is the one place where the "one thing at a time" model is
  explicitly abandoned in favor of a spreadsheet, because coverage work is
  inherently tabular. Reached only via `⌘K → Map Standard Controls`.

---

## 4. Review — self-critique

**Completeness.**
- All 19 areas land; three gaps (undo/redo, Save≠Publish, SFS export) are fixed
  by design rather than deferred.
- Risk: the left sidebar's browse-everything surfaces (§8) become
  search-dependent. Mitigation: Expert Mode's optional object list restores a
  persistent tree for users who prefer browsing to searching. If usability
  testing shows novices flounder without _any_ list, promote a minimal
  "Controls" list to intermediate.

**Simplicity — does it actually simplify?**
- Yes at the floor: one interaction (click the face) replaces four navigation
  mechanisms. The cognitive model is a single sentence.
- Honest cost: the model pushes complexity into `⌘K` and sheets. A user who
  doesn't discover the palette could feel capability is missing. Mitigation:
  persistent coach mark, palette keybind shown on every result, and in-context
  "show more/map/behavior" affordances so features advertise locally.

**Do dense editors get awkward? (the central worry).**
- Partly, and I won't pretend otherwise. A timeline or node graph is not a
  "contextual inspector" and jamming it into the right rail would be a disaster —
  hence sheets, which are honest about being big. The awkward seam is
  **multi-target dense work**: keyframing five controls while flipping between
  them. Pure contextual disclosure would reopen the sheet each time. The
  **dockable sheet + pin rail** in Expert Mode is the escape hatch, but it means
  the "one contextual thing" purity breaks exactly where experts live. I accept
  this: purity for novices, docked density for experts, one toggle between.
- The **control-map grid** is a deliberate, admitted exception to the whole
  thesis — tabular coverage work needs a table. Calling that out beats
  contorting it.

**Expert-speed concerns.**
- The chief objection to progressive disclosure is "it slows people who already
  know." Proposal D answers with: (1) `⌘K` reaches any action/object in a few
  keystrokes — often faster than today's panel-hunting; (2) Expert Mode makes
  dense sheets persistent and adds the object list, so experts get the
  many-tools-at-once density they need; (3) pins keep frequently-used controls
  one glance away; (4) disclosure level is a sticky preference, so an expert sets
  it once and never re-navigates it.
- Residual risk: an expert who wants three dense editors visible simultaneously
  (timeline + graph + map) is constrained — sheets are designed to be one-at-a-time
  primary with docking. This is a real limitation vs. a freeform multi-panel IDE
  (see Proposal B). Deliberate trade: we optimize the 95% single-focus case and
  accept the power-tiling case is weaker.

---

## 5. Architecture

### Decomposition onto L0–L4 (FOUNDATION §7)

Proposal D is a **thin L4 assembly** over the shared stack; its distinctive
pieces are a **selection→inspector binding layer** and a **contextual-inspector
registry**, both of which live at L4/L2 and depend only on runtime-resolved
metadata.

| Layer | Contents for Proposal D | New vs. exists |
|---|---|---|
| **L0** engines | `@vizij/arora-web-wasm`, `@vizij/node-graph-wasm`, `@vizij/animation-wasm`, `@vizij/orchestrator-wasm` (graph-editor live preview only) | Exists, unchanged |
| **L1** `@vizij/face-core` | Framework-agnostic `FaceRuntime` controller extracted from `VizijRuntimeProvider.tsx`: load package → compose → step → get/set inputs → `resolveFaceControls` → transport. Powers L3 and non-React hosts | New (shared with all proposals) |
| **L2** `@vizij/components` | `@vizij/runtime-react` (exists) + extracted: **CanvasFace** (viewport frame from `Viewer.tsx`), **ContextualInspector** shell + section registry, **TransportStrip**, **CommandPalette**, **HealthChip**, **TimelineSheet**, **BehaviorSheet**, **ControlMapSheet**, **ExpressionInspector** | New extractions |
| **L3** embed | `<vizij-face>` web component wrapping L1 `FaceRuntime`; JS control API (`writeValues`/`readValues`/`listKeys`/`invoke`) mirroring the standalone WS vocabulary. The **Publish** flow emits the embed snippet | New (headline gap) |
| **L4** `vizij-authoring` app | Thin shell: mounts `VizijRuntimeProvider` + CanvasFace, wires `selectionStore`→ContextualInspector, registers which inspector sections/sheets exist per disclosure level, hosts palette | Rebuilt as assembly |

### The arora contract — preserved exactly (FOUNDATION §6)

Proposal D changes _which UI is showing_, never runtime semantics:

1. **One composed graph, one device per face.** The canvas is a single
   `VizijRuntimeProvider`; rig + expression (pose) + behavior (program) graphs
   compose into that one arora device. The Comparison Face is a _separate_
   provider with its own namespace — never a second device inside the same graph.
2. **Unprefixed `params.path` is the cross-graph contract.** All inspector edits
   and Live-Control writes address canonical unprefixed paths
   (`rig/{faceId}/…`, `/standard/{ns}/{ch}/{track}/{attr}`). The expert path
   field shows exactly this string; nothing in the UI namespaces a store path.
3. **`ValueJSON` step/drain loop.** The provider owns the step-ms/drain-changed
   loop; the canvas is a pull-model consumer of the render store. The inspector
   never reaches into the device — it calls `setInput(path, value)` and reads the
   mirrored value back.
4. **Hot updates via `setGraphBundle(bundle, {tier})`.** Committing an
   expression, animation, or behavior calls `setGraphBundle({..., tier:"graphs"})`
   so authored graphs update without reloading the GLB or losing device store
   state. Only Import/replace-asset uses `tier:"assets"`.

The two sharp edges from FOUNDATION §6 are tracked: `orchestrator-react` stays a
**vestigial** dependency to remove during extraction; the Behavior editor's
_live preview_ keeps its own `OrchestratorProvider` (`orchestrator-wasm`) until
we can preview committed-into-arora behaviors — the BehaviorSheet isolates this
so the rest of the app never sees orchestrator.

### How selection ↔ inspector binds to runtime metadata

This is the architectural heart of Proposal D.

```
canvas click / hover / ⌘K result
        │  emits Selection {kind, id/path, meshRef}
        ▼
  selectionStore.selectionStack  ── useSyncExternalStore ──►  ContextualInspector
        │                                                          │
        │  for the top-of-stack target, resolve metadata:          │
        │    • resolveFaceControls(assetBundle, faceId,            │  picks section set
        │      inputConstraints)  → grouped controls, ranges       │  by (target.kind ×
        │    • inputConstraints[path] → min/def/max for sliders    │   disclosureLevel)
        │    • poseConfig.poseGroups → expression grouping         │
        │    • outputPaths / controllers → what can drive it       │
        ▼                                                          ▼
   writes go back via  setInput / setGraphBundle / transport   render store mirror
```

- **Metadata over hard-coding:** slider ranges come from
  `inputConstraints` (README: "the right source for slider defaults/ranges in
  tooling UIs"); groupings/labels from `resolveFaceControls` and
  `PoseRigConfig.poseGroups`; drivable-ness from `controllers`/`outputPaths`.
  This is what makes the inspector work for _any_ face, and what lets L3 embeds
  build gaze/blink controls with zero face-specific code.
- **Section registry:** each inspector section (ValueSlider, RangeEditor,
  FormulaEditor, ConnectionsEditor, MorphTargets, MaterialEditor, MapCell,
  "Snapshot as expression") declares `(appliesTo: SelectionKind[], minLevel:
  DisclosureLevel)`. The inspector renders the intersection for the current
  target and level. Adding a capability = registering a section, not editing a
  monolithic switch (contrast today's `InspectorContent.tsx`).

### Where the L3 embed fits

The **Publish** action serializes the working document to a Face Package GLB
(via the extracted `runtimeBundle.ts` builder, now in L1/L2) and generates a
`<vizij-face src="…">` snippet. The web component instantiates `FaceRuntime`
(L1), which composes the same bundle into an arora device — so the embedded face
is byte-identical in behavior to the authored one. The embed's JS API
(`writeValues`/`readValues`/`listKeys`/`invoke`) mirrors the standalone WS
vocabulary (FOUNDATION §6) so the same host code drives a web embed or a robot.

### Component mapping (today → Proposal D)

| Today | Proposal D | L |
|---|---|---|
| `components/app/Viewer.tsx`, `RuntimeFaceFrame.tsx` | `CanvasFace` (+ accessible object tree) | L2 |
| `RuntimeSourceToolbar.tsx`, `RuntimeFaceControlsOverlay.tsx` | `TransportStrip` | L2 |
| `inspector/InspectorPanel.tsx` + `InspectorContent.tsx` (4-mode switch) | `ContextualInspector` + section registry | L2 |
| `state/selectionStore.tsx` | Kept — promoted to UI spine | L4 |
| `animation/TimelineEditor.tsx`, `TrackRow.tsx` | `TimelineSheet` | L2 |
| `motiongraph/*` (ReactFlow) | `BehaviorSheet` (+ rule-list alt-view) | L2 |
| `StdFeatureSpaces*` editors | `ControlMapSheet` (+ coverage grid) | L2 |
| `poseRig/*`, pose inspector | `ExpressionInspector` / `ExpressionSet` sections | L2 |
| Diagnostics/audit panels (§12) | `Checkup` sheet (unified) + `HealthChip` | L2 |
| `AppMenuBar.tsx`, workspace/edit-focus stores | `CommandPalette` + disclosure-level pref | L4 |
| `utils/runtimeBundle.ts` (bundle builder) | Face Package builder → L1/L2 | L1 |
| `App.tsx` (~4,600 lines) | Thin assembly (~a few hundred lines) | L4 |

---

## 6. Development plan

Clean-slate on the front end, incremental on the runtime substrate. The current
`vizij-authoring` already has a viewport + a selection-driven inspector — the two
pieces this proposal builds on — so migration is _evolution of that pair_ plus
demolition of the surrounding panel machinery.

### Phase 0 — Extraction groundwork (shared with all proposals)
- Extract L1 `@vizij/face-core` (`FaceRuntime`) from `VizijRuntimeProvider.tsx`.
- Extract `runtimeBundle.ts` (Face Package builder) and the viewport frame into
  L2. **Reuse:** the runtime provider, `resolveFaceControls`, `inputConstraints`,
  render store. **Remove:** vestigial `orchestrator-react` dep.
- Add a **history store** (undo/redo) and a **Save** (working document) path
  distinct from export — fixes §18 gaps independent of layout.

### Phase 1 — Canvas + contextual inspector skeleton
- Stand up the thin L4 shell: `CanvasFace` centered, `TransportStrip`, and the
  `ContextualInspector` driven by the existing `selectionStore`.
- Build the **section registry** and port the four current inspector modes into
  registered sections (rig driver, scene object, expression, material).
- **Reuse:** `selectionStore`, the four inspector content blocks (refactored, not
  rewritten). **Rebuild:** the panel shell, menu bar, edit-focus/workspace stores
  (deleted — replaced by disclosure levels).
- Ship L-Novice + L-Intermediate; validate click-the-face → tweak on a preset.

### Phase 2 — Command palette + disclosure levels + a11y spine
- `CommandPalette` indexing actions + objects; wire "select on face" from
  results. Disclosure-level preference (persisted) gating section `minLevel`.
- Accessible object tree on the canvas; slider/selection ARIA; keyboard focus
  order and canvas region cycling. Non-color `HealthChip`.
- E2E: selection→inspector, palette navigation, keyboard-only authoring path.

### Phase 3 — Dense-editor sheets
- `TimelineSheet` (from `TimelineEditor`/`TrackRow` + `animationStore`),
  `BehaviorSheet` (from `motiongraph/*`, keeping its `OrchestratorProvider`
  preview island), `ControlMapSheet` (from `StdFeatureSpaces*`).
- Context-open pre-focused on the triggering target; Expert Mode docking + pin
  rail. Build the **rule-list alt-view** for the behavior editor and the
  **coverage grid** for the map. **Implement SFS export** (fixes §18).

### Phase 4 — Sources, Checkup, Comparison
- `TransportStrip` **Source ▾**: Expression / Animation / Program / **Speech**
  (reuse `@vizij/speech-react`, dedupe the app's duplicated speech services) /
  **Live Control**. Unify diagnostics/audits into the **Checkup** sheet with
  reveal-on-face. Comparison Face as a second provider/namespace on-canvas.

### Phase 5 — L3 embed + Publish
- Ship `<vizij-face>` web component over L1 `FaceRuntime`; JS control API
  mirroring the WS vocabulary. **Publish** flow emits Face Package + embed
  snippet. Validate the embed against a `tutorial-*-face` app.

### Reuse vs. rebuild summary

| Reuse (evolve) | Rebuild (demolish) |
|---|---|
| `VizijRuntimeProvider` / runtime contract | `App.tsx` orchestrator monolith |
| `selectionStore` (→ UI spine) | `workspaceStore` panel-visibility + exclusive-center logic |
| Inspector content blocks (→ sections) | `AuthoringUiProvider` edit-focus modes + `editFocusPanels.ts` |
| `TimelineEditor`, `motiongraph/*`, `StdFeatureSpaces*` internals | `AppMenuBar`, workbench tabs/config, `WorkspaceLayout` |
| `resolveFaceControls`, `inputConstraints`, `poseConfig` metadata | Standing left-sidebar panels (§8) as default surfaces |
| `runtimeBundle.ts`, render store, speech-react | Duplicated in-app speech services |
```
