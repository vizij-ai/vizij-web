# Authoring Rebuild — Interfaces & User Stories

> Enumerates the interfaces we need and the user stories per role, derived from the
> workflows (`08`/`09`), the interface plans (`03`), and the gaps (`04`). Stories are one
> line each: **Title** — *As a [role], I can [action]* (benefit only when not obvious).
> `(gap)` = capability to build new (see `04`). Builds on `01` (five interfaces + shell).

## The interfaces

1. **Shared App Shell** — project/library/import-export/preview/navigation/tool-fundamentals; serves every role.
2. **Face Designer** — compose a face (`d`); role R1.
3. **Rig Designer** — author rigs (`f→d`, `c→f`) + standards; roles R2 Face Rigger, R3 Abstraction Rigger.
4. **Animation Designer** — values over time (`t`), keyframe + procedural; role R4 Animator.
5. **Behavior Designer** — sequence + speech + logic; role R5 Interaction Designer.
6. **Face Controller** — drive/preview/deploy/test; role R6 Developer (+ preview for R4/R5).

*Cross-cutting:* a **shared node-graph canvas** is reused by Rig Designer, Animation Designer (procedural), and Behavior Designer (logic). The **Developer API** is code, not a GUI, but R6 tests it through the Controller.

## 1. Shared App Shell — all roles

- **Start or open** — As any user, I can start a new project or open an existing one (a face plus its rigs/animations/behaviors).
- **Artifact library** — As any user, I can browse, search, and open the five artifact types (faces, rigs, standards, animations, behaviors).
- **Import / export** — As any user, I can import and export Vizij bundles (GLB) to share or reuse artifacts.
- **Persistent preview** — As any user, I can keep the live face preview visible as I move between activities.
- **Fluid activity switching** — As any user, I can switch activities without losing my selection or context.
- **Entry by intent** — As a returning user, I can jump straight to an activity and be prompted to back-fill any missing prerequisite.
- **Undo & autosave** — As any user, I can undo/redo and rely on autosave + recovery so I never lose work.
- **Templates & onboarding** — As a newcomer, I can start from a template and follow a guided path instead of a blank canvas.
- **Versioning** — As any user, I can see artifact versions and pin dependencies so an update doesn't silently break my work.

## 2. Face Designer — R1 Face Designer

- **Get a face** — I can create a face from a template, from scratch, or by importing glTF/GLB.
- **Compose components** — I can add, remove, and arrange face components (eyes, brows, lids, mouth…) rather than raw primitives.
- **Style components** — I can set color, material, size, and transform per component.
- **Resolve import** — I can confirm orientation and resolve discrepancies when importing.
- **Edit primitives (advanced)** — I can drop to the raw scene graph to edit primitive shapes directly.
- **Publish a face** — I can export a riggable face for others to use.

## 3. Rig Designer

### R2 Face Rigger (`f → d`)

- **Declare inputs** — I can declare a face's controllable inputs (the face-specific vector `f`).
- **Wire the graph** — I can map inputs to face elements on the node graph.
- **Define poses** — I can define named poses and blend groups.
- **Tune blending** — I can set how overlapping poses/groups combine (weights, priority, neutrals) and get warned on same-target conflicts.
- **Preview live** — I can drive inputs and preview the rig against the face.
- **Publish rig** — I can publish a face-specific rig.

### R3 Abstraction Rigger (`c → f`, standards)

- **Pick / define a standard** — I can choose or define a standard feature space (abstract vector `c`).
- **Map to standard** — I can map `c → f` and see coverage against the standard.
- **Translate standards** — I can author `c → c` rigs that translate between standard spaces.
- **Remap across faces** — I can remap an existing rig onto a different face.
- **Publish standard rig** — I can publish a standard/abstract rig that works across faces.

## 4. Animation Designer — R4 Animator

- **Keyframe** — I can author values over time on a timeline.
- **Procedural** — I can build a generator graph that produces values over time.
- **Capture a pose** — I can drive rig inputs to a pose and capture it as keyframes.
- **Scrub & preview** — I can scrub and preview the animation on the face.
- **Export animation** — I can export a reusable animation artifact.
- **Render video** — I can render video / high-FPS output. `(gap)`

## 5. Behavior Designer — R5 Interaction Designer

- **Sequence a behavior** — I can sequence animations into a behavior (state machine / timeline).
- **Attach speech** — I can attach speech with lip-synced visemes.
- **Add logic** — I can add triggers and conditions so the behavior reacts to inputs.
- **Wire inputs / sensors** — I can connect live or sensor inputs to drive reactive behavior. `(gap)`
- **Simulate** — I can simulate the behavior on one or more faces.
- **Publish behavior** — I can publish a behavior.

## 6. Face Controller — R6 Developer (+ R4/R5 preview)

- **Load & drive** — I can load a face plus its rig/standard and drive its inputs live.
- **Connect to a device** — I can connect to a robot or screen over a protocol and drive it live. `(gap)`
- **Multi-face / multi-screen** — I can drive several faces or screens at once. `(gap)`
- **API test** — I can drive the same face from code via the standard rig and verify parity in the Controller. `(gap)`
- **Record** — I can record live control into a reusable animation.
- **Idle / fallback** — I can define an idle/fallback behavior for lost input or a dropped connection. `(gap)`

## Coverage check

Every role has a home: R1→Face Designer, R2/R3→Rig Designer, R4→Animation Designer,
R5→Behavior Designer, R6→Face Controller — all over the Shared App Shell. Stories tagged
`(gap)` are net-new capabilities flagged in `04-beyond-the-paper.md`.
