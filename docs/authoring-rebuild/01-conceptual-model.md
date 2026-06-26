# Authoring Rebuild — Conceptual Model & Principles

> Workstream 1 of the Vizij authoring-tool rebuild. This is the source of truth that
> every later artifact (feature audit, journey maps, sketches, Figma designs, and the
> eventual rebuild) must trace back to.

## 1. Why we are doing this

The `vizij-authoring` app retains the features we want, but their organization has
accreted to the point of being hard to use and hard to maintain. Concretely:

- `apps/vizij-authoring/src/App.tsx` is **5,298 lines**; `VariablesPanel.tsx` is
  **8,753 lines**; `InspectorContent.tsx` is **5,547 lines**.
- The UI is one surface multiplexing **4 workbenches** (Import/Export, Rigging, Posing,
  Standard Feature Spaces) and **~13 toggleable panels**.
- `next_steps.md` is a ~40KB running log of reference-face playback regressions — a
  symptom of state-model and UI complexity, not of the underlying engine.

The UR-RAD paper's own conclusion frames the gap precisely: *"The Face and Rig Designer
capabilities are programmatically present but GUI-based authoring is currently in
progress."* The representation and engine work. **What we are rebuilding is the
authoring GUI layer**, not the engine.

### Decisions locked for this rebuild

| Decision | Choice |
| --- | --- |
| Scope of "from scratch" | **Rebuild the GUI; keep the engine.** Reuse `@vizij/*` packages (WASM runtime, render, node-graph, orchestrator, standard feature spaces, GLB import/export). |
| Interfaces in scope | **Five** — the paper's three (Face Designer, Rig Designer, Face Controller) plus **Animation Designer** and **Behavior Designer**, which the paper folded into the Controller. Sequenced — see §5. |
| Primary v1 user | **Both researchers and designers/animators**, balanced — see the progressive-disclosure principle in §4. |

## 2. The spine: the pipeline (extended beyond the paper)

Everything in Vizij is a data-flow that builds low-level rendered properties up into
progressively more abstract, face-agnostic representations (UR-RAD Fig. 2). This is the
mental model the rebuilt tool must make legible.

The paper's Fig. 2 stops at *animation values driving rigs*. The current tooling has gone
further than the paper documented — it already supports **keyframe and procedural
animation authoring**, and we now also need **behavior design** (sequencing animations
with logic and speech). So we extend the spine with two upstream layers the paper did not
cover: **Animation** (`t`) made first-class, and **Behavior** above it.

```
 Behavior   ──▶   Animation @ t   ──▶  Abstract c   ──▶  Face-specific f  ──▶  Low-level d  ──▶  Rendered
 sequence,        keyframe OR          emotion,          left_pupil_x,         raw primitive       face
 logic, speech    procedural           gaze, visemes     per-face props        positions

 Behavior         Animation            Abstraction       Face Rigger           Face Designer
 Designer (R5)    Designer (R4)        Rigger (rig c→f)  (rig f→d)             (owns d) (R1)
                                       └──────────── Rig Designer (R2/R3) ─────┘

 Face Controller (R6) drives the whole chain at runtime — single/many faces, many screens.
```

- **Low-Level Properties Vector `d`** — raw rendered primitives (e.g. concentric circles
  for an eye, in x/y screen coords). No abstraction. Direct to renderer.
- **Face-Specific Vector `f`** — higher-level but still face-specific (e.g.
  `left_pupil_x`, normalized). A **Face-Specific Rig** maps `f → d`.
- **Abstract Control Vector `c`** — face-agnostic (emotion, gaze, visemes). An
  **Abstraction Rig** maps `c → f` (and `c → c`). This is where community **Standard
  Rigs / Standard Feature Spaces** live.
- **Animation values at `t`** *(extends the paper)* — values that drive a rig at a moment
  in time. Authored two ways: **keyframe** (timeline) or **procedural** (a node graph that
  generates values). Both emit the same artifact.
- **Behavior** *(new, not in the paper)* — sequences/chains of animations plus logic and
  speech that define an interlocutor experience. Selects and triggers animations over time;
  may react to inputs. Backed by the orchestrator (`@vizij/orchestrator-react`, blackboard).

**Rigs are the edges between the d/f/c layers.** There can be any number of intermediate
layers. **The node graph is a shared authoring canvas** — the same primitive underlies
Rig Designer transformations, procedural animation, and behavior logic (see §4.7).

## 3. Roles → interfaces

The paper defines **six roles** (Fig. 1) and grouped them into **three** GUI interfaces.
But the paper under-counted the interfaces: it folded animation and behavior work into the
Face Controller. Because the tooling now supports **keyframe + procedural animation
authoring** and we need **behavior design** (neither covered in the paper), we split those
out into their own interfaces. The result is **five interfaces** (the same six roles).

| Pipeline layer it touches | Role | Primary interface |
| --- | --- | --- |
| `d` (compose components) | **Face Designer** | **Face Designer** |
| `f → d` rig | **Face Rigger** | **Rig Designer** |
| `c → f` / `c → c` rig, standards | **Abstraction Rigger** | **Rig Designer** |
| animation values at `t` | **Animator** | **Animation Designer** *(new)* |
| behavior: chains + logic + speech | **Interaction Designer** | **Behavior Designer** *(new)* |
| programmatic control (API) | **Developer** | **Face Controller** (runtime) + API |

The cross-role hand-offs in Fig. 1 ("Share Face/Rig/Standard/Animation") are the seams
between interfaces; we add a fifth artifact — **Share Behavior** — for the new layer.

### The five interfaces

1. **Face Designer** — compose rigged face components (mouth, eye — not raw lines) into a
   face, with hand-off to/from external 3D tools (Blender, glTF). (Today: Scene Composer +
   Face Creator + materials/inspector.)
2. **Rig Designer** — visually define rig transformations as graphs with declared inputs/
   outputs. Face Riggers map to face-specific elements; Abstraction Riggers map to
   standard/abstract rigs. (Today: node-graph editor + Pose Rig + bindings + Standard
   Feature Spaces — to be unified.)
3. **Animation Designer** *(new — not a distinct interface in the paper)* — author values
   over time `t` that drive a rig. Two modes that emit the same Animation artifact:
   **keyframe** (timeline; today `TimelineEditor`) and **procedural** (node graph; today
   "motiongraph"). The procedural mode reuses the shared node-graph canvas (§4.7).
4. **Behavior Designer** *(new — not in the paper)* — sequence animations into behaviors,
   add logic and speech/visemes, and simulate an interlocutor experience. Backed by the
   orchestrator (`@vizij/orchestrator-react`). (Today: speech panel + procedural targets +
   ad-hoc sequencing scattered across `App.tsx`.)
5. **Face Controller** — connect a Face + rigs + animations + behaviors to render and
   *drive* it (single or many faces, one or many screens), and the surface where a
   Developer tests programmatic control. The paper's core value demonstrator. Backed by
   `@vizij/runtime-react`.

> **Design call (revisitable):** Animation Designer is modeled as *one* interface with
> keyframe + procedural modes (they produce the same artifact and an animator combines
> them). The alternative is two separate interfaces. Flagged for Workstream 4. Likewise,
> procedural animation, rig transformations, and behavior logic all sit on the same
> node-graph engine — an architectural through-line, not necessarily one UI.

## 4. Design principles

These are the constraints that keep the rebuild *simpler* than today's tool.

1. **One pipeline, made legible.** Every screen should make clear which layer (`d`/`f`/`c`/`t`)
   the user is operating on. The pipeline is the tool's spine, not an implementation
   detail.
2. **Progressive disclosure (the researcher/designer reconciliation).** Ship one clean,
   opinionated default path that a designer can follow end-to-end. Researchers' need to
   swap or inspect any individual module becomes *advanced controls revealed on demand* —
   not default clutter. This is the single most important principle for serving both
   audiences without drifting back to "everything on one screen."
3. **One interface, one job.** The five interfaces are distinct surfaces (or distinct
   modes) with a shared shell and component library — not 13 co-resident panels. A user
   in a given role should rarely need to think about the other interfaces.
4. **Engine is fixed substrate.** The UI consumes `@vizij/*` through stable boundaries.
   No business logic in 5,000-line view components; state models stay small and testable.
5. **Standards are first-class, not a tab.** Standard Feature Spaces (`/standard/{ns}/{channel}/{track}/{attribute}`)
   are how faces interoperate. The Rig Designer should treat aligning to a standard as a
   primary, guided action.
6. **Shareable artifacts at every seam.** Faces, rigs, standards, animations, **and
   behaviors** are each independently importable/exportable (Fig. 1 hand-offs + the new
   Share Behavior seam). Design the library/asset model around these five artifact types.
7. **The node graph is a shared canvas.** One node-graph primitive (`@vizij/node-graph-*`)
   underlies rig transformations, procedural animation, and behavior logic. Build it once
   as a reusable surface; let each interface configure its inputs/outputs and palette.
   This is both a UX consistency win and the single biggest code-reuse opportunity.

## 5. Sequencing

All five interfaces are in scope; design their information architecture together (shared
shell + component library). **Build order (decided):** bottom-up along the pipeline, then
a reconciliation sweep.

1. **Face Designer first.** You need a composed face (the `d` layer) before there is
   anything to rig, animate, or control. Establishes the shared shell, the design system,
   and the component-centric model the others inherit.
2. **Rig Designer second.** Rigs (`f→d`, `c→f`) build directly on a face. Highest-
   complexity UI and the biggest simplification win; now has real faces to rig against.
   Establishes the shared node-graph canvas (§4.7).
3. **Animation Designer third.** Authors values over time `t` against finished rigs;
   keyframe + procedural modes. Reuses the node-graph canvas for procedural mode.
4. **Behavior Designer fourth.** Sequences animations into behaviors with logic + speech;
   builds on having real animations and rigs to compose.
5. **Face Controller fifth.** Drives finished faces/rigs/animations/behaviors; the
   integration layer that exercises the whole pipeline end-to-end, including Developer API
   testing.
6. **Reconciliation sweep across all five.** Revisit each interface to fold back lessons
   the later designs surfaced (e.g. a control affordance discovered while building the
   Controller that the Face Designer should expose). A first-class phase, not cleanup.

> Rationale for bottom-up: building along the pipeline's natural dependency order
> (`d → f → c → t → behaviors`) means each interface is designed against concrete artifacts
> the previous one produces, rather than against mocks. The trade-off — the core value
> demonstrator (Controller) lands last — is accepted and mitigated by the reconciliation
> sweep. The shared node-graph canvas, introduced in step 2, is then reused in steps 3–4.

## 6. What this unlocks downstream

- **Workstream 2 — Feature audit** (`02-feature-audit.md`): every current feature mapped
  to a pipeline layer + target interface, with keep / simplify / cut calls.
- **Workstream 3 — Roles, hand-offs & interface plans** (`03-roles-and-interface-plans.md`):
  Fig. 1 turned into roles, cross-role hand-offs, and a plan per interface × role.
- **Workstream 4 — IA + low-fi sketches**: screen inventory per interface + shared shell.
- **Workstream 5 — Figma design system**: tokens + component library; port existing React
  UI components into Figma via Code Connect.
- **Workstream 6 — Hi-fi prototypes + validation** with users from each role.
- **Workstream 7 — Rebuild architecture**: app shell + state model reusing `@vizij/*`.
- **Workstream 8 — Phased roadmap**.
