# Mental Models for Vizij

_The centerpiece document for the workshop. Each section states **the model the
system actually implements**, then **the model people bring to it**, then **where
they diverge** — because the divergences are where support questions, bugs, and
onboarding failures come from._

Provenance note: the object model and runtime contract below are drawn from
`apps/vizij-authoring/docs/ARCHITECTURE.md`, the PR #65 feature inventory (accurate
as of 2026-07-15), and verification against `main` @ `418d7f2f`. Where the
runtime has moved since, it is flagged. See [`00-STATUS.md`](./00-STATUS.md).

---

## 0. The shortest possible description of Vizij

> **A Vizij face is a 3D model plus a graph that turns named intentions into mesh
> motion. Everything else is a way of authoring, driving, packaging, or hosting that
> pair.**

If someone leaves the workshop remembering one sentence, that is the sentence. Every
model below is an elaboration of it.

---

## 1. Model A — The object model (what things exist)

### 1.1 The eight nouns

```text
                     ┌──────────────────────────────────────┐
                     │           FACE PACKAGE               │  ← the artifact
                     │        (GLB + VIZIJ_bundle)          │
                     └──────────────────────────────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────┐
        ▼              ▼               ▼               ▼              ▼
    ① SCENE       ② CONTROLS      ③ EXPRESSIONS   ④ ANIMATIONS   ⑤ BEHAVIOR
    meshes,       named knobs      named looks     keyframed      reactive logic
    materials,    with ranges      + sets +        clips over     (node graph)
    morphs,       ("drivers")      layering        time
    hierarchy
        │              │               │               │              │
        └──────────────┴───────────────┴───────────────┴──────────────┘
                                       │  all compile to
                                       ▼
                              ⑥ ONE COMPOSED GRAPH
                                       │  run by
                                       ▼
                              ⑦ ONE DEVICE (arora)
                                       │  reads/writes
                                       ▼
                              ⑧ THE STORE  (path → value)
                                       │  drained into
                                       ▼
                                 the renderer
```

Plus two things that attach from outside:

- **⑨ Profiles** — standard-vocabulary adapter graphs (e.g. `ros4hri`), composed into
  ⑥ between the base graphs and the program.
- **⑩ Bridges / Live Control** — WebSocket, ROS 2, Studio/Zenoh channels that write
  into ⑧ from outside the app.

### 1.2 The model people bring

Newcomers almost always arrive with a **DCC / game-engine** model:

| They expect                                          | Vizij actually has                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| A **project file** you save, separate from an export | **No project file.** The GLB _is_ the document. "Save" routes to export.                  |
| A **rig** = a skeleton with bones                    | A "rig" = a **graph of named value channels**, not a skeleton                             |
| **Poses** = saved transform snapshots                | Expressions = saved **control values**, which may or may not be transforms                |
| A **blend tree** / animation state machine           | A node graph with a store, no state machine; layering is a compose order over pose groups |
| Timeline is the primary surface                      | Timeline is _one of four_ authoring surfaces (expressions / clips / behavior / speech)    |
| The viewport shows a **preview**                     | The viewport shows **the actual runtime** — same engine as production                     |

### 1.3 Where this bites

- **"Where did my work go?"** — no autosave, no project file, and until PR #100 a
  re-export could carry a _stale_ embedded bundle that shadowed every edit since load.
  The mental model "my edits live somewhere durable" was simply false.
- **"Rig" is overloaded** to the point of being unusable in a sentence: _rig graph_,
  _rig inputs_, _rig kind_, _pose rig_, _propsrig_, _RigControllerProvider_,
  `rig/{faceId}/...` paths. VIZ-80 ("Define Vizij Rig Components") is an
  acknowledgement that this noun needs splitting.

### 1.4 Workshop prompt

> Hand each participant the ten nouns on cards. Ask them to (a) group them into
> "things I author", "things the system computes", and "things that come from
> outside", and (b) name each group in one word. Compare groupings — the disagreements
> are the terminology work.

---

## 2. Model B — The addressing model (how things find each other)

**This is the single most load-bearing and least-communicated model in Vizij.**

### 2.1 The rule

> **Node IDs are local. Store paths are global.**

- Every authored source (rig graph, pose graph, each program) is compiled to a
  GraphSpec whose **node ids are namespaced** so they cannot collide.
- The **paths those nodes read and write are NOT namespaced.** A value written to a
  path by one graph is read by another graph at the _same path_ on the next tick.
- Therefore: **shared path identity is the only wiring mechanism between authored
  systems.** There is no explicit "connect the pose system to the rig" step. They
  connect because they agree on a string.

### 2.2 The path shapes

| Shape                                                           | Meaning                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `rig/{faceId}/...`                                              | this face's controls                                              |
| `rig/{faceId}/poses/{poseId}.weight`                            | how much of an expression is applied                              |
| `rig/{faceId}/pose/control/{inputId}`                           | a control as driven by the pose plane                             |
| `/pose/groups/{id}.output`, `/pose/stages/{id}.output`          | derived layering outputs                                          |
| `/standard/{namespace}/{channel}/{track}/{attribute}`           | standard controls, e.g. `/standard/semio/left_eye/pos/x`          |
| `standard/ros4hri/*`                                            | a standard profile's inputs                                       |
| `/speech/speaking`, `/speech/user_speaking`, `/speech/thinking` | speech state                                                      |
| `arora/*`                                                       | runtime built-in keys — **should never be user-visible** (VIZ-72) |

### 2.3 Where this bites

1. **Invisible coupling.** Renaming a path silently disconnects two systems. Nothing
   errors; the face just stops responding.
2. **No defined merge.** Two publishers on the same path is _invalid_ but not
   _prevented_ (**VIZ-76**), and graph composition has no combiner node and ignores
   `mergeStrategy` (**VIZ-58**). The answer to "what happens if my program and my clip
   both drive the left eyelid?" is currently _"it depends on composition order"_.
3. **The one place order IS defined:** profiles are composed **between** the base
   graphs and the program, deliberately, so _a playing program or clip out-writes the
   profile_. That's a real precedence rule — and it's the only one written down.
4. **Leaf vs component addressing.** VIZ-78: the Studio live-data reconnect needs
   component-addressed writes with leaf-first alignment. Whether a path names a
   _value_ or a _component of a value_ is not uniformly settled.

### 2.4 Workshop prompt

> Draw the path namespace on the wall as a tree. Ask: _who is allowed to write into
> each branch?_ Wherever two authors can write the same leaf, write the precedence
> rule next to it — or write "UNDEFINED". Count the UNDEFINEDs.

---

## 3. Model C — The time model (how a frame happens)

### 3.1 The loop

```text
   host                         device (arora)                 renderer
    │                                │                            │
    │── step(dt_ms) ────────────────►│                            │
    │                                │ evaluate composed graph    │
    │◄── drain changed keys ─────────│                            │
    │  ValueJSON → RawValue          │                            │
    │── write ONLY changed keys ─────────────────────────────────►│
    │                                │                    pull-model render
```

Four properties that matter:

1. **Stepped in milliseconds, drained by change.** Not "re-render every frame" —
   only changed keys propagate. This is why a face with 600 controls is cheap.
2. **Pull model at the renderer.** The renderer subscribes to a store; it is not
   pushed a frame.
3. **Recompose is now a patch, not a reload (VIZ-79).** `applyGraphEdits` +
   `GraphDiff` mean an edit re-composes **in place** and _stateful nodes stay warm_ —
   a spring mid-oscillation keeps oscillating. The old "every edit is a reload"
   intuition is obsolete.
4. **`dt` is not guaranteed small.** VIZ-75: the spring node is numerically unstable
   at large `dt` because it doesn't substep or clamp. Tab-switch, breakpoint, or a
   throttled hidden surface produces a large `dt`.

### 3.2 Stepping is a _policy_, not a fact

`vizij-showcase` is the reference for this: it separates `autostart`, `driveRuntime`,
`visible`, and `hiddenStepHz`. Hidden faces fall back to low-frequency manual
stepping via `step(..., { forceRuntime: true })`. So "is the face running?" has at
least four independent answers, and browser rAF throttling adds a fifth (a pane that
is occluded stops getting frames at all).

### 3.3 Where this bites

The model people bring is **"there is one clock and it is running"**. The reality is
_n_ devices, each with its own stepping policy, some of which are being manually
pumped at 2 Hz. Debugging "the face is frozen" requires knowing which of those five
knobs is off.

### 3.4 Workshop prompt

> Ask the room to draw where time comes from for: the authoring viewport, a showcase
> section scrolled off-screen, a `--headless` CI snapshot, and a robot running the
> native app with a ROS bridge. Four different answers. Is that OK?

---

## 4. Model D — The layer model (what's reusable and what isn't)

### 4.1 What actually exists today

```text
  HOSTS ────────────────────────────────────────────────────────────────
    vizij (native, Rust)     │ browser apps                │ headless CI
    ── the primary app now   │ vizij-authoring             │ --headless
       bridges on the device │ vizij-showcase              │ snapshot tests
       --ros2 --studio       │ tutorial-*, demo-*          │
       --no-ros4hri          │ vizij-standalone (Tauri,    │
                             │   maintenance-only)         │
  ─────────────────────────────────────────────────────────────────────
  REACT LAYER
    @vizij/runtime-react  0.3.0   ← provider + hooks; the de-facto reuse unit
    @vizij/render         0.1.1   ← Three.js scene store, GLB load/export
    @vizij/speech-react   0.1.1   @vizij/animation-react  @vizij/node-graph-react
    @vizij/node-graph-authoring 0.2.0  ← authoring-time compiler (GraphSpec + IR)
    @vizij/utils          0.1.0   ← RawValue / animatables vocabulary
  ─────────────────────────────────────────────────────────────────────
  RUNTIME (Rust → WASM + native)
    @vizij/runtime ^2.1.0 (2.2.0 = profiles)   arora device, standard, profiles
    @vizij/node-graph ^0.7.0                   graph evaluation
    @vizij/animation ^0.4.0 / animation-module  clip playback
    @vizij/value-json ^0.2.0                   the value wire format
```

### 4.2 The gap

There is **no framework-agnostic embed**. To put a Vizij face on a web page today you
need React. The proposed `<vizij-face>` custom element (PR #65's L3) does not exist,
and neither does a headless `FaceRuntime` controller (`@vizij/face-core`, scaffolded
only on PR #86).

**The irony worth naming:** the _Rust_ side now proves the runtime is host-agnostic —
same arora in native, browser, and headless. The _JS_ side still requires React.

### 4.3 The reuse question the workshop should actually answer

PR #65 proposed five layers (L0 engines → L1 headless core → L2 React kit → L3
framework-agnostic embed → L4 editor packages). Since then:

- **L0 grew.** It now includes the standard vocabulary and the profile registry —
  semantics, not just execution.
- **L1 is still missing** and is still the unanimous "first move" of all four
  proposals.
- **L4's Standard-Controls editor mostly evaporated** — the standard moved to L0, so
  the authoring surface is a profile _picker_ (PR #100), not a mapping editor.

So the layer diagram needs redrawing, and that redraw is a workshop exercise, not a
foregone conclusion.

---

## 5. Model E — The lifecycle model (the narrative)

PR #65's spine, which is still the best available user-facing narrative:

| Stage       | The question a person is asking   | What they touch                                                                                         |
| ----------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **DEFINE**  | "What can this face do?"          | Import, hierarchy, materials, morphs, name the controls, set ranges, map to standard controls, validate |
| **CONTROL** | "Make it do this, now."           | Sliders, links/formulas, speech, live external signals                                                  |
| **ANIMATE** | "Make it move over time / react." | Expressions, clips, behavior graphs, visemes                                                            |
| **DEPLOY**  | "Ship it and run it elsewhere."   | Export the Face Package, embed it, run it on a device, connect live control                             |

### 5.1 The competing narrative: the artifact pipeline

There is a second, equally valid framing that is _more honest about hand-offs_:

```text
  3D model  ──►  rigged face  ──►  expressive face  ──►  behaving face  ──►  deployed face
  (Blender)      (controls +        (+ expressions,       (+ behavior         (+ profile,
                  standard map)      clips)                graph, speech)       bridges)

  ▲              ▲                  ▲                     ▲                   ▲
  3D artist      Rig Author         Motion Designer        Interaction         Integrator /
                                                           Designer            Robot operator
```

The lifecycle framing organizes _the tool_. The pipeline framing organizes _the team_.
They are not the same and choosing one as primary is a real decision — see
[`08-DECISIONS.md`](./08-DECISIONS.md) D3.

### 5.2 Where the lifecycle model breaks

- **DEPLOY now precedes DEFINE sometimes.** With built-in profiles, a face can be
  driven by `standard/ros4hri/*` before anyone has authored a single expression. The
  ROS4HRI Quori golden test does exactly that: graft the profile into an existing GLB
  with the bundler and drive it, headless, no authoring session at all.
- **CONTROL is not a stage, it's a mode.** You "control" the face continuously
  throughout — it's how you check your work in every other stage.
- **The lifecycle assumes one person walks it.** In practice DEFINE is often done by
  someone in Blender who never opens Vizij.

---

## 6. Model F — The truth model (what the preview means)

### 6.1 The claim

> **Runtime-truthful preview.** The authoring app runs the same Rust→WASM engines
> downstream consumers use. What you see is evaluated by the production runtime.

This is a genuine and unusual strength. It is also **now qualified**, and the
qualification is important:

### 6.2 The three deliberate divergences

1. **Profiles are asset, not preview.** PR #100: importing a standard profile embeds a
   copy into the GLB — but _the authoring runtime composes no profile_. The preview
   deliberately does not show what the deployed face will do with a profile attached.
   And at deploy, the embedded copy **overrides** the runtime's built-in mapping of
   the same id.
2. **Two stores in the authoring app.** `vizij-authoring` runs an app-level
   `@vizij/render` store (the authoring source of truth) _and_ a per-provider runtime
   store (what the viewport renders). Editing the app store does **not** update the
   viewport unless a bridge component pushes it across (`FaceBoundsRuntimeBridge` is
   the established pattern). So "what I see" and "what I'm editing" are two different
   objects held in sync by hand.
3. **Speech is app-side, moving runtime-side.** Today Polly/Deepgram/OpenAI live in
   the authoring app and in `@vizij/speech-react`; VIZ-94 moves TTS toward a ROS4HRI
   runtime module. During the transition, speech behaviour in the preview and on a
   robot are different implementations.

### 6.3 Where this bites

"Runtime-truthful" is now a _claim with three asterisks_. That's defensible — each
divergence has a reason — but it must be **visible in the UI**, or the strongest thing
about Vizij quietly becomes a trust problem. There is currently no indicator anywhere
that says "this preview omits the profile you just embedded."

### 6.4 Workshop prompt

> For each divergence: is it (a) correct and needs an indicator, (b) correct and needs
> a toggle, or (c) a bug we've been living with? Vote.

---

## 7. Model G — The navigation model (why the app feels hard)

The authoring app has **four orthogonal navigation mechanisms operating at once**,
all still present on `main`:

| Mechanism              | Cardinality                                                                                                                                     | Where                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Panel visibility**   | 13 panels, individually toggleable                                                                                                              | `state/workspaceStore.ts`                             |
| **Edit-focus modes**   | 6 (`default`, `pose-creation`, `pose-editing`, `animation`, `procedural-animation-programming`, `reference-face`) — each re-lays-out the panels | `state/AuthoringUiProvider.tsx`, `editFocusPanels.ts` |
| **Workbench tabs**     | 4 (Import/Export, Rigging, Posing, Standard Feature Spaces)                                                                                     | `components/app/workbenchConfig.ts`                   |
| **Authoring surfaces** | 6 (Drivers / Poses / Pose Groups / Animations / Programs / Inputs) inside the Variables panel                                                   | `components/panels/variablesSurfaceOrder.ts`          |

Plus an exclusivity rule: Animation / Program / Reference Face are mutually exclusive
in the center.

**13 × 6 × 4 × 6 is not a design; it's an accumulation.** The user's model — _"I am
somewhere, doing something"_ — has no single answer, because the app has four
independent notions of "where".

Every one of the four PR #65 proposals attacked exactly this, from four directions:
collapse to lifecycle modes (A), collapse to role workspaces (B), dissolve into
packages (C), or collapse to one canvas + contextual inspector (D). The synthesis
picked **D with A as wayfinding and B as presets**. That recommendation is still
unimplemented and still, as far as this document can tell, still right.

---

## 8. The five divergences to resolve

Consolidating everything above into what the workshop should actually decide:

| #     | Divergence                                     | Symptom                                                                                       | Owner-ish       |
| ----- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------- |
| **1** | **"Rig" means six things**                     | Nobody can describe the object model in a sentence                                            | VIZ-80          |
| **2** | **Path collisions have no defined precedence** | "It depends on composition order"                                                             | VIZ-76, VIZ-58  |
| **3** | **Save ≠ durable**                             | Lost work; stale-bundle shadowing (fixed in #100, but the model is still "export or lose it") | PR #65 Track 1  |
| **4** | **"Runtime-truthful" now has three asterisks** | Preview omits profiles; dual store; speech in transition                                      | PR #100, VIZ-94 |
| **5** | **Four notions of "where am I"**               | 13×6×4×6 navigation surface                                                                   | PR #65 U2/U3    |

---

## 9. One diagram to put on the wall

```text
                    ┌─────────────────────────────────────────────────┐
   AUTHORING        │                                                 │       DEPLOY
                    │              THE FACE PACKAGE                   │
  Blender ──GLB──►  │   scene + controls + expressions + clips        │  ──►  browser app
                    │   + behavior + speech cfg + [profiles]          │  ──►  native vizij
  vizij-authoring ► │                                                 │  ──►  headless CI
                    └─────────────────────────────────────────────────┘  ──►  robot (ROS 2)
  vizij-bundle CLI ►                     │
                                         │  compose (base → profiles → program)
                                         ▼
                            ┌────────────────────────┐
                            │  ONE COMPOSED GRAPH    │
                            │  ONE arora DEVICE      │  ◄── bridges write here
                            │  ONE STORE (path→val)  │      WS / ROS 2 / Studio-Zenoh
                            └────────────────────────┘
                                         │  changed keys only
                                         ▼
                                    the rendered face
```

**Read it as:** everything on the left produces one artifact; everything on the right
consumes it; in the middle there is exactly one graph, one device, one store, per
face. The artifact is the interface between the two halves — and the store is the
interface between the system and the outside world.
