# Synthesis — The Recommended Vizij Redesign

_Reads on top of [`00-FOUNDATION.md`](./00-FOUNDATION.md) and the four proposals
([A Lifecycle](./01-lifecycle-studio.md), [B Roles](./02-role-workspaces.md),
[C Headless+Kit](./03-headless-component-kit.md),
[D Canvas](./04-progressive-canvas.md)). This document compares them, then
recommends a single hybrid and a plan to build it._

---

## 1. What the four proposals agreed on

Before comparing, note the strong convergence — these are settled, not open
questions:

1. **The L0–L4 package suite is the right substrate.** All four adopt it, and all
   four make **extracting `@vizij/face-core` (L1) out of `VizijRuntimeProvider.tsx`
   their Phase 0.** When four independent designs pick the same first move, that
   move is the foundation. It is also the answer to the reuse mandate: a
   framework-agnostic headless core is what every downstream consumer needs.
2. **The arora contract is preserved verbatim** in every proposal (one composed
   graph, unprefixed `params.path`, `ValueJSON` step/drain, `setGraphBundle` hot
   updates), and each retires the same two sharp edges (vestigial
   `orchestrator-react` dep; the motion-graph editor's private
   `OrchestratorProvider`).
3. **The three §18 gaps get fixed by design, not deferred:** real undo/redo, a
   real **Save** distinct from **Publish/Export**, and Standard-Controls export.
4. **One artifact — the Face Package** (GLB + `VIZIJ_bundle`) — is the thing you
   save, publish, embed, and deploy.
5. **The framework-agnostic `<vizij-face>` embed (L3)** is the headline new
   deliverable, and its JS control API should mirror the existing standalone
   WebSocket vocabulary (`writeValues`/`readValues`/`listKeys`/`invoke`/
   `values_changed`) so web, robot, and remote-operator control speak one language.
6. **Terminology moves toward intent:** Control, Expression/Expression Set,
   Animation, Face Package, Checkup, Live Control; runtime internals hidden.

The proposals differ only in **how the front end is organized on top of that
shared substrate** — which is exactly the decision this synthesis makes.

---

## 2. Comparison matrix

Scored 1–5 (5 = best) on the criteria from the foundation. These are judgments
from the proposal reviews, not measured data.

| Criterion                                                 | A · Lifecycle | B · Roles | C · Headless+Kit | D · Canvas |
| --------------------------------------------------------- | :-----------: | :-------: | :--------------: | :--------: |
| **Feature completeness** (all 19 areas, no awkward homes) |       4       |     4     |        5         |     4      |
| **Simplicity / low floor for newcomers**                  |       4       |     4     |        3         |     5      |
| **Discoverability** (finding a capability)                |       4       |     4     |        3         |     4      |
| **Reusability** (chunks others can use; the embed)        |       3       |     3     |        5         |     3      |
| **Expert speed / power density**                          |       3       |     4     |        4         |     3      |
| **Accessibility**                                         |       3       |     3     |       4\*        |     5      |
| **Migration cost / risk** (from today's app)              |       3       |     3     |        3         |     4      |
| **Maintenance cost** (ongoing)                            |       4       |     3     |        2         |     4      |

\* C's accessibility score reflects that a11y done once in shared L2 components
propagates to every consumer — a structural advantage, though it depends on the
components actually implementing it.

**How to read this:** C dominates on **reusability and completeness** but is the
heaviest to maintain and the weakest app-UX story on its own. D dominates on
**simplicity and accessibility** but is weakest on power-user density and reuse.
A and B are balanced middles — A gives the clearest _learning_ narrative, B gives
the clearest _role separation_ — but each carries a structural tax (A: cross-stage
friction; B: role hand-off friction + shell duplication risk).

Crucially, **the top axes are not in conflict** — C's strength (packaging) is a
_substrate_ decision, while D's strength (canvas UX) and A's strength (lifecycle
narrative) are _app-shell_ decisions. They compose. That is the hybrid.

---

## 3. Recommendation: **Canvas app on a Headless suite, guided by the Lifecycle, presettable by Role**

Adopt **C's package architecture as the foundation**, build **D's
progressive-disclosure canvas as the app**, use **A's lifecycle as the guidance
spine** (not as hard modes), and offer **B's roles as entry presets** (not
separate apps). Each proposal contributes the thing it does best; each proposal's
main weakness is covered by another's strength.

### 3.1 Foundation — from C (non-negotiable)

The five-layer suite, built bottom-up, `@vizij/face-core` first:

- **L0** external WASM engines (arora, node-graph), unchanged.
- **L1 `@vizij/face-core`** — the framework-agnostic `FaceRuntime` controller
  extracted from `VizijRuntimeProvider.tsx` (C §2a.1 specifies the ~30-method
  surface and the exact code it comes from). Tier the API: a small `@stable` core
  (`init`, `step`, `writeInput`, `readValue`, `listInputs`, `setGraphBundle`,
  `onValuesChanged`) plus `@experimental` transport/driver helpers.
- **L2 `@vizij/components`** — functional, runtime-wired React components
  (viewport, controls, transport, expression grid, timeline, program canvas,
  control-map, checkup, speech). Headless-by-default styling with an opt-in
  styled entry. `@vizij/runtime-react` becomes the thin React adapter over L1.
- **L3 `@vizij/face-embed`** — the `<vizij-face>` custom element + `<script>` +
  COOP/COEP-aware iframe fallback, JS API mirroring the WS vocabulary (C §2a.3).
- **L4 `@vizij/editor-*`** — the heavy editors as independent packages
  (timeline, program, pose/expression, rig-inspector, control-map, checkup), each
  committing via `setGraphBundle`.

**Why C for the substrate:** it is the only proposal that fully answers the reuse
mandate at every level (headless, React, no-framework, editor), and the other
three _already assume this substrate_. Adopt C's versioning discipline
(Changesets, fixed release line for the `face-core`/`runtime-react`/`render`
trio, `.d.ts` surface snapshots) to manage the packaging tax C honestly flags.

**Mitigating C's "reference app rots into a demo" risk:** we don't ship C's _thin
reference app_ — we ship D's _designed_ canvas app as the flagship. The app is a
first-class product with a UX owner and golden-path E2E gates (C §2a.5), so
packaging-first does not mean app-UX-last.

### 3.2 The app shell — from D (the daily surface)

The flagship app is **D's canvas-centric design**: one always-present
arora-driven face, a single **contextual inspector** bound to selection via
runtime-resolved metadata (`resolveFaceControls`, `inputConstraints`,
`poseConfig.poseGroups`), a **command palette** (`⌘K`) as the master index, and
**disclosure levels** (novice → intermediate → expert) that add depth without
moving controls. Dense editors (timeline, program/behavior, control-map) open as
**sheets** pre-focused on their target, dockable in Expert Mode.

**Why D for the shell:** it has the lowest floor, the best accessibility story
(accessible object tree, keyboard-first, non-color status), and it is the
_least risky migration_ because today's app already has the viewport +
selection-driven inspector (`selectionStore.tsx`) it builds on. D also inherits
the a11y benefit of C's shared L2 components.

### 3.3 The guidance spine — from A (lifecycle as wayfinding, not walls)

Take A's **Define → Control → Animate → Deploy** lifecycle, but resolve A's own
biggest tension (cross-stage tasks strain hard modes) by demoting it from _modes_
to a **persistent progress/guidance spine**:

- A slim **Lifecycle bar** shows the four stages with readiness (borrowing B's
  state-aware badges: "Define ✓ · Control ✓ · Animate 3 · Deploy ⚠ checkup").
- Clicking a stage doesn't switch to a walled mode — it **focuses the canvas and
  palette** on that stage's tasks and reveals the relevant sheets/inspector
  sections. You never leave the one canvas, so "tweak a control while animating"
  (A's weak seam) is free — it's the same surface.
- For a brand-new face, the spine runs a **guided first-run** in order (A's
  teachable narrative), then recedes into ambient wayfinding.

**Why A for the spine:** it gives newcomers the "making a face" mental model and a
sense of progress that pure-canvas D lacks, while the demotion-to-guidance removes
A's cross-stage friction entirely.

### 3.4 Entry presets — from B (roles without silos)

Offer B's three personas as **entry presets / layout presets**, not separate
workspaces:

- **Rig Author**, **Motion Designer**, **Integrator** presets each set a default
  **disclosure level**, an **emphasized lifecycle stage**, and a **pin set**
  (e.g. Integrator opens at Deploy with the Consumer Preview + Live Control
  pinned; Rig Author opens at Define in Expert Mode with the hierarchy object
  list pinned).
- Adopt B's **Consumer Preview** idea — dogfood the L3 `<vizij-face>` embed as the
  Integrator preset's canvas, guaranteeing "what I see is what I ship."
- A preset is just a saved arrangement of D's canvas; switching preset never
  reloads the runtime or duplicates a shell (avoiding B's duplication risk), and a
  solo user ignores presets entirely.

**Why B for presets:** roles are real (three personas), and presets capture that
value — focused starting points — without B's hand-off friction or triple-shell
cost, because there is one shell (D) underneath.

### 3.5 How the contributions compose (at a glance)

```text
        A · Lifecycle spine  (Define→Control→Animate→Deploy = wayfinding + guided first-run)
                    │  focuses…
                    ▼
   B · Role presets ─►  D · Progressive-disclosure canvas  ◄─ the one working surface
   (saved canvas         (canvas + contextual inspector +
    arrangements)         palette + disclosure + sheets)
                    │  every edit speaks bundle+paths, never the device
                    ▼
        C · L0–L4 package suite  (face-core → components → embed → editors)
                    │
                    ▼
        arora runtime (unchanged)
```

Each proposal's weakness is covered:

| Proposal    | Its main weakness                   | Covered by                                               |
| ----------- | ----------------------------------- | -------------------------------------------------------- |
| A Lifecycle | Cross-stage tasks strain hard modes | Demoted to a guidance spine over D's single canvas       |
| B Roles     | Hand-off friction; triple shell     | Roles become presets over one D shell                    |
| C Headless  | App UX is a by-product              | D is the designed flagship, not a thin demo              |
| D Canvas    | Expert density; weak reuse          | A's spine + B's Expert presets; C's suite delivers reuse |

---

## 4. Canonical terminology

Resolving the divergences across proposals. This is the fixed vocabulary.

| Concept                               | Canonical user-facing term                                 | Resolution note                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A driveable knob                      | **Control**                                                | Unanimous.                                                                                                                                    |
| A control that follows / is computed  | **Link** (follow) / **Formula** (math)                     | Adopt A's split — clearest.                                                                                                                   |
| Universal interoperable control names | **Standard Controls** / **Control Map**                    | Adopt "Standard" (B, C, D) over A's "Universal" — 3 of 4, and matches existing `/standard/...` paths.                                         |
| A named look                          | **Expression**                                             | Unanimous.                                                                                                                                    |
| Group of expressions                  | **Expression Set**                                         | Unanimous.                                                                                                                                    |
| Blend/compose order                   | **Layering**                                               | (A's "Blend order" is a fine synonym in tooltips.)                                                                                            |
| Rest state                            | **Resting Face**                                           | Unanimous.                                                                                                                                    |
| Reactive logic                        | **Behavior** (authored in the **Behavior editor**)         | Adopt "Behavior" (A, D) as the concept; "Program" is the internal/asset term. The node-graph is one editor for it; representation stays open. |
| Keyframed motion                      | **Animation** / **Clip** / **Keyframe**                    | Unanimous (kept).                                                                                                                             |
| The artifact                          | **Face Package**                                           | Unanimous.                                                                                                                                    |
| Validation                            | **Checkup** (with an inline **health chip**)               | Unanimous; adopt D's non-modal chip.                                                                                                          |
| External driving                      | **Live Control** / **Connections**                         | Unanimous.                                                                                                                                    |
| Working save vs shareable output      | **Save** (working) vs **Publish** (shareable Face Package) | Unanimous; fixes §18.                                                                                                                         |
| Runtime internals                     | _(hidden)_                                                 | arora / orchestrator / IR / GraphSpec / device never shown. Developer APIs keep honest mechanism names (`writeInput`, paths).                 |

Two audiences, per C: **end-users** see the intent words above; **developers**
see path/value mechanism names in the package APIs. The `<vizij-face>` embed uses
the developer vocabulary (`writeValues`, `listKeys`) because its users are
developers and it matches the WS bridge verbs.

---

## 5. Final reusable-package boundaries

The canonical suite (fixing the foundation's "names are proposals"):

| Layer | Package                                                                               | Status                | Source                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0    | `@vizij/arora-web-wasm`, `@vizij/node-graph-wasm`                                     | exists (external)     | —                                                                                                                                                    |
| L1    | **`@vizij/face-core`**                                                                | **new**               | extract from `runtime-react/src/VizijRuntimeProvider.tsx` + `updatePolicy.ts` + `utils/*`; fold in `apps/vizij-authoring/src/utils/runtimeBundle.ts` |
| L2    | `@vizij/runtime-react`                                                                | exists → thin adapter | rewrite as React binding over L1                                                                                                                     |
| L2    | **`@vizij/components`**                                                               | **new**               | extract from `apps/vizij-authoring/src/components/app/*`, inspector, panels                                                                          |
| L2    | `@vizij/render`, `@vizij/speech-react`, `@vizij/utils`, `@vizij/node-graph-authoring` | exists, reused        | dedup app's copied speech services into `speech-react`                                                                                               |
| L3    | **`@vizij/face-embed`**                                                               | **new**               | the `<vizij-face>` element (headline gap)                                                                                                            |
| L4    | **`@vizij/editor-{timeline,program,pose,rig-inspector,control-map,checkup}`**         | **new**               | extract from `animation/*`, `motiongraph/*`, `poseRig/*`, `inspector/*`, `StdFeatureSpaces*`, audit/discrepancy panels                               |
| App   | `vizij-authoring` → **Vizij Studio**                                                  | rebuilt               | thin canvas-app assembly of L2/L4                                                                                                                    |

Dependency rule: a layer depends only on layers below; L4 editors never import
each other (coordinate via the app or a small shared bus). Heavy deps (ReactFlow,
react-colorful) stay scoped to the one editor that needs them.

`apps/vizij-standalone` remains the reference **deploy** consumer and migrates
onto L3 — proving the embed end-to-end.

---

## 6. Development plan — user-facing value first, repackaging last

**Sequencing priority: get the earliest user-facing improvement shipped ASAP; do
the repackaging, bundling, and other under-the-hood changes last.** This
deliberately inverts the "extract packages bottom-up, rebuild the app last"
ordering an engineer would reach for by default — under that ordering the actual
redesigned experience wouldn't reach a user until the very end. Here the visible
wins come first and the L1–L4 extraction refactors an already-improved app.

The work splits into two tracks, and **Track 1 ships entirely before Track 2
starts** (though R1 can be pulled forward as a spike — see the tradeoff note):

- **Track 1 — user-facing improvements, in the existing `vizij-authoring` app,
  against today's `@vizij/runtime-react` as-is.** No package extraction, no
  bundling changes. Because nothing under the hood moves, the arora contract is
  preserved for free and there is nothing to break.
- **Track 2 — repackaging & reuse.** Extract the now-improved app into the L0–L4
  suite and ship the `<vizij-face>` embed. "Wrap, don't rewrite."

### Track 1 — user-facing improvements (ship first)

| Wave                            | Ships (user-visible)                                                                                                                                                                                                                                                                                                                                               | Why this early                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **U1 · Quick wins & gap fixes** | Real **undo/redo** (`⌘Z`/`⇧⌘Z`); **Save** (working) vs **Publish/Export** split; canonical **terminology relabel** (Control, Link/Formula, Expression/Expression Set, Behavior, Face Package, Checkup, Live Control…); one unified **Checkup** replacing the four audit panels and folding import "skip checks"/orientation/discrepancy into a single guided step. | Highest value per unit effort, all independent of packaging, all pure in-app edits. Fixes the §18 gaps on day one. Terminology is largely a labeling pass. **This is the earliest shippable improvement.** |
| **U2 · Discoverability**        | **Command palette (`⌘K`)** over existing actions + objects; **Lifecycle wayfinding bar** (Define→Control→Animate→Deploy readiness + guided first-run); a progressive-disclosure default layout that tames today's 13-panel/4-navigation overwhelm.                                                                                                                 | Large perceived-simplicity gain, built over the existing `selectionStore` and action set — no new packages needed.                                                                                         |
| **U3 · Canvas reorganization**  | Rebuild the primary surface as the **contextual-inspector canvas (D)** with disclosure levels; **role presets (B)** as saved layouts; ship **Standard-Controls export**.                                                                                                                                                                                           | The biggest UX change, still in-app and still on today's runtime. Build it already split into component-shaped modules so Track 2 extraction is a _move_, not a rewrite.                                   |

After **U1** the tool is already noticeably better (undo, real save, plain
language, one Checkup). After **U2** it is discoverable. After **U3** it _is_ the
redesigned experience — all before any repackaging.

### Track 2 — repackaging & reuse (after the UX lands)

Non-breaking throughout: `@vizij/runtime-react` stays a compatibility façade, so
`demo-vizij-player`, the tutorial faces, and the improved authoring app keep
running while internals hollow out onto L1/L2.

| Phase                                   | Ships (mostly under the hood)                                                                                                                                                                                                   | Notes                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **R0 · Plumbing**                       | Changesets, per-package CI, `.d.ts` surface snapshots, fixed release line for the core trio.                                                                                                                                    | Prep only.                                                                |
| **R1 · Extract L1 `@vizij/face-core`**  | Framework-agnostic `FaceRuntime` controller out of `VizijRuntimeProvider.tsx`; `runtime-react` becomes a thin adapter; fold in the Face Package builder; drop the vestigial `orchestrator-react` dep. Headless Node smoke test. | The lowest-risk, highest-leverage move — now done once the app is stable. |
| **R2 · Extract L2 `@vizij/components`** | Lift the U2/U3 canvas, inspector, transport, and controls into a package; dedup speech services into `@vizij/speech-react`; Storybook.                                                                                          | Wrap, don't rewrite.                                                      |
| **R3 · Extract L4 `@vizij/editor-*`**   | timeline / program / pose / rig-inspector / control-map / checkup packages; retire the motion-graph preview `OrchestratorProvider`.                                                                                             | Each commits via `setGraphBundle`.                                        |
| **R4 · L3 `@vizij/face-embed`**         | The framework-agnostic `<vizij-face>` drop-in + JS API (`writeValues`/`readValues`/`listKeys`/`invoke`/`on`), COOP/COEP iframe fallback; `vizij-standalone` migrates onto it.                                                   | Needs L1. **Closes the reuse gap.**                                       |
| **R5 · Cleanup**                        | App becomes a thin assembly of L2/L4; delete monolith internals + stray files.                                                                                                                                                  | `App.tsx` → composition root.                                             |

### Migration principles

- **User-visible value first.** U1's gap fixes and terminology are pure wins that
  carry over unchanged regardless of any later packaging.
- **Wrap, don't rewrite.** `motiongraph/*`, `animation/*`, `poseRig/*`, and the
  audit panels are large and working — Track 2 moves them behind package
  boundaries; it does not rewrite their logic.
- **Build Track 1 extraction-ready.** Structure U3's new surfaces as components
  from the start, so R2/R3 is lifting code into packages rather than reworking it.
- **Keep consumer apps green throughout** (`demo-vizij-player`, a tutorial face)
  as living regression tests for the runtime contract.

### The tradeoff (stated honestly)

- **Some rework.** Doing U3's UX in the monolith means a portion of it is later
  refactored into L2/L4 (Track 2). This is the accepted cost of early value;
  mitigated by building U3 component-structured, and by U1's fixes being
  permanent regardless.
- **The reuse mandate lands last.** Packages and the `<vizij-face>` embed — a core
  goal — now come in Track 2. That is the deliberate priority: internal UX value
  first, external reuse after. If a specific external consumer needs the embed
  sooner, **R1 + R4 can be pulled forward as a parallel spike** at any point,
  since the L1 extraction is non-breaking and independent of the Track 1 UX work.
- **The monolith grows before it shrinks.** `App.tsx` keeps accreting during
  Track 1; R5 is where it finally collapses to a composition root. Acceptable
  because Track 1 is explicitly the priority.

### Coordinating with open PRs (as of this writing)

Seven PRs are open; several overlap this plan and must be sequenced around, not
against.

| PR                                                                                                                               | What it is                                                                                                                                              | Relation to this plan                                                                                                                                                  | Coordination                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#63** `feat!: dissolve the orchestrator — authoring on the arora device (VIZ-70)` (draft → main)                               | Moves authoring onto the arora device; touches `Viewer.tsx`, `ReferenceFaceRuntime.tsx`, `ExportPanel.tsx`, `runtime-react`, tutorials.                 | **This is Track 2 (R1/R3) already in flight.** It resolves both arora "sharp edges" (vestigial `orchestrator-react`; the motion-graph preview `OrchestratorProvider`). | **Land #63 before Track 2**; R1 builds on it rather than redoing it. Track 1 avoids heavy edits to `Viewer.tsx`/`ExportPanel.tsx` and expects to rebase onto #63 (it is `feat!`/breaking).      |
| **#59** `starred functionality panel` (draft → main)                                                                             | A discoverability feature; touches `App.tsx`, `AppMenuBar.tsx`, `VariablesPanel.tsx`, `TreeRow.tsx`, `useVizijExport.ts`; adds `state/starredStore.ts`. | **Conceptually an early U2 (discoverability) increment**, and it owns the exact files U1/U2 need.                                                                      | **Highest-overlap PR.** Land #59 first or base Track 1 on it; reuse its `starredStore` zustand pattern for the new history (undo/redo) store; fold "starred" into the U2 discoverability story. |
| **#60** `FBX-in-GLB pose extraction (WIP)` (draft → main) · **#61** `import Blender morph-weight animation + bake clips` (→ #60) | Import + animation enrichments (DEFINE/ANIMATE).                                                                                                        | Extends the Import surface U1's guided **Checkup** wraps.                                                                                                              | Low direct conflict (different files); coordinate the guided-import UX so it accommodates the new import paths.                                                                                 |
| **#51** `import PBR material properties as first-class features (VIZ-68)` (draft → main) · **#58** `AgX tone mapping` (→ #51)    | `@vizij/render` material/fidelity work (DEFINE/materials).                                                                                              | Feeds the material inspector (area 7) and the L2 render reuse.                                                                                                         | Low conflict with Track 1; relevant later to `@vizij/components` viewport/material extraction.                                                                                                  |
| **#64** `Android launcher icons` (→ main)                                                                                        | `vizij-standalone` packaging.                                                                                                                           | Unrelated to the front-end redesign.                                                                                                                                   | None.                                                                                                                                                                                           |

**Net effect on sequencing:** almost every Track 1 UI change eventually touches
`App.tsx`/`AppMenuBar.tsx`, which **#59** also edits, so Track 1 should either
build on #59 or start with new-file, conflict-free modules (history store,
unified Checkup component) and defer the `App.tsx`/menu wiring until #59 lands.
Track 2's R1 folds into **#63** rather than duplicating it.

---

## 7. What to decide next

This synthesis recommends a direction; a few calls remain for the team:

1. **Confirm the flagship shell = D (canvas)** vs. a lighter-weight A-style
   lifecycle shell. (Recommendation: D, for floor + accessibility + migration.)
2. **Scope the role presets (B).** Ship all three at launch, or start with just
   the Integrator preset (which pairs naturally with the L3 embed)?
3. **Embed delivery default.** Direct mode (requires host COOP/COEP) vs. the
   iframe fallback as the documented default. (Recommendation: auto-detect, iframe
   default — most host sites can't set the headers.)
4. **How far to push "Behavior" representation.** Ship the node-graph editor as-is
   (Track 2 · R3), or invest in the keyboard-first rule-list alt-view (D §3, area 5) sooner — it is a user-facing accessibility win that could move into Track 1?
5. **API stability bar for 1.0.** Which `FaceRuntime` methods are `@stable` at
   first publish vs. `@experimental` (C §4)?

These are refinements on a settled foundation — the substrate (C), the shell (D),
the spine (A), and the presets (B) compose without conflict, and the phased plan
delivers reusable value at every step.
