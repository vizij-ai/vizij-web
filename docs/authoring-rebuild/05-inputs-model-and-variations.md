# Authoring Rebuild — Inputs Model & Variations

> Deep-dive on the **inputs** piece (`04-beyond-the-paper.md` B5–B7). We started exploring
> inputs inside the procedural / motion-graph editor; this captures what exists today, why
> it needs significant refinement, and **several UX variations to evaluate** before the IA
> work (Workstream 4). Variations here are structural/textual; visual mockups come next.
>
> Grounded in `apps/vizij-authoring/src/motiongraph/*`, `components/panels/inputCatalog.ts`,
> and `hooks/rigController/runtimeInput*`.

## 1. What "inputs" are today

Inputs are the values that flow *into* a graph (rig or procedural) and get driven at
runtime. Four kinds exist:

| Kind (`controlKind`) | Source | Authored? | Notes |
| --- | --- | --- | --- |
| **Rig input** | standard feature-space channel (e.g. `sensors/face/jaw_open`) | yes (enable) | has range + default from the rig schema |
| **Custom input** | arbitrary user path | yes (typed in) | no validation; silently no-ops if nothing provides it |
| **Pose weight** | auto-derived, one per pose | no (implicit) | lets you drive blend weights as inputs |
| **Group / stage output** | derived blend summaries | no (read-only) | reference-only in the catalog |

**Declaration flow today:** open the **Input Sets** panel → browse the **input catalog
tree** (path hierarchy) → toggle an input into `enabledInputs` → it appears as an
`__input_source` node on the canvas → manually wire its output port to downstream nodes.

**Runtime/value provisioning today:** each input node has a **control mode** —
- **Instant** — slider moves push immediately (`appliedValue` = `targetValue`).
- **Trigger** — slider stages `targetValue`; a button commits it to `appliedValue`.
- **Grouped** — multi-input coordinated commit (mostly internal).

An `InputValueBridge` watches the editor store and calls `setInput(path, value)` on the
orchestrator when `appliedValue` changes (deduplicated).

## 2. Why it needs significant refinement

From the current-state map, the rough edges cluster into five problems:

1. **Scattered authoring surface.** Declaring, enabling, typing, ranging, and mode-setting
   an input is spread across a tree panel + an inspector + the node itself. No single "here
   are my inputs" home.
2. **No staging feedback.** Instant vs. trigger is subtle; there's no visible "pending /
   staged / applied" state, so users can't tell what's queued vs. live.
3. **Brittle custom inputs.** Any string is accepted; no validation, no "is this actually
   wired to data?" test. Silent no-ops.
4. **Implicit pose-weight inputs.** They appear without author action, are hard to trace
   back to their pose, and orphan when a pose is deleted.
5. **No notion of an input *source*.** Today an input is effectively "a value someone
   sets." There's no first-class concept that an input could be driven by a slider, time, a
   sensor/external feed, an animation, or an expression — yet that's exactly what
   reactivity (B5–B7) needs.

> The crux: today inputs conflate **declaration** (what input exists, its type/range),
> **binding** (where it feeds in the graph), and **driving** (what supplies its value).
> The refinement should separate these three concerns cleanly.

## 3. Design goals for the refined input model

- **One home for inputs** — declare/type/range/organize in one place; bind by reference.
- **First-class input *sources*** — manual control, time, external/sensor feed, animation,
  expression. Swappable without rewiring the graph.
- **Visible state** — every input shows current value + staged/applied + source at a glance.
- **Validation & testability** — typed ranges enforced; custom/external inputs can be
  test-fed and show "receiving data / not connected."
- **Traceable derived inputs** — pose-weight (and other derived) inputs link back to their
  source object and clean up with it.
- **Cross-interface reuse** — the same input model serves Rig Designer, Animation Designer
  (procedural), and Behavior Designer (the shared node-graph canvas, `01` §4.7).

## 4. Variations to evaluate

Each variation is a different answer to *"where do inputs live and how are they driven?"*
All assume the separation of declaration / binding / driving from §2. Trade-offs noted.

### Variation A — Cleaned-up catalog + on-canvas nodes (evolution of today)

Inputs stay as nodes on the graph; the catalog/Input-Sets panel is tidied (search,
favorites, recents), and each input node gets an inline source selector + staging badge.

```
[ Input Catalog ]            Canvas
 ▸ sensors/face              ┌───────────────┐
   • jaw_open  [+]           │ jaw_open       │──▶ (graph)
 ▸ poses                     │ src: ◉ manual  │
   • smile.weight [+]        │ val: 0.62 ●live│
 ▸ + custom…                 └───────────────┘
```

- **+** Minimal departure from today; graph-centric; inputs visible where used.
- **−** Inputs still scattered across canvas; hard to get a global "all my inputs" view;
  doesn't scale to many inputs.

### Variation B — Dedicated Inputs panel (declare once, reference everywhere)

A first-class **Inputs panel** is the single home: declare an input with name, type, range,
default, and **source**. The graph references inputs by name (a thin reference node, or
just a dropdown on a consuming node). Driving happens in the panel.

```
[ Inputs ]                                  Canvas
 Name        Type  Range     Source   Value  ┌──────────────┐
 jaw_open    f32   0..1      manual   0.62   │ Σ mouth.open │
 gaze.x      f32  -1..1      sensor   ⟳ 0.10 │  ◂ jaw_open  │
 smile.wt    f32   0..1      anim     ▶ 0.30 │  ◂ smile.wt   │
 [+ add input]                               └──────────────┘
```

- **+** One scannable home; scales to many inputs; clean declaration/binding/driving split;
  sources are obvious and swappable; easiest to validate + show "receiving data."
- **−** Adds indirection (reference vs. inline node); a graph-native user may want the value
  visible on the canvas (mitigate with hover/peek).

### Variation C — Control rack / "mixer" (driving decoupled from authoring)

Inputs are declared (as in B) but **driving** is a separate **control rack** — a panel of
live controls (sliders, toggles, XY pads, trigger buttons, curve mini-editors) you use to
*perform* / test the face, decoupled from graph editing. Think a synth/mixer surface.

```
[ Control Rack ]
 jaw_open  ▕▔▔▔●▔▏ 0.62   gaze  (XY pad ⊕)   smile  [▶ trigger]
 brow_raise▕▔●▔▔▏ 0.30   blink [▶]           idle   ◉ on
```

- **+** Excellent for testing/performing and for the Face Controller; great staging/live
  feedback; maps naturally to multi-face driving and to a developer "drive it live" view.
- **−** Two surfaces (declare vs. drive) to keep in sync; on its own it doesn't solve graph
  binding — pairs with B rather than replacing it.

### Variation D — Source-typed inputs (the reactivity-first model)

Less a layout than a *model* choice that can sit under A/B/C: every input has an explicit
**source type**, and the UI adapts per source. This is what makes B5–B7 (sensors, events,
closed-loop) first-class rather than bolted on.

| Source | Driven by | UI affordance |
| --- | --- | --- |
| **Manual** | a control | slider / toggle / XY pad |
| **Time** | playback clock | (none — follows transport) |
| **External / sensor** | orchestrator/runtime feed | live readout + "connected?" indicator |
| **Animation** | an Animation artifact | clip picker + transport |
| **Expression** | other inputs (formula) | small expression field |

- **+** Directly enables reactive behavior; unifies "manual test value" and "real sensor
  feed" as just two sources of the same input — swap source without touching the graph.
- **−** More concepts to teach; needs progressive disclosure (default = manual; reveal
  other sources on demand).

## 5. Recommendation (for review)

A **hybrid: B (dedicated Inputs panel) + D (source-typed inputs) + C (control rack) for the
driving/testing surface.** Declaration/binding live in the Inputs panel with source-typed
inputs; performing/testing lives in a control rack reused by the Face Controller. Variation
A's on-canvas visibility becomes a hover/peek affordance rather than the primary model.

This separates declaration / binding / driving (the core problem), makes reactivity
first-class, and gives the same input model to all three node-graph interfaces.

## 6. Open questions → Workstream 4 / mockups

- Inline (A) vs. referenced (B) inputs on the canvas — or both via peek? Test with users.
- Is the control rack (C) part of each authoring interface, or only the Face Controller?
- How are **derived** inputs (pose weights) presented in the Inputs panel without clutter?
- Default source = manual; what's the reveal path to sensor/expression (progressive
  disclosure)?
- Next step: turn Variations A–D into **visual mockups** (Figma / quick widgets) and run
  them past a designer-type and a researcher-type user.
