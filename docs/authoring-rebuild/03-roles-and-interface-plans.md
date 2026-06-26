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
| R4 | **Animator** | Define values over time (`t`) that drive a rig — keyframe + procedural | designer/animator | `t` | **Animation Designer** |
| R5 | **Interaction Designer** | Sequence animations into behaviors (logic + speech) | researcher / product | behavior | **Behavior Designer** |
| R6 | **Developer** | Programmatically control a face from a robotics stack | researcher / engineer | API control | **Face Controller** + API |

> The paper grouped roles into three interfaces; we use **five** (`01` §3): Animation
> Designer and Behavior Designer are split out from what the paper folded into the Face
> Controller, because the tooling now supports keyframe + procedural animation authoring
> and behavior design that the paper did not cover.

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

Fig. 1 named four artifacts; we add a fifth (**Behavior**) for the new layer. The rebuilt
asset/library model is organized around them; all travel inside the **Vizij bundle** (GLB
with embedded rig graphs — the existing format we keep).

| Artifact | Produced by | Consumed by | Carries |
| --- | --- | --- | --- |
| **Face** (Share Face) | R1 Face Designer | R2 Face Rigger | composed components + low-level `d` (GLB/glTF) |
| **Face-Specific Rig** (Share Rig) | R2 Face Rigger | R3, R4, Controller | `f → d` mapping (node graph) |
| **Standard / Abstract Rig** (Share Standard) | R3 Abstraction Rigger | R4, R5, R6, other faces | `c → f`, standard feature-space defs |
| **Animation** (Share Animation) | R4 Animator | R5, Controller, R6 Developer | values over time `t` (keyframe or procedural) |
| **Behavior** (Share Behavior) *(new)* | R5 Interaction Designer | Controller, R6 Developer | sequences of animations + logic + speech |

---

## 3. Interface plans (interface × role)

One plan per interface × role combination. Each plan states: **the role's need**, the
**default path** (the opinionated journey, designer-friendly), **progressive disclosure**
(the advanced/modular affordances, researcher-friendly — per `01` §4 principle 2), the
**key surfaces**, **artifacts in/out**, and **success criteria**.

Journey format inside each plan: *Stages → Actions → (pain today)*.

### Interface A — Face Designer

Shared shell for all interfaces: global import, the library of the five artifacts, the
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

### Interface C — Animation Designer *(new — not a distinct interface in the paper)*

Authors values over time `t` against a finished rig. **Two modes that emit the same
Animation artifact:** keyframe (timeline) and procedural (node graph). **Open IA question**
(`01` §3): one interface with two modes (assumed here) vs. two interfaces.

#### C × R4 — Animator (`t`)
- **Need:** author animations on a chosen rig via keyframes and/or procedural generation,
  and export them (including video / high-FPS).
- **Default path:** Load **Face** + **Rig** → drive inputs to find poses → **keyframe
  mode**: author on the timeline; **procedural mode**: build a generator graph → scrub/
  preview → export **Animation** / video. *(today: timeline is solid; procedural
  "motiongraph" has a confusing dual authoring/playback role in `App.tsx`; video/high-FPS
  export likely a gap.)*
- **Progressive disclosure:** curve/interpolation editing; per-track targeting; procedural
  graph palette + value charts; high-FPS render settings.
- **Key surfaces:** keyframe timeline + transport, procedural node-graph canvas (§ shared
  with Rig Designer), preview, export.
- **Artifacts:** in — **Face**, **Rig**; out — **Animation**, video.
- **Success:** an animator authors and exports a looping animation on the default path;
  keyframe vs procedural is a clear mode switch, and authoring is separate from playback.

### Interface D — Behavior Designer *(new — not in the paper)*

Sequences animations into behaviors with logic and speech, and simulates an interlocutor
experience. Backed by the orchestrator (`@vizij/orchestrator-react`, blackboard).

#### D × R5 — Interaction Designer
- **Need:** compose animations into an experience, attach speech/visemes, add reactive
  logic, and simulate — possibly across several faces.
- **Default path:** Load **Face** + **Standard** + **Animation**(s) → assemble a behavior
  (sequence/state machine) → attach speech (TTS + visemes) → add simple triggers/logic →
  simulate → publish **Behavior**. *(today: speech works but is entangled with Polly/
  Deepgram/OpenAI config; sequencing is ad-hoc across `App.tsx`.)*
- **Progressive disclosure:** raw speech/API configuration; branching/conditional logic on
  the node-graph canvas; multi-face/multi-screen orchestration (**gap to design in**);
  blackboard inspector.
- **Key surfaces:** behavior sequencer/state machine, optional speech module, logic graph,
  multi-face simulation.
- **Artifacts:** in — **Standard**, **Animation**; out — **Behavior**.
- **Success:** a behavior can be assembled and simulated without configuring an API on the
  default path; speech and logic are opt-in modules, not core chrome.

### Interface E — Face Controller

Connects a Face + rigs + animations + behaviors to render and *drive* them at runtime —
single or many faces, one or many screens — and is where a Developer tests programmatic
control. Backed by `@vizij/runtime-react`. Promotes today's control overlay to a primary
surface. (R4/R5 also use it to preview their work; R6 is the authoring/testing role here.)

#### E × R6 — Developer
- **Need:** drive a face from code (set values now, over time, or play pre-recorded
  animations/behaviors) and verify behavior matches.
- **Default path:** Export the **Standard** rig + **Behavior**/**Animation** bundle → drive
  the same face from the robotics stack via API → use the Controller as a reference monitor
  to verify. *(today: no clear API-testing affordance — a gap.)*
- **Progressive disclosure:** in-tool API console / live value inspector; record live
  control into a reusable **Animation**; multi-face/multi-screen routing; protocol/
  connection diagnostics.
- **Key surfaces:** API-test surface (**gap to add**), live value inspector, multi-face
  runtime view, the viewer as reference monitor.
- **Artifacts:** in — **Standard**, **Animation**, **Behavior**; out — recorded **Animation**.
- **Success:** a developer drives the standard rig from code and confirms parity in the
  Controller; swapping face/robot needs no code change.

### Coverage matrix

| Interface | R1 | R2 | R3 | R4 | R5 | R6 |
| --- | --- | --- | --- | --- | --- | --- |
| Face Designer | ● primary | ○ inspect | ○ inspect | – | – | – |
| Rig Designer | – | ● primary | ● primary | ○ open rig | – | ○ inspect |
| Animation Designer | – | – | – | ● primary | ○ uses anims | – |
| Behavior Designer | – | – | – | ○ uses anims | ● primary | ○ inspect |
| Face Controller | ○ preview | ○ preview | ○ preview | ● preview | ● preview | ● primary (API) |

● author · ○ read-only / secondary / preview · – not served

---

## 4. End-to-end use-case journeys (from the paper)

Validate that the hand-offs connect across roles (and that one persona can span them).

### UC1 — HRI Researcher comparing two gaze systems (paper Use Case 1)
1. **R5 Interaction Designer (PI)** defines the study interactions in the Behavior
   Designer, targeting a **Standard** gaze rig, and drives them in the Face Controller.
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
- A **shared app shell** (import, library of the five artifacts, preview viewer, export).
- **Progressive-disclosure boundaries** per interface × role (default vs advanced).
- **Role-switching fluidity** within a persona (esp. R5↔R6, R1→R2→R4→R5 for a solo user).
- A **shared node-graph canvas** reused by Rig Designer, Animation Designer (procedural),
  and Behavior Designer (logic) — design it once (`01` §4.7).
- Open IA questions to resolve: (a) poses unified with the node graph or phased;
  (b) Animation Designer as one interface (two modes) vs. two interfaces;
  (c) how multi-face/multi-screen control is represented in the Controller.

> Validation note: walk UC1 and UC2 through the draft screens with one researcher-type and
> one designer-type user before committing IA (Workstream 6 brings formal testing).
