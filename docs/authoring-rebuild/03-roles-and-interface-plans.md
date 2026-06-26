# Authoring Rebuild — Roles, Hand-offs & Interface Plans

> Workstream 3. Turns the UR-RAD service blueprint (Fig. 1) into the **roles** Vizij
> serves, the **hand-offs** between them, and an **interface plan for each interface × role
> combination** — so the IA and sketches (Workstream 4) are designed against what each
> role actually needs from each interface.
>
> Builds on `01-conceptual-model.md` (pipeline `d → f → c → t`, six roles → three
> interfaces) and `02-feature-audit.md`.

## Roles vs. personas — terminology

A **role** is a *function* in the Vizij pipeline (Face Designer, Face Rigger, …). A
**persona** is a *real person*, who can hold **several roles at once** — the paper is
explicit that people "can take on many roles." Examples:

- A solo HRI grad student may be Face Designer **and** Face Rigger **and** Animator.
- In the theme-park use case, those roles are split across a team (one person per role).

We design around **roles** (stable, well-defined) and let products/journeys compose them
per persona. A single human moving between roles must be able to move between the matching
interfaces fluidly — that fluidity is itself a design requirement, captured per
combination in §3.

---

## 1. The six roles

Each role notes: its function, its audience lean (**researcher** vs **designer/animator**,
per `01` §4), the pipeline layer it owns, and its primary interface.

| # | Role | Function | Audience lean | Owns | Primary interface |
| --- | --- | --- | --- | --- | --- |
| R1 | **Face Designer** | Compose an expressive face from reusable components | designer/animator | `d` | Face Designer |
| R2 | **Face Rigger** | Map a face-specific vector to face elements (`f → d`) | designer / technical artist | `f → d` rig | Rig Designer |
| R3 | **Abstraction Rigger** | Define face-agnostic rigs + standards (`c → f`, `c → c`) | researcher / technical artist | `c → f` rig, standards | Rig Designer |
| R4 | **Animator** | Define values over time (`t`) that drive a rig | designer/animator | `t` | Face Controller |
| R5 | **Interaction Designer** | Chain behaviors into an interlocutor experience | researcher / product | behavior sequencing | Face Controller |
| R6 | **Developer** | Programmatically control a face from a robotics stack | researcher / engineer | API control | API + Face Controller (testing) |

**Today's friction (from the feature audit), per role**

- **R1** — friendly Face Creator buried under a raw scene-graph; logic inline in a
  5,298-line `App.tsx`.
- **R2** — binding/expression authoring spread across 1,600–1,900-line components; two
  competing rig models.
- **R3** — Standard Feature Spaces is a heavy 3-tab sub-tool; coverage/remap hard to find.
- **R4** — solid timeline, but procedural sources play a confusing dual authoring/playback
  role in `App.tsx`.
- **R5** — speech/conversation capability entangled with external API config + chrome.
- **R6** — no clear API-testing affordance; correctness validated by hand.

---

## 2. Cross-role hand-offs (the seams)

The four artifacts from Fig. 1 are the contracts between roles. The rebuilt asset/library
model is organized around them; all four travel inside the **Vizij bundle** (GLB with
embedded rig graphs — the existing format we keep).

| Artifact | Produced by | Consumed by | Carries |
| --- | --- | --- | --- |
| **Face** (Share Face) | R1 Face Designer | R2 Face Rigger | composed components + low-level `d` (GLB/glTF) |
| **Face-Specific Rig** (Share Rig) | R2 Face Rigger | R3, R4, Controller | `f → d` mapping (node graph) |
| **Standard / Abstract Rig** (Share Standard) | R3 Abstraction Rigger | R4, R5, R6, other faces | `c → f`, standard feature-space defs |
| **Animation** (Share Animation) | R4 Animator, R5 Interaction Designer | Controller, R6 Developer | values over time `t`, behaviors |

---

## 3. Interface plans (interface × role)

One plan per interface × role combination. Each plan states: **the role's need**, the
**default path** (the opinionated journey, designer-friendly), **progressive disclosure**
(the advanced/modular affordances, researcher-friendly — per `01` §4 principle 2), the
**key surfaces**, **artifacts in/out**, and **success criteria**.

Journey format inside each plan: *Stages → Actions → (pain today)*.

### Interface A — Face Designer

Shared shell for all interfaces: global import, the library of the four artifacts, the
preview viewer, and export. The Face Designer interface adds component-composition.

#### A × R1 — Face Designer
- **Need:** compose an expressive face from reusable components and hand it off rigged,
  without touching raw primitives unless desired.
- **Default path:** Open preset/Blender import → adjust components (eyes, brows, lids,
  mouth, cheeks, nose, ears) → style (color, size, material, transform) → resolve
  import orientation/discrepancies → export **Face**. *(today: raw hierarchy first; Face
  Creator hidden; styling split across a Materials panel + 5,547-line inspector.)*
- **Progressive disclosure:** drop to the raw scene-graph; edit primitive shapes
  directly; per-node material/transform overrides; advanced bundle audit.
- **Key surfaces:** component-centric face builder, component-scoped inspector, guided
  import/orientation dialog, preview viewer.
- **Artifacts:** in — glTF/preset; out — **Face**.
- **Success:** a non-programmer composes and exports a riggable face start-to-finish on
  the default path; a researcher can still reach every primitive.

> Note: R2/R3 may *open* a Face here to inspect it, but they do not author components —
> their authoring lives in the Rig Designer. Keep Face Designer single-role to stay simple.

### Interface B — Rig Designer

Serves two roles with overlapping surfaces but different altitude: R2 works in
face-specific terms; R3 works in abstract/standard terms. **Open IA question** (`02`):
unify poses + node graph from day one, or node-graph-first with poses as a later mode.

#### B × R2 — Face Rigger (face-specific, `f → d`)
- **Need:** connect a rig to *this* face's elements with a clear, previewable graph.
- **Default path:** Open a **Face** → declare face-specific inputs `f` → wire the
  transformation graph input→element → (optional) define named poses/blend groups →
  preview live against the face → publish **Face-Specific Rig**. *(today: Variables panel
  = 8,753 lines; two rig models compete; reference-face preview is the top bug source.)*
- **Progressive disclosure:** raw expression editor + pipeline stages; per-output locks;
  graph diagnostics; manual input remapping.
- **Key surfaces:** inputs declaration, unified node graph, pose mode, live preview.
- **Artifacts:** in — **Face** (+ optional imported **Rig** to remap); out — **Rig**.
- **Success:** a technical artist wires inputs→elements and previews live without reading
  source; the graph is the single rig model on screen.

#### B × R3 — Abstraction Rigger (face-agnostic + standards, `c → f`)
- **Need:** define rigs in abstract terms (emotion, gaze, visemes), align to community
  **standards**, and have them translate across faces.
- **Default path:** Open a **Face-Specific Rig** → choose/declare an Abstract Control
  Vector `c` → map `c → f` in the graph → align to a **standard feature space** → check
  coverage against that standard → preview → publish **Standard / Abstract Rig**.
  *(today: standards live in a heavy 3-tab sub-tool; coverage + remap are powerful but
  buried.)*
- **Progressive disclosure:** define arbitrary standards/namespaces; author `c → c`
  translation rigs between standard spaces; cross-face remap wizard; coverage drill-down.
- **Key surfaces:** standards picker + coverage meter, abstract-input declaration, the
  same node graph (abstract mode), cross-face remap.
- **Artifacts:** in — **Rig**; out — **Standard / Abstract Rig** (+ translation rigs).
- **Success:** a rig authored against a standard drives a *different* face with no rewiring;
  coverage against the standard is visible at a glance.

### Interface C — Face Controller

Serves three roles. Loads finished Faces + Rigs/Standards and drives them. Promotes the
live control surface from today's overlay to a primary surface.

#### C × R4 — Animator (`t`)
- **Need:** author behaviors as values over time on a chosen rig, and export them
  (including video / high-FPS).
- **Default path:** Load **Face** + **Rig** → drive inputs to find poses → author on the
  timeline (and/or a procedural source) → scrub/preview → export **Animation** / video.
  *(today: timeline is solid; procedural sources have a confusing dual authoring/playback
  role in `App.tsx`; video/high-FPS export likely a gap.)*
- **Progressive disclosure:** procedural-graph animation sources; curve/interpolation
  editing; per-track targeting; high-FPS render settings.
- **Key surfaces:** control surface, timeline + transport, export.
- **Artifacts:** in — **Face**, **Rig**; out — **Animation**, video.
- **Success:** an animator authors and exports a looping behavior on the default path;
  procedural and keyframe sources are clearly separated from playback.

#### C × R5 — Interaction Designer
- **Need:** sequence behaviors into an interlocutor experience, attach speech/visemes, and
  simulate — possibly across several faces.
- **Default path:** Load Face + Standard → assemble a behavior chain → attach speech (TTS
  + visemes) → simulate the interaction → export **Animation**/scenario. *(today: speech
  works but is entangled with Polly/Deepgram/OpenAI config and panel chrome.)*
- **Progressive disclosure:** raw speech/API configuration; branching/conditional chains;
  multi-face/multi-screen orchestration (**gap to design in**).
- **Key surfaces:** behavior sequencer, optional speech module, multi-face simulation.
- **Artifacts:** in — **Standard**, **Animation**; out — **Animation** / scenario.
- **Success:** an interaction can be assembled and simulated without configuring an API on
  the default path; speech is an opt-in module, not core chrome.

#### C × R6 — Developer
- **Need:** drive a face from code (set values now, over time, or play pre-recorded
  animations) and verify behavior matches.
- **Default path:** Export the **Standard** rig + bundle → drive the same face from the
  robotics stack via API → use the Controller as a reference monitor to verify.
  *(today: no clear API-testing affordance — a gap.)*
- **Progressive disclosure:** an in-tool API console / live value inspector; record live
  control into a reusable **Animation**; protocol/connection diagnostics.
- **Key surfaces:** API-test surface (**gap to add**), live value inspector, the viewer as
  reference monitor.
- **Artifacts:** in — **Standard**, **Animation**; out — recorded **Animation**.
- **Success:** a developer drives the standard rig from code and confirms parity in the
  Controller; swapping face/robot needs no code change.

### Coverage matrix

| Interface | R1 | R2 | R3 | R4 | R5 | R6 |
| --- | --- | --- | --- | --- | --- | --- |
| Face Designer | ● primary | ○ inspect | ○ inspect | – | – | – |
| Rig Designer | – | ● primary | ● primary | ○ open rig | – | ○ inspect |
| Face Controller | – | – | – | ● primary | ● primary | ● primary (API) |

● author · ○ read-only/secondary · – not served

---

## 4. End-to-end use-case journeys (from the paper)

Validate that the hand-offs connect across roles (and that one persona can span them).

### UC1 — HRI Researcher comparing two gaze systems (paper Use Case 1)
1. **R5 Interaction Designer (PI)** defines the study interactions in the Controller,
   targeting a **Standard** gaze rig.
2. **R6 Developer (grad student)** builds two gaze algorithms emitting the standard gaze
   `c`, drives the face via API. Both target the standard → swapping robot/face needs no
   code change.
3. **Controller** runs both behaviors on the same face to compare.
4. Researchers **Share Face + Rig** for replicability.
- **Hand-offs:** Standard → (Developer code + Controller); Face/Rig shared out.
- **Persona note:** often *one* grad student spanning R5 + R6 → fluid C×R5 ↔ C×R6.

### UC2 — Robotic Theme Park (paper Use Case 2)
1. **R1 Face Designer (expert)** develops characters/faces → **Share Face**.
2. **R6 Developer (product team)** imports faces, builds controls on public **Standard**
   rigs, adds **custom rigs** for unique features.
3. **R4 Animator** authors character behaviors looped into the story → **Share Animation**.
- **Hand-offs:** Face → Rig (standard + custom) → Animation, across a team (one role each).

---

## 5. What this feeds into Workstream 4 (IA + sketches)

- A **screen inventory per interface** derived from the §3 plans.
- A **shared app shell** (import, library of the four artifacts, preview viewer, export).
- **Progressive-disclosure boundaries** per interface × role (default vs advanced).
- **Role-switching fluidity** within a persona (esp. R5↔R6, R1→R2→R4 for a solo user).
- Two open IA questions to resolve: (a) poses unified with node graph or phased;
  (b) how multi-face/multi-screen control is represented in the Controller.

> Validation note: walk UC1 and UC2 through the draft screens with one researcher-type and
> one designer-type user before committing IA (Workstream 6 brings formal testing).
