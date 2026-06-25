# Authoring Rebuild — Personas & Journey Maps

> Workstream 3. Turns the UR-RAD service blueprint (Fig. 1) into concrete personas and
> end-to-end journeys, so the IA and sketches (Workstream 4) are designed against real
> user goals and the cross-role hand-offs are explicit.
>
> Builds on `01-conceptual-model.md` (pipeline `d → f → c → t`, six roles → three
> interfaces) and `02-feature-audit.md`.

## How to read this

- **Personas** (§1) cover the six roles. Each maps to a primary interface and to one of
  the two locked audiences: **researchers** and **designers/animators**.
- **Hand-offs** (§2) are the seams between roles/interfaces — the paper's "Share Face /
  Rig / Standard / Animation". These become import/export + library flows.
- **Per-interface journeys** (§3) follow the build order: Face Designer → Rig Designer →
  Face Controller.
- **End-to-end use-case journeys** (§4) trace the paper's two worked examples across
  multiple roles, validating that the hand-offs connect.

---

## 1. Personas

Each persona notes: who they are, their goal, expertise, today's friction (from the
feature audit), and what "success" looks like in the rebuilt tool.

### P1 — Face Designer ("Maya", designer/animator)
- **Goal:** compose an expressive robot face from reusable components (eyes, brows, mouth)
  and hand it off rigged.
- **Expertise:** visual design, possibly Blender; not a programmer.
- **Today's friction:** the path runs through a raw scene-graph hierarchy and a 5,298-line
  orchestrator; the genuinely friendly Face Creator is buried.
- **Success:** start from a preset or Blender import, adjust components and look, and
  export a face others can rig — without touching raw primitives unless she wants to.
- **Primary interface:** Face Designer.

### P2 — Face Rigger ("Sam", designer/animator or technical artist)
- **Goal:** connect a rig to *this* face's elements — map a Face-Specific Vector `f` to the
  low-level properties `d`.
- **Expertise:** comfortable with node graphs / expressions; understands the specific face.
- **Today's friction:** binding/expression authoring lives in 1,600–1,900-line components;
  two rig models (pose rig vs node graph) compete.
- **Success:** open a face, wire a clear node graph from named inputs to face elements,
  preview live, and publish a face-specific rig.
- **Primary interface:** Rig Designer.

### P3 — Abstraction Rigger ("Alex", researcher or technical artist)
- **Goal:** define face-agnostic rigs — map an Abstract Control Vector `c` (emotion, gaze,
  visemes) to face-specific `f`, and align to community **standards**.
- **Expertise:** thinks in abstractions and standards; wants rigs that transfer across faces.
- **Today's friction:** Standard Feature Spaces is a heavy 3-tab sub-tool; coverage and
  remap are powerful but hard to find.
- **Success:** build a rig against a standard, see coverage against that standard, and have
  it translate from one face/rig to another.
- **Primary interface:** Rig Designer (standards-focused mode).

### P4 — Animator ("Jordan", designer/animator)
- **Goal:** define behaviors/animations — values over time (`t`) — that drive a rig, and
  export them (incl. video / high-FPS).
- **Expertise:** keyframe animation, timelines; not necessarily a rigger.
- **Today's friction:** the timeline is solid, but procedural ("motiongraph") sources play
  a confusing dual authoring/playback role inside `App.tsx`.
- **Success:** pick a rig, author on a timeline (and/or a procedural source), scrub/preview,
  and export animations as reusable artifacts or video.
- **Primary interface:** Face Controller.

### P5 — Interaction Designer ("Robin", researcher or product/UX)
- **Goal:** define the interlocutor experience — chain animations into behaviors, simulate
  conversations, including speech/visemes.
- **Expertise:** interaction/conversation design; thinks in scenarios, not keyframes.
- **Today's friction:** speech/conversation capability exists but is entangled with
  external API config and panel chrome.
- **Success:** sequence behaviors, attach speech, and simulate a chain of interactions on
  a face (or several) to validate the experience.
- **Primary interface:** Face Controller.

### P6 — Developer ("Devin", researcher/engineer)
- **Goal:** programmatically control a face from a robotics stack — set values now, set
  values over time, play pre-recorded animations.
- **Expertise:** software engineering; lives in code, uses the GUI to test.
- **Today's friction:** no clear "API testing" affordance; correctness is validated by
  hand.
- **Success:** use the standard rig + bundle from the GUI, then drive the same face from
  code; use the Controller to verify behaviors match.
- **Primary interface:** API first; Face Controller for testing.

### Audience lens (researchers vs designers/animators)
- **Researchers** (P3, P5, P6, sometimes P1) prize *modularity and inspectability* — the
  ability to swap or examine any single module. Served by **progressive disclosure**:
  advanced controls and raw views available, not default.
- **Designers/animators** (P1, P2, P4) prize *a clean opinionated path*. Served by the
  default flow of each interface.

---

## 2. Cross-role hand-offs (the seams)

The four artifacts from Fig. 1 are the contracts between interfaces. The rebuilt asset/
library model is organized around them.

| Artifact | Produced by | Consumed by | Carries |
| --- | --- | --- | --- |
| **Face** (Share Face) | Face Designer | Face Rigger | composed components + low-level `d` layer (GLB/glTF) |
| **Face-Specific Rig** (Share Rig) | Face Rigger | Abstraction Rigger, Animator, Controller | `f → d` mapping (node graph) |
| **Standard / Abstract Rig** (Share Standard) | Abstraction Rigger | Animator, Interaction Designer, Developer, other faces | `c → f`, standard feature-space definitions |
| **Animation** (Share Animation) | Animator, Interaction Designer | Controller, Developer | values over time `t`, behaviors |

All four travel inside the **Vizij bundle** (GLB with embedded rig graphs) — the existing
export format we keep. The library/import UX is how these hand-offs feel in the product.

---

## 3. Per-interface journeys

Format per journey: **Stages → Actions → Touchpoint → Pain today → Artifact in/out.**

### 3.1 Face Designer journey (P1 Maya)

| Stage | Action | Touchpoint | Pain today | Artifact |
| --- | --- | --- | --- | --- |
| Start | Open a preset or import a Blender/glTF face | Import + Face Designer | Raw hierarchy first; Face Creator hidden | in: glTF/preset |
| Compose | Toggle/adjust components (eyes, brows, lids, mouth, cheeks, nose, ears) | Face Designer (component-centric) | Logic lives inline in `App.tsx` | — |
| Style | Set colors, sizes, materials, transforms | Inspector (component-scoped) | Split across Materials panel + 5,547-line inspector | — |
| Confirm | Resolve import orientation / discrepancies | Guided dialog | Standalone panels | — |
| Hand off | Export a rigged face | Bundle export | Bundle audit heavy | out: **Face** |

- **Default path** (designer): preset → adjust components → style → export.
- **Advanced (researcher):** drop to raw scene-graph nodes, edit primitives directly.

### 3.2 Rig Designer journey (P2 Sam — face-specific; P3 Alex — abstraction)

| Stage | Action | Touchpoint | Pain today | Artifact |
| --- | --- | --- | --- | --- |
| Open | Load a Face (from hand-off) | Rig Designer | — | in: **Face** |
| Declare | Define rig inputs (face-specific `f`, or abstract `c`) | Inputs surface | Variables panel = 8,753 lines | — |
| Wire | Build the transformation graph input→output | Node graph (unified) | Two competing models (pose rig vs motiongraph) | — |
| Pose (opt) | Define named poses, blend groups | Pose mode (unified into graph) | Separate store/services | — |
| Align (P3) | Map to a standard feature space; check coverage | Standards mode | Heavy 3-tab tool | in/out: **Standard** |
| Preview | Drive inputs live; compare to reference face | Live preview | Reference-face runtime = top bug source | — |
| Remap (opt) | Map an imported rig onto this face | Remap wizard | Buried | in: **Rig** |
| Publish | Export face-specific and/or abstract rig | Bundle export | — | out: **Rig** / **Standard** |

- **Open question (from audit):** poses + node graph unified from day one, vs node-graph-
  first with poses later. Resolve in Workstream 4.

### 3.3 Face Controller journey (P4 Jordan, P5 Robin, P6 Devin)

| Stage | Action | Touchpoint | Pain today | Artifact |
| --- | --- | --- | --- | --- |
| Load | Open a Face + its Rig(s)/Standard | Controller | — | in: **Face**, **Rig**, **Standard** |
| Drive | Manipulate rig inputs live (single or many faces) | Control surface (promoted from overlay) | Controls are an overlay; multi-face unclear | — |
| Animate (P4) | Author on timeline and/or procedural source | Timeline + transport | Procedural dual-role in `App.tsx` | out: **Animation** |
| Sequence (P5) | Chain behaviors; attach speech/visemes; simulate | Behavior/speech modules | Speech entangled with API config | out: **Animation** |
| Test (P6) | Drive from code via API; verify in Controller | API + Controller | No clear API-test affordance (gap) | in: **Animation** |
| Export | Save animations / render video / high-FPS | Export | Video/high-FPS likely a gap | out: **Animation**, video |

- **Gaps to design in (from audit):** multi-face/multi-screen control, video/high-FPS
  export, a Developer API-testing surface.

---

## 4. End-to-end use-case journeys (from the paper)

These validate that the hand-offs connect across roles.

### UC1 — HRI Researcher comparing two gaze systems (paper Use Case 1)
1. **Interaction Designer (PI)** defines the study interactions (Controller: sequence
   behaviors). → uses a **Standard** gaze rig.
2. **Developer (grad student)** builds two gaze algorithms, each emitting the standard gaze
   **Abstract Control Vector**, and drives the robot face via API. Because both target the
   standard rig, swapping robot/face requires no code change.
3. **Controller** runs both behaviors on the same face for comparison.
4. Researchers **Share Face + Rig** so the study is replicable.
- **Hand-offs exercised:** Standard → (Developer code + Controller); Face/Rig shared out.
- **Audience:** researcher-heavy → progressive disclosure + modular swap are essential.

### UC2 — Robotic Theme Park (paper Use Case 2)
1. **Face Designer (expert)** develops robot characters and face designs. → **Share Face**.
2. **Developer (technical product team)** imports the faces, builds controls on **Standard
   rigs** (fast, since standards are public), and adds **custom rigs** for unique features.
3. **Animator** uses those rigs to author character behaviors, looped into the story. →
   **Share Animation**.
- **Hand-offs exercised:** Face → Rig (standard + custom) → Animation, across a team.
- **Audience:** designer/animator-heavy → the clean default path matters most.

---

## 5. What this feeds into Workstream 4 (IA + sketches)

- A **screen inventory per interface** derived from the journey stages above.
- A **shared app shell** (import, library of the four artifacts, preview viewer, export).
- Explicit **progressive-disclosure boundaries** per persona (default vs advanced).
- Two open IA questions to resolve: (a) poses unified with node graph or phased;
  (b) how multi-face/multi-screen control is represented in the Controller.

> Validation note: before committing IA, walk UC1 and UC2 through the draft screens with
> one researcher-type and one designer-type user (Workstream 6 brings formal testing; an
> early informal pass here de-risks the IA).
