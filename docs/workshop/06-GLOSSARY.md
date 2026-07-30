# Glossary & Terminology

_Two jobs: (1) let everyone in the room decode the words in the codebase, and
(2) present the proposed user-facing vocabulary so the room can ratify, amend, or
reject it._

---

## Part 1 — Decoder ring (what the code says)

Alphabetical. Terms marked **⚠️** are overloaded or ambiguous — those are the
terminology work.

| Term                                 | What it actually means                                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **animatable**                       | A driveable property discovered on the loaded scene. Lives in `@vizij/render`'s store alongside `world` and `values`. Vocabulary from `@vizij/utils` (`AnimatableNumber`, `AnimatableColor`, …)                                     |
| **arora**                            | The runtime/execution model Vizij adopted, replacing the bespoke orchestrator. Provides the `Behavior` trait, a data-store interface, and a HAL. Runs native, in-browser (WASM), and headless                                       |
| **arora device**                     | One running instance of the runtime for one face. Owns a store and steps a composed graph                                                                                                                                           |
| **arora built-in keys**              | Store keys under `arora/*` that belong to the runtime, not the user. Formerly called "golden" keys (renamed in ARORA-59). Should never surface in the UI (VIZ-72)                                                                   |
| **binding** ⚠️                       | An authored relationship between controls — a link (follow) or a formula (math). Stored in `bindingAuthoringStore`, compiled by `@vizij/node-graph-authoring`                                                                       |
| **blend stage**                      | One step in the ordered compositing pipeline that combines pose groups. Has a blend mode, sources, and a neutral source; topology-validated                                                                                         |
| **bundle** ⚠️                        | Overloaded. (a) `VIZIJ_bundle` — the glTF extension embedded in a GLB. (b) `VizijAssetBundle` — what you hand `VizijRuntimeProvider`. (c) `RuntimeGraphBundle` — what you hand `setGraphBundle`                                     |
| **combiner node**                    | Doesn't exist yet. The proposed node that would resolve output collisions (VIZ-58)                                                                                                                                                  |
| **compose**                          | Merging all authored graph sources into the one graph the device runs. Order: base graphs → **profiles** → program                                                                                                                  |
| **cross-group blend mode**           | How multiple pose groups combine with each other (as opposed to within a group). Includes a `priority` mode with tie-break                                                                                                          |
| **device store**                     | The path→value blackboard inside the arora device. The universal interface                                                                                                                                                          |
| **discrepancy**                      | A difference between imported data and the rig Vizij rebuilds from the mesh. Reconciled by the discrepancy wizard                                                                                                                   |
| **driver** ⚠️                        | A named, ranged control. Same thing as a "rig input" in most contexts                                                                                                                                                               |
| **edit focus**                       | One of six named panel-layout presets (`default`, `pose-creation`, `pose-editing`, `animation`, `procedural-animation-programming`, `reference-face`)                                                                               |
| **face standard**                    | The runtime's semantic vocabulary under `standard`: gaze/lid paths, `expression/<name>` (25 from ROS4HRI), `viseme/<shape>` (15), and a muscle tier from FACS + ARKit                                                               |
| **feature**                          | `@vizij/render`'s term for a driveable scene property                                                                                                                                                                               |
| **GraphDiff**                        | The computed difference between two graph specs, applied in place via `applyGraphEdits` (VIZ-79). Replaces reload-on-edit                                                                                                           |
| **GraphSpec**                        | The canonical `{nodes, edges}` graph format. Normalized by `normalizeGraphSpec` in `@vizij/node-graph`                                                                                                                              |
| **IR**                               | Intermediate representation. Compiled output of the authoring compiler (`compileIrGraph`); `.ir.json`; `AnimationClipIR`; `PoseRigIrFile`                                                                                           |
| **machine report**                   | Structured graph diagnostics, pasteable into the diagnostics panel                                                                                                                                                                  |
| **managed standard input**           | A standard input the app provisions and tracks; `source: "auto" \| "custom"`                                                                                                                                                        |
| **mergeStrategy**                    | A field on graph composition that is currently **ignored** (VIZ-58)                                                                                                                                                                 |
| **motiongraph** ⚠️                   | The node-graph program editor, its store, and its authored artifacts (`kind: "motiongraph"` in the bundle). Also loosely "a program"                                                                                                |
| **neutral** ⚠️                       | The resting state. Modes: face-default vs. explicit; scoped neutral: inherit / pose-reference / direct-values                                                                                                                       |
| **orchestrator**                     | **Gone.** The pre-arora execution layer. If you see it in a doc, that doc predates 2026-07                                                                                                                                          |
| **PAP**                              | The speech input mapping: `/speech/speaking`, `/speech/user_speaking`, `/speech/thinking` plus emotion and viseme groups                                                                                                            |
| **path**                             | A string key in the device store. **The only cross-graph wiring mechanism.** Node ids are namespaced; paths are not                                                                                                                 |
| **pipeline stage**                   | A step in a binding's value transformation chain (`pipelineMetadataV1`)                                                                                                                                                             |
| **pose** ⚠️                          | A named set of control values — a "look". Not a skeletal pose                                                                                                                                                                       |
| **pose group**                       | A named collection of poses with its own blend mode and neutral source                                                                                                                                                              |
| **pose rig**                         | The pose authoring system as a whole: config, graph, IR, diagnostics. A _separate GraphSpec_ from the rig graph                                                                                                                     |
| **profile**                          | A standard-vocabulary adapter, shipped as a pure node graph (e.g. `ros4hri`, 674 nodes). Registered in the `profiles` registry; embeddable into a GLB under `standard::<id>`; an embedded copy **overrides** the built-in at deploy |
| **program** ⚠️                       | A node-graph behavior. Sometimes "motiongraph", sometimes "behavior"                                                                                                                                                                |
| **propsrig** ⚠️                      | Legacy rig concept still appearing in inspector chain navigation. Nobody should have to know this word                                                                                                                              |
| **RawValue**                         | `@vizij/utils`' runtime value type, what the renderer store holds                                                                                                                                                                   |
| **rig** ⚠️⚠️                         | **Eight distinct meanings — see the dedicated breakdown in Part 5.** VIZ-80 ("Define Vizij Rig Components") exists to fix this                                                                                                      |
| **RobotData**                        | glTF `userData` extension carrying per-node rig metadata, including `rootBounds`. Baked at export; audited by the RobotData audit                                                                                                   |
| **rootBounds**                       | The face's bounding box, baked into `RobotData`. Wrong values = off-center face; sticky across re-exports                                                                                                                           |
| **runtime source**                   | Which authored system currently drives live inputs: poses / clip / program / speech                                                                                                                                                 |
| **standard input**                   | A path under `/standard/{namespace}/{channel}/{track}/{attribute}`                                                                                                                                                                  |
| **Standard Feature Spaces (SFS)** ⚠️ | The authoring-side mapping feature for standard inputs. Export still "coming soon". **Overlaps the new profile system**                                                                                                             |
| **step**                             | Advance the device by `dt` milliseconds, then drain changed keys                                                                                                                                                                    |
| **transport**                        | Playback control: play/pause/stop/step, loop, speed, seek                                                                                                                                                                           |
| **ValueJSON**                        | The wire format for values (`@vizij/value-json`) — tagged-union JSON, tuple vectors `[x,y,z]`, decoded via `valueAs*`                                                                                                               |
| **VIZIJ_bundle**                     | The glTF extension that makes a GLB a Face Package                                                                                                                                                                                  |
| **world**                            | `@vizij/render`'s scene-graph state                                                                                                                                                                                                 |

### Words in the codebase that mean roughly the same thing

Grouped, because this is the actual terminology debt:

- **A knob:** driver · rig input · animatable · feature · standard input · control
- **A saved look:** pose · expression · snapshot
- **Reactive logic:** motiongraph · program · behavior · node graph · procedural animation programming
- **The artifact:** bundle · GLB · Face Package · asset · VIZIJ_bundle · face file
- **Something is wrong:** discrepancy · audit · validation · diagnostic · issue · machine report · checkup
- **The engine:** runtime · device · arora · orchestrator (dead) · engine · WASM

---

## Part 2 — The proposed user-facing vocabulary

From PR #65's synthesis (`05-SYNTHESIS.md` §4), which called this "the fixed
vocabulary." **It was never ratified and never shipped.** Presented here for the room
to accept, amend, or reject.

| Concept                               | Proposed term                                      | Replaces                                                                        |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| A driveable knob                      | **Control**                                        | rig / binding / driver / animatable / propsrig / rig input                      |
| A control that follows another        | **Link**                                           | binding                                                                         |
| A control computed by math            | **Formula**                                        | expression (the binding kind)                                                   |
| Universal interoperable control names | **Standard Controls** / **Control Map**            | standard inputs / Standard Feature Spaces / `namespace·channel·track·attribute` |
| A named look                          | **Expression**                                     | pose                                                                            |
| A group of expressions                | **Expression Set**                                 | pose group                                                                      |
| Blend / compose order                 | **Layering**                                       | blend stage / blend mode / cross-group blend mode                               |
| The rest state                        | **Resting Face**                                   | neutral                                                                         |
| Reactive logic                        | **Behavior** (authored in the **Behavior editor**) | motiongraph / program / node-graph program                                      |
| Keyframed motion                      | **Animation** / **Clip** / **Keyframe**            | (kept — already clear)                                                          |
| The artifact                          | **Face Package**                                   | bundle / GLB / `VIZIJ_bundle`                                                   |
| Validation                            | **Checkup** (with an inline health chip)           | discrepancy wizard / robot-data audit / bundle audit / graph diagnostics        |
| External driving                      | **Live Control** / **Connections**                 | endpoints / WS·ROS2·Studio bridges                                              |
| A second face to compare against      | **Reference Face** / **Comparison Face**           | (kept — descriptive)                                                            |
| Working save vs. shareable output     | **Save** (working) vs. **Publish** (Face Package)  | Save == export                                                                  |
| Runtime internals                     | _(hidden)_                                         | arora / device / orchestrator / IR / GraphSpec / compile                        |

### The two-audience rule

PR #65's synthesis proposed that **end users see the intent words** above, while
**developers see mechanism names** in the package APIs (`writeInput`, `writeValues`,
`listKeys`, paths). The `<vizij-face>` embed would use developer vocabulary because its
users are developers and it matches the bridge verbs.

This is a good rule and worth ratifying explicitly, because it resolves the recurring
"but the paths are called `rig/...`" objection: the paths stay, the _labels_ change.

---

## Part 3 — Terminology decisions the new work forces

Three naming questions PR #65 could not have anticipated:

### T1 — "Standard Controls" vs. "Profile"

PR #65 proposed **Standard Controls** / **Control Map** for the authoring-side mapping.
The runtime now ships **profiles** — a registry of named adapter graphs. These are
related but not the same thing:

- a **standard control** is a _path_ in a shared vocabulary
- a **profile** is a _graph_ that connects that vocabulary to a specific face

Do we surface both concepts? Call the picker "Standard Profiles" (as PR #100 does) and
keep "Standard Controls" for the paths? Or collapse them?

### T2 — What is the face standard called, to users?

The runtime calls it `standard`. It contains ROS4HRI's expressions, the industry
visemes, FACS action units, and ARKit blendshapes. To a user this is _"the shared
language other systems speak."_ It has no user-facing name. Candidates: **Standard
Vocabulary**, **Face Standard**, **Interop Layer**, **Common Controls**.

### T3 — Preview honesty language

If the preview deliberately omits embedded profiles, the UI needs a word for that
state. **"Authoring preview"** vs. **"Deployed behavior"**? A **"Preview: authoring
only"** chip? This word doesn't exist yet and the feature ships in PR #100.

---

## Part 4 — Terminology exercise

**E1 — Decode-off (10 min).** Read six terms aloud from the ⚠️ list. Each person writes
their definition privately. Reveal. Count how many distinct definitions the room
produces for "rig."

**E2 — Ratify or amend (20 min).** Walk Part 2's table. For each row: **accept** /
**amend** (write the new word) / **reject** (say why). A rejected row means the internal
term wins and we stop apologizing for it.

**E3 — Name the three new things (10 min).** T1, T2, T3 above. Timebox hard; a
mediocre agreed name beats an excellent contested one.

**E4 — Write down the two-audience rule (2 min).** Or reject it. Either way it stops
being implicit.

---

## Part 5 — "Rig": the eight meanings, with receipts

The single worst term in the vocabulary, and the reason **VIZ-80 ("Define Vizij Rig
Components")** exists. Verified against `main` @ `418d7f2f`; paths are relative to
`apps/vizij-authoring/src/` unless noted.

| #   | Sense                               | What it actually is                                                                                                                                                                                                  | Where it lives                                                                                                                                                                                            |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **the rig graph**                   | A `GraphSpec` — nodes and edges — compiled from the authored bindings. **Distinct from the pose graph**; the bundle carries both separately                                                                          | `hooks/rigController/rigGraphCompiler.ts`; `buildRigGraphSpec` in `@vizij/node-graph-authoring`                                                                                                           |
| 2   | **rig inputs**                      | The named, ranged controls themselves. Also called drivers, animatables, features, and standard inputs depending on which layer you're in                                                                            | `StandardRigInput` (`@vizij/utils`), `state/bindingAuthoringStore.tsx:46-48`                                                                                                                              |
| 3   | **rig kind**                        | A two-value enum on the pose config: `"generic" \| "face-specific"`                                                                                                                                                  | `poseRig/types.ts:139`, `:212`                                                                                                                                                                            |
| 4   | **pose rig**                        | The entire pose authoring subsystem — config, graph, IR, diagnostics, its own versioned file formats (`POSE_RIG_CONFIG_VERSION`, `POSE_RIG_IR_VERSION`)                                                              | `poseRig/`, `poseRig/types.ts:3`, `:209`                                                                                                                                                                  |
| 5   | **`RigControllerProvider`**         | A React state provider. Owns `useBindingAuthoring` + `useGraphRuntime`, reset per loaded face                                                                                                                        | `state/RigControllerProvider.tsx`, consumed in `App.tsx`, `state/graphRuntimeStore.tsx`, `state/selectionStore.tsx`                                                                                       |
| 6   | **the `rig/{faceId}/` path prefix** | A store namespace. The runtime addressing root for a face's controls                                                                                                                                                 | `utils/rigPaths.ts:15`, `utils/standardInputPaths.ts:56`, `utils/graphImport.ts:294`                                                                                                                      |
| 7   | **"Rigging"**                       | A _user-facing activity label_ — one of the four workbench tabs, and the prefix on four inspector sections (`RiggingTransformSection`, `RiggingMaterialSection`, `RiggingMorphTargetsSection`, `RiggingPropertyRow`) | `components/app/workbenchConfig.ts:25`, `components/inspector/Rigging*.tsx`                                                                                                                               |
| 8   | **`propsrig`**                      | A **different, legacy path prefix** (`/propsrig/...`) with its own constant _and_ a legacy variant of that constant. Not the same namespace as (6)                                                                   | `PROPSRIG_PATH_PREFIX` + `LEGACY_PROPSRIG_INPUT_PATH_PREFIX` (`@vizij/utils`), re-exported by `utils/rigElementInputs.ts:1-4`; audited as `provisionedPropsRigInputs` in `utils/rigRoundtripAudit.ts:300` |

Plus `src/rig/` — a directory holding importer, auto-inputs, driver adapters,
expression handling, legacy migration, and persistence. It is sense (1)+(2)'s
implementation, but its name implies it owns all eight.

### Why this is a mental-model problem, not just a naming one

The senses are at **five different levels of abstraction** and the word gives no hint
which one you're in:

- (6) and (8) are **runtime addressing** — strings, and two _different_ string
  namespaces at that
- (1) and (4) are **compiled artifacts** — and they are siblings, not parent/child,
  which the shared word actively obscures
- (2) is **domain data** — the thing users care about
- (5) is **app plumbing** — React state, of no user interest
- (3) is a **config flag**
- (7) is a **verb dressed as a noun** — the only sense a user ever sees

So the sentence _"the rig has rig inputs, and the pose rig is not part of the rig
graph, and rigging edits the rig via the rig controller at `rig/...` — except for
propsrig"_ is both true and useless. That's the whole problem in one line.

### The proposed resolution

Part 2 collapses senses (1)–(3) and (5)–(8) out of the user's vocabulary entirely:

- sense (2) → **Control** (the only one users need)
- senses (1), (4), (5), (6), (8) → _hidden_ (runtime/implementation internals, per the
  two-audience rule)
- sense (3) → a config detail, not a concept
- sense (7) → absorbed into whatever the DEFINE stage gets called

Developer-facing APIs keep honest mechanism names — paths stay `rig/{faceId}/...`.
**Only the labels change.** That is the point of the two-audience rule, and it is why
this is a cheap fix that has never been made.

### Workshop use

This is **E1's payload**. Ask six people to privately write a one-sentence definition
of "rig," reveal simultaneously, then show this table. It takes five minutes and it
ends the argument about whether terminology work is real work.
