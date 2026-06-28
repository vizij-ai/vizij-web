# Authoring Rebuild — Panel Inventory & Grouping

> Decided shell model: **tabs (Build · Rig · Animate · Behave · Drive) are a light mode
> switcher** that *re-emphasizes* panels, not a layout swap; a **stable shared panel
> workspace** persists across tabs (so you can build the face while still seeing rigs and
> animations); and the **menu bar + ⌘K palette** carry the global "extra" commands (`10`,
> coverage board). This doc enumerates every panel we might want and groups them.
>
> Principle: **panels persist; the active tab changes which are foregrounded/expanded, not
> which exist.** The dock frame (left / center / right / bottom) stays constant.

## Panel inventory

Merged from the old tool's 13 panels + the five activities + user stories (`10`). "Dock" =
default home; most can be moved/floated.

| # | Panel | Purpose | Used in | Dock |
| --- | --- | --- | --- | --- |
| 1 | **Library** | Browse/open the 5 artifacts (faces, rigs, standards, animations, behaviors) + recent/templates | all | left / modal |
| 2 | **Hierarchy** | The face's scene/component tree | Build (read elsewhere) | left |
| 3 | **Components** | Palette of face parts to add (eyes, brows, mouth…) | Build | left |
| 4 | **Inputs** | Declared rig inputs / standard feature-space channels | Rig, Animate, Drive | left |
| 5 | **Viewer / Preview** | The live face — the shared target | all (always on) | center |
| 6 | **Graph canvas** | Node graph: rig transforms · procedural animation · behavior logic (one shared canvas) | Rig, Animate, Behave | center |
| 7 | **Inspector** | Properties of the current selection — sections: Transform · Material · Morph · Bindings | all | right |
| 8 | **Standards & coverage** | Map to a standard feature space; coverage meter | Rig | right |
| 9 | **Reference face** | Compare/preview against a reference face | Rig | right / center |
| 10 | **Poses & blend** | Named poses, groups, blend stages (arbitration UX) | Rig | right / bottom |
| 11 | **Timeline** | Keyframe tracks (+ Curve editor sub-panel) | Animate | bottom |
| 12 | **Behavior sequencer** | Chain animations into a behavior / state machine | Behave | bottom / center |
| 13 | **Speech** | TTS, visemes, voice config | Behave | right / modal |
| 14 | **Transport** | Play / pause / scrub / loop / FPS | Animate, Behave, Drive | bottom bar |
| 15 | **Control rack** | Live input sliders/triggers to drive the face | Drive (test in Rig/Animate) | bottom / right |
| 16 | **Multi-face / devices** | Manage multiple faces, screens, device connections | Drive | modal / left |
| 17 | **Developer / API** | API-test console, connection, record-to-animation | Drive | modal |
| 18 | **Diagnostics** | Graph/bundle audit, validation, coverage issues | advanced | modal |
| 19 | **Console / debug** | Logs, memory (dev-only, flagged) | advanced | bottom / modal |
| 20 | **Guide** | Onboarding / next-step overlay | newcomers | overlay |

Not panels (chrome): **activity tabs**, **menu bar**, **⌘K command palette**, top-bar
actions (Undo/Redo/Save/Share).

## Grouping A — by function

- **Navigate & assets:** Library · Hierarchy · Components · Inputs
- **Inspect:** Inspector · Standards & coverage · Reference face
- **Author (graph & poses):** Graph canvas · Poses & blend
- **Time & behavior:** Timeline (+ Curves) · Behavior sequencer · Speech
- **Drive & deploy:** Viewer · Transport · Control rack · Multi-face/devices · Developer/API
- **Diagnose & assist:** Diagnostics · Console · Guide

## Grouping B — by dock region (the actual layout)

- **Left — Navigator:** Library · Hierarchy · Components · Inputs *(stacked/collapsible)*
- **Center — Stage:** Viewer (always) with the Graph canvas layering in when authoring graphs
- **Right — Inspector:** Inspector · Standards & coverage · Reference face · Poses
- **Bottom — Time & drive:** Timeline/Curves · Behavior sequencer · Transport · Control rack
- **Modals/overlays:** Library (full browse) · Speech · Multi-face/devices · Developer/API · Diagnostics · Console · Guide

## How the tabs modulate panels (emphasis, not re-layout)

Same dock; each tab foregrounds the relevant panels and collapses the rest (still one click
away). `●` foregrounded · `○` available/collapsed.

| Panel | Build | Rig | Animate | Behave | Drive |
| --- | --- | --- | --- | --- | --- |
| Components / Hierarchy | ● | ○ | ○ | ○ | ○ |
| Inputs | ○ | ● | ● | ○ | ● |
| Graph canvas | – | ● | ● (procedural) | ● (logic) | – |
| Inspector | ● | ● | ● | ● | ○ |
| Standards & coverage | – | ● | ○ | ○ | – |
| Poses & blend | ○ | ● | ○ | ○ | ○ |
| Timeline / Curves | – | ○ | ● | ○ | ○ |
| Behavior sequencer / Speech | – | – | ○ | ● | ○ |
| Transport | ○ | ○ | ● | ● | ● |
| Control rack | – | ○ | ○ | ○ | ● |
| Viewer | ● | ● | ● | ● | ● |

(The point your steer captured: building a face, the rig/animation panels are still
*there* — collapsed, not gone.)

## Old tool → new panel mapping

`hierarchy → Hierarchy` · `variables/inputs → Inputs` · `materials → Inspector (Material)` ·
`poses → Poses & blend` · `motiongraph(+palette) → Graph canvas` · `animation → Timeline` ·
`speech → Speech` · `referenceFace → Reference face` · `inspector → Inspector` ·
`debug → Console` · `std feature spaces → Standards & coverage`. The 4-workbench +
13-panel show/hide chrome is replaced by the stable dock + tab emphasis.

## Open questions

1. **Graph canvas vs Viewer in the center** — do they co-exist (split), toggle, or does the
   graph live in the bottom dock so the face stays center? (Biggest layout question.)
2. **Poses home** — right Inspector vs bottom dock (it's both authoring and arbitration UX).
3. **Collapsed affordance** — how a collapsed panel signals it's there (rail icons? edge tabs?).
4. **Floating vs docked** — do we allow detaching panels (power users) or keep a fixed dock (simplicity)?
5. **Per-tab defaults vs user override** — can users re-pin panels per tab, and is that remembered?
