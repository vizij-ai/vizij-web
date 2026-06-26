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
| Interfaces in scope | **All three** (Face Designer, Rig Designer, Face Controller), sequenced — see §5. |
| Primary v1 user | **Both researchers and designers/animators**, balanced — see the progressive-disclosure principle in §4. |

## 2. The spine: the 4-layer pipeline

Everything in Vizij is a data-flow that builds low-level rendered properties up into
progressively more abstract, face-agnostic representations (UR-RAD Fig. 2). This is the
mental model the rebuilt tool must make legible.

```
Animation values        Abstract Control        Face-Specific          Low-Level
   (at time = t)   ──▶      Vector (c)      ──▶    Vector (f)    ──▶   Properties (d)   ──▶  Rendered face
                        emotion, gaze,          left_pupil_x,       raw primitive
                        visemes (face-          per-face higher-    positions/props
                        agnostic)               level props         (direct to render)

        └── rig (c→f) ──┘        └── rig (f→d) ──┘
   Animator drives `t`     Abstraction Rigger      Face Rigger owns       Face Designer owns
                           owns c↔c / c→f          f→d                    the d layer
```

- **Low-Level Properties Vector `d`** — raw rendered primitives (e.g. concentric circles
  for an eye, in x/y screen coords). No abstraction. Direct to renderer.
- **Face-Specific Vector `f`** — higher-level but still face-specific (e.g.
  `left_pupil_x`, normalized). A **Face-Specific Rig** maps `f → d`.
- **Abstract Control Vector `c`** — face-agnostic (emotion, gaze, visemes). An
  **Abstraction Rig** maps `c → f` (and `c → c`). This is where community **Standard
  Rigs / Standard Feature Spaces** live.
- **Animation values at `t`** — the thing that drives a rig at a moment in time. Produced
  by authored animations or by programmatic/procedural sources.

**Rigs are the edges between layers.** There can be any number of intermediate layers.

## 3. Roles → interfaces

The paper defines **six roles** (Fig. 1 service blueprint) that collapse into **three
primary GUI interfaces** (the paper's own grouping):

| Pipeline layer it touches | Role | Primary interface |
| --- | --- | --- |
| `d` (compose primitives) | **Face Designer** | **Face Designer** interface |
| `f → d` rig | **Face Rigger** | **Rig Designer** interface |
| `c → f` / `c → c` rig, standards | **Abstraction Rigger** | **Rig Designer** interface |
| animation values at `t` | **Animator** | **Face Controller** interface |
| chains of behaviors / experience | **Interaction Designer** | **Face Controller** interface |
| programmatic control (API) | **Developer** | (API + Face Controller for testing) |

The cross-role hand-offs in Fig. 1 ("Share Face", "Share Rig", "Share Standard", "Share
Animation") are the seams between interfaces and become the import/export and library
flows in the rebuilt tool.

### The three interfaces

1. **Face Controller** — connect rigs + animations to render and *drive* a face (single
   or many faces, one or many screens). The paper's core value demonstrator. Serves
   Animators, Interaction Designers, and Developers (for testing).
2. **Rig Designer** — visually define rig transformations as graphs, with declared inputs
   and outputs. Face Riggers map rigs to face-specific elements; Abstraction Riggers map
   to standard/abstract rigs. (Today: the node-graph editor + Pose Rig + bindings +
   Standard Feature Spaces editor — all to be unified and simplified.)
3. **Face Designer** — compose rigged face components (mouth, eye, etc. — not raw lines)
   into a face, with hand-off to/from external 3D tools (Blender, glTF). (Today: Scene
   Composer + Face Creator + materials/inspector.)

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
3. **One interface, one job.** The three interfaces are distinct surfaces (or distinct
   modes) with a shared shell and component library — not 13 co-resident panels. A user
   in a given role should rarely need to think about the other interfaces.
4. **Engine is fixed substrate.** The UI consumes `@vizij/*` through stable boundaries.
   No business logic in 5,000-line view components; state models stay small and testable.
5. **Standards are first-class, not a tab.** Standard Feature Spaces (`/standard/{ns}/{channel}/{track}/{attribute}`)
   are how faces interoperate. The Rig Designer should treat aligning to a standard as a
   primary, guided action.
6. **Shareable artifacts at every seam.** Faces, rigs, standards, and animations are each
   independently importable/exportable (Fig. 1 hand-offs). Design the library/asset model
   around these four artifact types.

## 5. Sequencing

All three interfaces are in scope; design their information architecture together (shared
shell + component library). **Build order (decided):** bottom-up along the pipeline, then
a reconciliation sweep.

1. **Face Designer first.** You need a composed face (the `d` layer) before there is
   anything to rig or control. Establishes the shared shell, the design system, and the
   component-centric model the other two inherit.
2. **Rig Designer second.** Rigs (`f→d`, `c→f`) build directly on a face. Highest-
   complexity UI and the biggest simplification win; now has real faces to rig against.
3. **Face Controller third.** Drives finished rigs/animations; the integration layer that
   exercises the whole pipeline end-to-end.
4. **Reconciliation sweep across all three.** Revisit each interface to fold back the
   lessons the later designs surfaced (e.g. a control affordance discovered while building
   the Controller that the Face Designer should expose). Treated as a first-class phase,
   not cleanup.

> Rationale for bottom-up over the controller-first alternative: building along the
> pipeline's natural dependency order (`d → f → c → t`) means each interface is designed
> against concrete artifacts the previous one produces, rather than against mocks. The
> trade-off — the core value demonstrator (Controller) lands last — is accepted and
> mitigated by the reconciliation sweep.

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
