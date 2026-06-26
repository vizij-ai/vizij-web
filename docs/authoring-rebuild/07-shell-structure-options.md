# Authoring Rebuild — Shell Structure Options (Workstream 4, first cut)

> Three alternative structures for how the **five interfaces** (Face Designer · Rig Designer
> · Animation Designer · Behavior Designer · Face Controller) are organized and switched
> between. This is the first IA decision — the "shell" everything else sits inside. Each
> option draws from a different product lineage. Sketches live alongside this in the chat;
> ASCII wireframes below keep the doc self-contained.
>
> Builds on `01` (five interfaces, principles), `03` (roles/personas), `04`/`05`/`06`
> (arbitration UX, inputs, tool fundamentals all live *inside* whichever shell we pick).

## The axis that distinguishes them

All three show the **same five interfaces** over a **persistent face preview**. They differ
on **how you switch** between interfaces — which is really a bet on the primary user:

- **A — explicit modes** (focus; teams). Heavyweight, deliberate switching.
- **B — fluid contextual** (flow; solo power users). Lightweight, blurred switching.
- **C — guided steps** (approachability; newcomers). Sequential, scaffolded switching.

---

## Option A — Studio Modes

*Inspiration: Lightroom modules · Blender workspace tabs · Adobe workspaces.*

A prominent **mode bar** across the top with the five interfaces as tabs. Clicking one
swaps the entire layout (panels, tools, docks) for that job. The face preview and the
project persist across modes; everything else reconfigures.

```
┌───────────────────────────────────────────────────────┐
│ ◐  [ Face ] [ Rig ] [ Animate ] [ Behave ] [ Control ] │  ← mode bar
├──────────────┬───────────────────────────┬─────────────┤
│ tools /      │                           │ inspector   │
│ library      │     face preview          │ (context)   │
│              │     (persistent)          │             │
├──────────────┴───────────────────────────┴─────────────┤
│ timeline / graph dock (mode-dependent)                  │
└─────────────────────────────────────────────────────────┘
```

- **Strengths:** strongest "one interface, one job" (`01` §4.3); each mode is purpose-built
  and uncluttered; familiar to Adobe/Blender users; easy to design each studio independently
  (matches our build order).
- **Weaknesses:** switching is heavyweight — a solo user (Sam) who hops modes constantly
  feels the friction; risk of feeling siloed / "five apps in a trench coat"; shared context
  (selection, time) must be carefully carried across modes.
- **Best for:** team workflows where one person owns one role (Maya, Tariq, Lena); the
  build-order sequencing maps cleanly to modes.

## Option B — Unified Workspace

*Inspiration: Figma (one canvas + contextual right panel + Design/Prototype/Dev toggle).*

A single persistent workspace. The face canvas is always center. A **light mode toggle**
(segmented control) nudges the layout between Design/Rig/Animate/Run rather than swapping
it wholesale; the side panels are **selection-driven** and the bottom dock (timeline/graph)
toggles in when relevant.

```
┌───────────────────────────────────────────────────────┐
│ ◐         ( Design | Rig | Animate | Run )          ▾  │  ← light toggle
├──┬───────────┬───────────────────────────┬─────────────┤
│⌖ │ layers /  │                           │ contextual  │
│▤ │ inputs    │     face canvas           │ panel       │
│⚙ │           │   (always present)        │ (selection) │
│⚡│           │                           │             │
├──┴───────────┴───────────────────────────┴─────────────┤
│ ▭ timeline / graph (toggle)                             │
└─────────────────────────────────────────────────────────┘
```

- **Strengths:** lowest switching cost — ideal for the solo multi-role user (Sam); the
  always-present canvas keeps you oriented; contextual panels reduce clutter without
  full-screen swaps; pairs naturally with a "control rack" (`05` Variation C).
- **Weaknesses:** the biggest risk is *re-creating today's everything-on-one-screen
  problem* — only works if progressive disclosure is ruthless; "which job am I in?" can blur.
- **Best for:** power users and solo spanners; fluid Sam-style hopping between rig/animate/
  drive.

## Option C — Guided Pipeline

*Inspiration: Canva (template-first, simple rail) · wizard/stepper patterns.*

The pipeline itself is the navigation: a **stepper** (Build → Rig → Move → Behave → Drive)
as a left rail (or top progress bar). Each step opens a focused, simplified workspace with
strong defaults/templates; advanced controls hide behind "Advanced ›". You can progress or
jump, and the stepper teaches the `d → f → c → t → behavior` model as you go.

```
┌───────────────────────────────────────────────────────┐
│ ◐  project: Toasty                              [Share] │
├──────────────┬──────────────────────────────────────────┤
│ ① Build      │                                          │
│ ② Rig    ◀   │     focused tools for this step          │
│ ③ Move       │     (simple by default)                  │
│ ④ Behave     │     face preview        [ Advanced › ]   │
│ ⑤ Drive      │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- **Strengths:** most approachable (Priya, Maya's brand team); teaches the mental model;
  best onboarding; progressive disclosure is native, not bolted on; template-first start.
- **Weaknesses:** linear framing can feel constraining/"baby" to experts; non-linear jumping
  needs careful design; a deep tool (Rig Designer) still needs room inside a step.
- **Best for:** newcomers and non-technical roles; onboarding and first-project flows.

---

## Comparison

| Dimension | A · Studio Modes | B · Unified Workspace | C · Guided Pipeline |
| --- | --- | --- | --- |
| Switching | explicit tabs (heavy) | light toggle + context (fluid) | stepper (sequential) |
| Mental model | "five studios" | "one studio, many tools" | "an assembly line" |
| Best persona | team (one role each) | solo power user (Sam) | newcomer (Priya) |
| Progressive disclosure | per-mode layouts | must be ruthless | native |
| Risk | feels siloed | clutter creeps back | feels constraining |
| Role-switch fluidity | medium | high | low–medium |
| Onboarding | medium | low | high |
| Closest precedent | Lightroom / Blender | Figma | Canva |

## Recommendation (for discussion, not locked)

These aren't mutually exclusive — the strongest products **layer them**. A likely hybrid:

> **Studio Modes (A) as the backbone** (clear, buildable, one-job-per-mode), **with B's
> contextual panels and persistent canvas inside each mode** (so switching tools within a
> job is fluid), **and C's guided stepper as an optional onboarding overlay / "project
> setup" path** for newcomers that hands off into the modes.

This gives focus *and* fluidity, with an approachable on-ramp — serving teams, solo
spanners, and newcomers from one shell.

## Next steps

- Get a read on which structure (or hybrid) to prototype.
- Turn the chosen direction into a **Figma frame** of the shell (the first Figma artifact),
  then design the first studio (Face Designer) inside it.
- Validate the switching model against the journeys in `03` — especially Sam (frequent
  switching) and Priya (never leaves the guided path).

> Open question: do we commit to one structure, or prototype two (e.g. A-hybrid vs. C) and
> test them with a designer-type and a researcher-type user before locking the shell?
