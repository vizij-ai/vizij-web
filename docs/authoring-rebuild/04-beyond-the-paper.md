# Authoring Rebuild — Considerations Beyond the Paper

> Gaps inferred beyond the UR-RAD paper's scope. The paper is a *requirements & architecture*
> paper, not a product spec — so these omissions are natural, but the rebuilt product must
> make a deliberate decision on each. We already split out **Animation Designer** and
> **Behavior Designer** (`01` §3); this doc catalogues the rest.
>
> Each item: **what's missing → why it matters → where it lives → suggested disposition**
> (v1 / later / out-of-scope). Dispositions are proposals for review, not decisions.

## A. Ecosystem, collaboration & governance

The paper's whole premise is *shared, standardized* artifacts, but it stops at "Share X"
arrows. A community ecosystem needs the machinery around sharing.

1. **Artifact library / discovery / registry.** How do you *find* a standard gaze rig or a
   community face? Search, browse, provenance, attribution, licensing.
   - *Where:* shared shell. *Disposition:* **v1 (minimal)** — a local library of the five
     artifacts; remote registry **later**.
2. **Versioning & compatibility.** Standards and rigs evolve. A rig depends on a *version*
   of a standard; faces depend on rig versions. Need version pinning, diffing, and
   migration when a standard changes (the current `legacyMigration` code is a hint this is
   already painful). **Direction (decided):** we're pre-1.0/experimental and working toward
   a first version, so the goal is to **standardize versioning now as part of tool
   fundamentals** rather than retrofit it — see `06-tool-fundamentals-and-versioning.md`.
   - *Where:* artifact model + shell (tool fundamentals). *Disposition:* **v1 — standardize
     the versioning scheme**; rich diff/migration tooling **later**.
3. **Standard governance.** The paper *wants* the community to converge on standards but
   gives no process for proposing/ratifying/deprecating one. Without it, "standards"
   fragment.
   - *Where:* ecosystem/process, not just UI. *Disposition:* **out-of-scope for the tool**;
     flag as an ecosystem decision.
4. **Multi-user collaboration.** Co-editing, comments, ownership of shared artifacts.
   - *Disposition:* **later** — design the artifact model so it doesn't preclude it.

## B. Reactivity, sensing & closed-loop interaction

The paper's Fig. 1 shows Developers doing "Develop Sensing Algorithms" and "Integrate
Sensing and Actuation," but no interface covers wiring *inputs* into behavior. A real HRI
face is reactive, not just played back.

5. **Input/event sources.** Sensor data, conversation events, app state driving behaviors
   (e.g. gaze follows a detected person). Behaviors need triggers and live inputs, not
   only timelines. **Direction (decided):** the procedural / motion-graph editor is where
   we started exploring inputs (rig inputs, custom paths, instant/trigger/grouped control
   modes), but it **needs significant refinement** — scattered affordances, no staging
   feedback, brittle custom inputs, implicit pose-weight inputs. Planned as a deep-dive
   **with variations** in `05-inputs-model-and-variations.md`.
   - *Where:* Animation Designer (procedural) + Behavior Designer + Face Controller
     (runtime inputs). *Disposition:* **v1 — refine the input model; explore variations.**
6. **Gaze/attention targeting in world space.** "Gaze" is abstract until bound to a
   *target point* derived from sensors/world coordinates. Mapping abstract gaze → a real
   target is a spatial concern the paper's vector model glosses over.
   - *Where:* Behavior Designer / runtime. *Disposition:* **v1 consideration**, likely a
     standard-rig input convention.
7. **Closed-loop / conditional logic.** Branching, state, reacting to inputs over time —
   this is where Behavior Designer overlaps the node-graph canvas (`01` §4.7).
   - *Disposition:* **v1** for simple logic; complex orchestration **later**.

## C. Deployment, runtime & hardware

The faces run on *robots*. The repo already gestures at this (`arora-websocket`,
`arora-ros2`, an RPi launch script) but the paper's GUI story stops at a rendered preview.

8. **Real deployment targets & connection.** Pushing a face/behavior to a device, over a
   protocol (Arora WebSocket / ROS 2), and driving it live. Connection status, addressing
   the right screen/robot.
   - *Where:* Face Controller. *Disposition:* **v1 (basic connect + drive)**; rich device
     management **later**.
9. **Actuated (non-rendered) outputs.** Robots have servos/LEDs, not only screens. The
   low-level `d` layer is assumed to be *rendered* primitives — but the abstraction-rig
   idea could just as well map `c → f → (physical actuators)`. Worth deciding whether `d`
   can be a physical output target.
   - *Disposition:* **architecture consideration now, feature later** — don't bake
     "rendered-only" assumptions into the artifact model.
10. **Performance budgets & profiling.** The paper *requires* high FPS but offers no way to
    measure it, especially on constrained hardware.
    - *Where:* Face Controller (diagnostics). *Disposition:* **later**, but keep the
      runtime instrumentable.
11. **Fallback & safety behaviors.** What does a deployed face do on lost input, a failed
    rig, or a dropped connection? Idle/fallback behaviors; avoiding disturbing expressions
    in HRI.
    - *Where:* Behavior Designer + runtime. *Disposition:* **v1 (at least an idle/default
      behavior concept)**.

## D. Composition, arbitration & timing

12. **Output arbitration / blending.** When two rigs or behaviors drive the *same* output
    (e.g. a gaze rig and an emotion rig both move the eyes), who wins? **Update (decided):**
    the *engine already implements this* — the pose → group → blend-stage structure
    supports additive, normalized-weighted-average, and **priority** modes, plus a
    per-channel `crossGroupPolicy` with explicit priority order and tie-breaks
    (`poseRig/types.ts`, `graphBuilder.ts`, `poseCompositionPreview.ts`). The gap is **UX**,
    not the model. So this becomes a **UX deep-dive to surface the existing blend structure**:
    visualize/scrub pose weights with a live blend preview, expose the priority/tie-break
    order, trace scoped-neutral resolution, and detect/warn on same-target conflicts (today
    one contributor silently loses). Per-input compose mode within a group is also a knob to
    expose more cleanly.
    - *Where:* Rig Designer (authoring) + Face Controller (preview). *Disposition:* **v1 —
      a UX layer over the existing arbitration engine**, not a new arbitration model.
13. **Multi-model emotion composition.** The paper notes FACS / PAD / WASABI coexisting.
    How does the tool let a user pick or blend models?
    - *Disposition:* **later**; v1 ships one default model + the ability to define others.
14. **Timing & synchronization.** Lip-sync (visemes to audio), syncing animation across
    multiple faces/screens, syncing to external events. The paper names visemes but not the
    sync engine.
    - *Where:* Animation Designer + Behavior Designer + runtime. *Disposition:* **v1 for
      lip-sync**, multi-face sync **later**.

## E. Quality & research data

15. **Rig/face validation & regression testing.** Beyond standard-input *coverage*: does a
    rig behave correctly across its input range? The reference-face bug saga (`next_steps.md`)
    shows untested expression pipelines are the dominant failure mode.
    - *Where:* Rig Designer (validation) + engine tests. *Disposition:* **v1 (basic
      validation/preview sweeps)**.
16. **Session recording & telemetry for studies.** Researchers need replicable studies —
    that implies *logging* what the face did and when, and recording sessions for analysis.
    The paper wants replicability but not the data-capture tooling.
    - *Where:* Face Controller. *Disposition:* **later**, but design runtime events to be
      capturable.

## F. Tool fundamentals — a primary focus, not table stakes

> **Direction (decided):** tool fundamentals are a **heavy, first-class focus** of the UX
> work — "we need to get that part right." The paper omits them because it isn't a product
> spec, but they shape the architecture (the current `App.tsx` session-lifecycle complexity
> shows they were retrofitted painfully). **Versioning standardization folds in here.**
> These get their own deep-dive: `06-tool-fundamentals-and-versioning.md`, and a dedicated
> pass during Workstream 4. Elevated to a design principle in `01` §4.8.

17. **Undo/redo, autosave, recoverable sessions.** *Disposition:* **v1 (foundational)** —
    design the state model for it from the start (a lesson from the current god-object).
18. **Versioning standardization** *(elevated from A2)*. Since we're pre-1.0, define the
    versioning scheme for the five artifacts now — schema version, artifact semver,
    standard-version pinning — so it's a fundamental, not a retrofit. *Disposition:* **v1.**
19. **Onboarding, templates & examples.** Non-experts (Maya's brand team, Priya the CX
    designer) need guided starts and templates, not a blank canvas.
    - *Disposition:* **v1 (presets/templates)** — leverages the existing preset assets.
20. **Accessibility & internationalization.** Multilingual speech/visemes (the paper ties
    visemes to *language acquisition*), plus accessibility of the authoring tool itself.
    - *Disposition:* **v1 awareness** (don't preclude), full support **later**.
21. **Non-speech audio / sound design.** Earcons, expressive non-verbal sounds tied to
    expressions. *Disposition:* **later**.

## Suggested v1 scope (for review)

**Fold into v1 design now:** local artifact library + **standardized versioning** (A1, A2/
F18); a **refined input model** (B5–B7, deep-dive doc 05); basic device connect & drive
(C8) + an idle/fallback behavior concept (C11); **output-arbitration UX over the existing
pose/blend engine** (D12); lip-sync (D14); basic rig validation (E15); **undo/redo +
autosave as foundations** (F17); templates/onboarding (F19).

**Design so as not to preclude (architecture, feature later):** physical/actuated outputs
(C9), performance profiling (C10), multi-model emotion (D13), multi-face sync (D14),
session telemetry (E16), i18n/a11y (F19), remote registry + collaboration (A1/A4).

**Out-of-scope for the tool (escalate elsewhere):** standard governance process (A3).

## Focus deep-dives (decided) and what's still open

**Four elevated focus areas, each with a home:**

1. **Inputs** — refine the procedural/motion-graph input model; explore variations →
   `05-inputs-model-and-variations.md`.
2. **Output arbitration UX** — surface the existing pose/group/blend-stage engine (D12) as
   usable UX (live weight preview, priority/neutral tracing, conflict warnings) → folded
   into the Rig Designer IA (Workstream 4).
3. **Tool fundamentals** — undo/autosave/recoverable state, templates, and **versioning
   standardization** → `06-tool-fundamentals-and-versioning.md` + `01` §4.8.
4. **Versioning** — standardized now (pre-1.0) as part of tool fundamentals (item 3).

**Still genuinely open (need a decision before/early in Workstream 4):**

- **Actuated outputs (C9)** — a now-or-never architectural assumption: can `d` be a
  physical output target, not only rendered primitives? Affects the artifact model.
- **Reactive inputs scope (B5–B7)** — how far closed-loop/sensing goes in v1 vs. later.
