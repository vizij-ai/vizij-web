# Personas, Roles & Stakeholders

_Input for the workshop's role-mapping exercise. **Nothing here is validated
research.** PR #65's foundation derived three personas from app and package READMEs
and explicitly noted "no formal persona doc exists in-repo." That is still true —
`VIZ-1 Stakeholder Map` is in the backlog, unstarted. Treat this document as the
**best available inference**, and treat producing the validated version as a workshop
output._

---

## 1. The three personas PR #65 proposed

| Persona                            | Who they are                                                                    | Their job to be done                                                                                                         | Where they work today                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Rig Author** (a.k.a. "operator") | Technical artist / roboticist who imports a raw 3D model and wires it up        | Turn a mesh into a controllable face with named controls, expressions, and validated output                                  | `vizij-authoring` — Rigging, Posing, Standard Feature Spaces, Inspector, Validation                     |
| **Motion Designer**                | Animator / interaction designer authoring how the face moves                    | Build expressions, keyframe animations, and reactive programs; preview live                                                  | `vizij-authoring` — Poses, Animation timeline, Motion-graph, Speech                                     |
| **Integrator / Deployer**          | Web/app developer or robot-fleet operator embedding and driving a finished face | Drop a face into a site or device and drive it live (speech, gaze, emotion) from a host app, robot stack, or remote operator | `@vizij/runtime-react`, `tutorial-*-face`, `demo-vizij-player`, `apps/vizij-standalone`, native `vizij` |

PR #65's own caveat, worth repeating verbatim in the room:

> These personas are not walls — one person may play all three — but they define
> distinct **jobs to be done**, and the proposals differ mainly in how strongly they
> separate or blend them.

---

## 2. Personas the current state suggests are missing

Reading today's Linear board and the last eight weeks of work, at least four more
distinct audiences are being served — none of them are the three above.

### 2.1 The 3D Artist (upstream, never opens Vizij)

The person in Blender who produces the GLB. They are the reason
`Quori_Blender-Export` / `_Current` / `_Extended` variants exist, why there's an
orientation-confirmation dialog, why AgX tone mapping matters (PR #58), why
`rootBounds` gets baked wrong (PR #77), and why morph-weight import matters.

**Their touchpoints are all failure modes.** They have no Vizij surface at all — they
discover problems only when a Rig Author reports them. Every asset bug in the last
month traces to this seam.

### 2.2 The Robot Integrator (ROS-native, doesn't want a face editor)

Distinct from the "web/app developer" half of the Integrator persona. They want:
`ros4hri` topics to drive a face, `hri_msgs/FacialActionUnits` to map losslessly, a
binary they can run (`vizij --ros2`), and a bundle they can graft a profile into
without opening a GUI (`vizij-bundle add-standard`).

**This persona is now first-class in the runtime and invisible in the tooling.** The
entire ROS4HRI Integration project serves them; nothing in `vizij-authoring` is
designed for them. The Quori golden test (`ros4hri_drives_the_adapted_quori`) is
arguably their primary UI.

### 2.3 The Platform Adopter (Peerbots)

The _Peerbots Vizij Adoption_ project (Planned, Saad) and **VIZ-66** ("Fix Vizij
Authoring issues necessary for Peerbots Integration") describe a party who wants to
build a _product_ on Vizij, not a face. Their needs are packaging needs: a stable API,
an embed that doesn't require React, a versioned artifact format, and no surprises.

**They are the customer for PR #65's Track 2** and the reason the missing
`<vizij-face>` embed is a business problem, not a tidiness problem.

### 2.4 The Vizij Maintainer (us)

Worth naming explicitly because a large share of recent work serves this persona:
CI publishing (VIZ-86/88/89), package renames, `.nvmrc`, headless snapshot tests,
API-surface guards, changesets. The maintainer's mental model is the one the docs are
actually written in — which is precisely why user-facing terminology drifted.

---

## 3. Proposed role map for the workshop

Seven roles, arranged along the artifact pipeline:

```text
  ┌────────────┐   GLB    ┌────────────┐  rigged  ┌──────────────┐ expressive
  │ 3D ARTIST  │ ───────► │ RIG AUTHOR │ ───────► │   MOTION     │ ─────────►
  │            │          │            │          │   DESIGNER   │
  │ Blender    │          │ authoring: │          │ authoring:   │
  │ meshes,    │          │ controls,  │          │ expressions, │
  │ morphs,    │          │ ranges,    │          │ clips        │
  │ materials, │          │ links,     │          │              │
  │ bounds     │          │ validation │          │              │
  └────────────┘          └────────────┘          └──────────────┘
        ▲                                                 │
        │ asset bugs found late                           ▼
        │                                        ┌──────────────────┐
        │                                        │  INTERACTION     │  behaving
        │                                        │  DESIGNER        │ ─────────►
        │                                        │ behavior graph,  │
        │                                        │ speech, gaze     │
        │                                        └──────────────────┘
                                                          │
                            ┌─────────────────────────────┴─────────────────┐
                            ▼                                               ▼
                  ┌──────────────────┐                          ┌──────────────────┐
                  │ WEB INTEGRATOR   │                          │ ROBOT INTEGRATOR │
                  │ npm, React,      │                          │ vizij --ros2,    │
                  │ (wants an embed) │                          │ vizij-bundle,    │
                  │ Peerbots         │                          │ ROS4HRI topics   │
                  └──────────────────┘                          └──────────────────┘
                            │                                               │
                            └───────────────────┬───────────────────────────┘
                                                ▼
                                     ┌──────────────────────┐
                                     │  OPERATOR            │
                                     │  live control at     │
                                     │  runtime: Studio     │
                                     │  bridge, web panel,  │
                                     │  remote teleop       │
                                     └──────────────────────┘

                    ┌───────────────────────────────────────────────┐
                    │  MAINTAINER — cuts releases, owns the         │
                    │  contracts every arrow above depends on       │
                    └───────────────────────────────────────────────┘
```

### Role × surface matrix

| Role                     | Primary surface today                          | Has a designed surface? | Sharpest current pain                                                                          |
| ------------------------ | ---------------------------------------------- | :---------------------: | ---------------------------------------------------------------------------------------------- |
| **3D Artist**            | Blender + a GLB export convention              |         ✗ none          | Finds out about bad bounds / orientation / tone mapping only via someone else                  |
| **Rig Author**           | `vizij-authoring` (Rigging, Inspector, SFS)    |        ◐ partly         | Jargon; 4 navigation axes; five validation surfaces; no undo                                   |
| **Motion Designer**      | `vizij-authoring` (Poses, Timeline)            |        ◐ partly         | Same shell as Rig Author; no undo; exclusive-center panels force mode-switching                |
| **Interaction Designer** | `vizij-authoring` (Motion graph, Speech)       |        ◐ partly         | Node graph is expert-only; no keyboard-first alternative; collision precedence undefined       |
| **Web Integrator**       | `@vizij/runtime-react` + tutorials             |      ◐ React only       | **No framework-agnostic embed**                                                                |
| **Robot Integrator**     | `vizij --ros2`, `vizij-bundle`, ROS4HRI topics |     ● (CLI-shaped)      | Profile _edition_ has no surface (VIZ-93)                                                      |
| **Operator**             | Studio bridge, standalone web control panel    |            ◐            | The Tauri app that hosts it is maintenance-only; native replacement's control surface is newer |
| **Maintainer**           | pnpm workspace, CI, changesets                 |            ●            | Two stale redesign drafts; docs drift faster than they're written                              |

---

## 4. Which roles are one person?

This is the question that decides whether PR #65's "role presets" idea is worth
anything. Candid reading:

- **Rig Author + Motion Designer are the same person today**, in practice, on this
  team. Both live in `vizij-authoring` and both are Saad-shaped work.
- **Interaction Designer is aspirational.** Nobody is currently only doing behavior
  graphs and speech.
- **Web Integrator and Robot Integrator are genuinely different people** with almost
  no shared surface. This is the split that matters most.
- **3D Artist is a real, separate person** and is the least-served role in the system.

**Implication:** PR #65's three role presets (Rig / Motion / Deploy) may be the wrong
cut. The load-bearing seams look more like **Author** (one merged persona) vs.
**Embed** (web) vs. **Run** (robot/operator) vs. **Supply** (3D artist).

That's a proposal to argue about, not a conclusion.

---

## 5. Jobs to be done — one line each

Use these as the "when I…, I want to…, so I can…" scaffold in the workshop.

| Role                 | Job                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3D Artist            | _When I export a face from Blender, I want to know immediately whether Vizij will accept it, so I don't find out days later that the bounds are wrong._            |
| Rig Author           | _When I import a mesh, I want to end up with a named, ranged, validated set of controls, so anyone downstream can drive the face without reading my mind._         |
| Motion Designer      | _When I've got a rigged face, I want to build a library of expressions and clips and see them on the real face, so I can judge them before shipping._              |
| Interaction Designer | _When I've got expressions, I want to wire them to signals — speech, gaze, emotion — so the face behaves rather than performs._                                    |
| Web Integrator       | _When I have a finished face, I want to drop it into any web page and drive it with a few function calls, so I don't have to adopt this team's framework choices._ |
| Robot Integrator     | _When I have a robot with a face, I want standard ROS topics to drive it out of the box, so I don't write a mapping layer._                                        |
| Operator             | _When a face is running live, I want to see and override what it's doing from a remote panel, so I can intervene._                                                 |
| Maintainer           | _When any of the above changes, I want one artifact format and one runtime contract to defend, so the surface area stays finite._                                  |

---

## 6. Workshop exercises for this document

**E1 — Role validation (15 min).** Put the seven roles on the wall. For each, name a
_real person_ (inside or outside the company) who occupies it. Roles with no name are
either aspirational or someone's unacknowledged second hat. Both are findings.

**E2 — The merge test (10 min).** For each pair of adjacent roles, ask: _if these were
one person, what would we build differently?_ This is the actual test of whether role
presets are worth building.

**E3 — Underserved-role audit (10 min).** For each role, count the surfaces designed
_for_ them versus surfaces they _cope with_. Expect the 3D Artist to score zero.

**E4 — Close VIZ-1 (10 min).** The output of E1–E3 _is_ the stakeholder map. Write it
down and attach it to VIZ-1.
