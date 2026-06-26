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
   already painful).
   - *Where:* artifact model + shell. *Disposition:* **v1 (versioned artifacts)**;
     diff/migration tooling **later**.
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
   only timelines.
   - *Where:* Behavior Designer + Face Controller (runtime inputs). *Disposition:* **v1**
     (the Behavior Designer is hollow without it).
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
    (e.g. a gaze rig and an emotion rig both move the eyes), who wins? Priority, blending,
    additive vs override. The paper lets representations "coexist" but never specifies
    conflict resolution; the orchestrator blackboard implies a model that needs UX.
    - *Where:* Behavior Designer / Rig Designer / runtime. *Disposition:* **v1 (a clear,
      simple arbitration model)** — this is a correctness issue, not a nicety.
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

## F. Tool fundamentals (assumed, not in a requirements paper)

These are table stakes for any authoring tool; the paper omits them because it isn't a
product spec, but they shape the architecture (and the current `App.tsx` session-lifecycle
complexity shows they were retrofitted painfully).

17. **Undo/redo, autosave, recoverable sessions.** *Disposition:* **v1** — design the state
    model for it from the start (a lesson from the current god-object).
18. **Onboarding, templates & examples.** Non-experts (Maya's brand team, Priya the CX
    designer) need guided starts and templates, not a blank canvas.
    - *Disposition:* **v1 (presets/templates)** — leverages the existing preset assets.
19. **Accessibility & internationalization.** Multilingual speech/visemes (the paper ties
    visemes to *language acquisition*), plus accessibility of the authoring tool itself.
    - *Disposition:* **v1 awareness** (don't preclude), full support **later**.
20. **Non-speech audio / sound design.** Earcons, expressive non-verbal sounds tied to
    expressions. *Disposition:* **later**.

## Suggested v1 scope (for review)

**Fold into v1 design now:** local artifact library + versioned artifacts (A1, A2); input/
event sources + gaze targeting + simple logic (B5–B7); basic device connect & drive (C8) +
an idle/fallback behavior concept (C11); a simple output-arbitration model (D12); lip-sync
(D14); basic rig validation (E15); undo/redo + autosave (F17); templates/onboarding (F18).

**Design so as not to preclude (architecture, feature later):** physical/actuated outputs
(C9), performance profiling (C10), multi-model emotion (D13), multi-face sync (D14),
session telemetry (E16), i18n/a11y (F19), remote registry + collaboration (A1/A4).

**Out-of-scope for the tool (escalate elsewhere):** standard governance process (A3).

## Highest-priority items to resolve before Workstream 4

1. **Output arbitration (D12)** — a correctness concern that shapes the Rig/Behavior IA.
2. **Reactive inputs (B5/B7)** — without them the Behavior Designer is just a player.
3. **Actuated outputs (C9)** — a now-or-never architectural assumption in the artifact model.
4. **Versioning (A2)** — changes the artifact/library model the whole shell is built on.
