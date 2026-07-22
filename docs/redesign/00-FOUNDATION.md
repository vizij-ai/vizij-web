# Vizij Front-End Redesign — Foundation

_This is the shared spine for the redesign proposal set. Every proposal
(`01`–`04`) references the personas, lifecycle, feature checklist, terminology,
runtime contract, and package architecture defined here. The synthesis (`05`)
picks the canonical choices where proposals diverge._

Companion documents:

- [`README.md`](./README.md) — index and how to read the set
- [`01-lifecycle-studio.md`](./01-lifecycle-studio.md)
- [`02-role-workspaces.md`](./02-role-workspaces.md)
- [`03-headless-component-kit.md`](./03-headless-component-kit.md)
- [`04-progressive-canvas.md`](./04-progressive-canvas.md)
- [`05-SYNTHESIS.md`](./05-SYNTHESIS.md)
- Source of truth for existing features:
  [`apps/vizij-authoring/docs/FEATURE_INVENTORY.md`](../../apps/vizij-authoring/docs/FEATURE_INVENTORY.md)

---

## 1. Why redesign

The current `vizij-authoring` app grew feature-by-feature; `App.tsx` alone is
~4,600 lines and the information architecture mirrors implementation history,
not a user's mental model. Twelve+ toggleable panels, four orthogonal
"navigation" mechanisms (workspace panels, workbench tabs, edit-focus modes, and
authoring surfaces), and heavy internal jargon (rig / binding / driver /
animatable / propsrig / motiongraph / IR) make the tool powerful but hard to
learn and hard to reuse.

This redesign has three goals:

1. **Reorganize** the front end for accessibility, discoverability, and ease of
   use — retaining every existing capability, but arranged around how people
   actually think about making a face.
2. **Break the code into reusable chunks** so other websites can **define,
   control, animate, and deploy** Vizij faces — including a framework-agnostic
   drop-in, which does not exist today.
3. **Preserve the arora runtime backend** (recently adopted) as the engine
   underneath everything.

A full, ground-up visual and structural redesign is explicitly in scope. The
current app's layout and naming carry no weight as precedent.

---

## 2. Personas

Derived from the app/package READMEs and tutorials (no formal persona doc exists
in-repo). Three de-facto audiences:

| Persona                            | Who                                                                             | Goal                                                                                                                         | Today's touchpoints                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Rig Author** (a.k.a. "operator") | Technical artist / roboticist who imports a raw 3D model and wires it up        | Turn a mesh into a controllable face with named controls, expressions, and validated output                                  | `vizij-authoring` (Rigging, Posing, Standard Feature Spaces, Inspector, Validation)                                                    |
| **Motion Designer**                | Animator / interaction designer authoring how the face moves                    | Build expressions, keyframe animations, and reactive programs; preview live                                                  | `vizij-authoring` (Poses, Animation timeline, Motion-graph, Speech)                                                                    |
| **Integrator / Deployer**          | Web/app developer or robot-fleet operator embedding and driving a finished face | Drop a face into a site or device and drive it live (speech, gaze, emotion) from a host app, robot stack, or remote operator | `@vizij/runtime-react`, `apps/tutorial-*-face`, `apps/demo-vizij-player`, `apps/vizij-standalone` (WebSocket / ROS 2 / Studio bridges) |

These personas are not walls — one person may play all three — but they define
distinct **jobs to be done**, and the proposals differ mainly in how strongly
they separate or blend them.

---

## 3. The lifecycle spine: DEFINE → CONTROL → ANIMATE → DEPLOY

Every feature in the tool serves one of four stages. This spine is the common
vocabulary for the proposals; each proposal decides how visibly to surface it.

| Stage       | Plain-language question           | What happens                                                                                                          | Today's features (inventory §)                                                                                               |
| ----------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **DEFINE**  | "What can this face do?"          | Import a model; set up its hierarchy, materials, and named **controls**; map to universal/standard controls; validate | Import (§2), Hierarchy/Scene (§8), Inspector rig/material/morph (§7), Standard Feature Spaces (§11), Validation/audits (§12) |
| **CONTROL** | "Make it do this, now."           | Drive controls live — by hand (sliders), by expression, by speech, or from an external signal                         | Inspector driver editing (§7), Speech (§10), live runtime source toolbar (§9), standard-input paths, standalone bridges      |
| **ANIMATE** | "Make it move over time / react." | Author **expressions** (poses), **animations** (keyframe clips), and **programs** (reactive behavior)                 | Poses/pose groups (§6), Animation timeline (§4), Motion-graph programs (§5), Speech visemes (§10)                            |
| **DEPLOY**  | "Ship it and run it elsewhere."   | Export a **face package**; embed it in a site; run it on a device; connect live control                               | Export/Save (§3), bundle format, standalone runtime + endpoints, `@vizij/runtime-react`                                      |

---

## 4. Feature-parity checklist

Every proposal must map **all 19 areas** of
[`FEATURE_INVENTORY.md`](../../apps/vizij-authoring/docs/FEATURE_INVENTORY.md).
Nothing may be silently dropped. Features may be **merged**, **renamed**, or
**deferred** — but each proposal's coverage matrix must say where each area
lands (or why it is intentionally cut). The 19 areas:

1. Application shell, layout & navigation
2. Import
3. Export / Save
4. Keyframe animation editor
5. Procedural motion-graph editor ("Program")
6. Pose rig authoring (Posing)
7. Inspector (4 modes: scene object / rig driver / pose / material)
8. Left-sidebar authoring surfaces (hierarchy, variables, materials, inputs)
9. 3D viewport / runtime & preview
10. Speech & conversational avatar (Polly TTS, Deepgram STT, OpenAI/Gemini LLM)
11. Standard Feature Spaces (mapping)
12. Diagnostics, audits & debug
13. Architecture & WASM engines (arora)
14. Internal `@vizij/*` dependency map
15. Data model / authored-entity schemas
16. State management
17. Persistence
18. Known gaps / caveats (undo/redo stubs, SFS export "coming soon", Save==export)
19. Testing & build

Areas 13–17, 19 are implementation substrate — proposals address them in their
**Architecture** section rather than the SRD. Area 18 lists gaps a redesign
should _fix_ (real undo/redo, a real save distinct from export, SFS export).

---

## 5. Terminology simplification (starter glossary)

The single biggest usability lever is replacing implementation jargon with words
that describe intent. Below is the **starter** set; each proposal may refine it,
and `05-SYNTHESIS.md` fixes the canonical vocabulary. Internal/runtime terms are
**hidden** from users entirely.

| Today (internal)                                                                | Proposed user-facing term                                             | Notes                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rig / binding / driver / animatable / propsrig                                  | **Control** (a face's controls)                                       | A "binding/expression" becomes a **link** or **formula** between controls                                                                                                                         |
| standard inputs / Standard Feature Spaces / `namespace·channel·track·attribute` | **Standard Controls** / **Control Map**                               | Universal control names that make faces interoperable (e.g. `left_eye/pos/x`)                                                                                                                     |
| pose / pose group / blend stage / neutral                                       | **Expression** / **Expression Set** / **Layering** / **Resting Face** | An expression = a named look (smile, blink); sets group them; layering = blend order                                                                                                              |
| motiongraph / node-graph program / "procedural animation programming"           | **Program** / **Behavior**                                            | The node-graph is only _one_ possible editor for a program. The concept is "logic that makes the face react"; the authoring UI could be a graph, a rule list, or code. Representation stays open. |
| animation clip / keyframe / track                                               | **Animation** / **Clip** / **Keyframe**                               | Already clear — keep                                                                                                                                                                              |
| bundle / GLB / `VIZIJ_bundle`                                                   | **Face Package** (or **Face File**)                                   | The one shareable, round-trippable artifact                                                                                                                                                       |
| arora device / orchestrator / graph spec / IR / compile                         | _(hidden)_                                                            | Runtime internals; never shown to users                                                                                                                                                           |
| discrepancy wizard / robot-data audit / bundle audit                            | **Checkup** / **Validation**                                          | "Run a checkup before publishing"                                                                                                                                                                 |
| reference face                                                                  | **Reference Face** / **Comparison Face**                              | Keep — it's descriptive                                                                                                                                                                           |
| endpoints / WS·ROS2·Studio bridges                                              | **Live Control** / **Connections**                                    | How external systems drive the face                                                                                                                                                               |
| import "skip checks" / orientation confirm / discrepancy                        | **Import** with a guided **Checkup**                                  | Fold the safety prompts into one reviewable step                                                                                                                                                  |

---

## 6. The arora runtime contract (hard constraint)

> **All proposals must preserve this.** The arora backend is the engine; the
> redesign changes the front end and the packaging around it, never the runtime
> semantics.

The arora boundary is narrow and already clean. It lives in
`packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx` + `updatePolicy.ts`

- `utils/graph.ts` + `utils/valueConversion.ts`. Its invariants:

1. **One composed graph, one device per face.** All authored sources (rig graph,
   pose graph, program graphs) compose into a single `{nodes, edges}` graph run
   by one arora device per `VizijRuntimeProvider`. Multiple faces = multiple
   providers with distinct namespaces.
2. **Unprefixed `params.path` is the cross-graph contract.** Node ids are
   namespaced to avoid collisions, but store **paths are not** — a value written
   to a path by one graph is read by another at the same path next tick. Shared
   store path identity is how rig/pose/program wire together.
3. **`ValueJSON` I/O with a step-in-ms / drain-changes loop.** Advance the device
   by `dt` ms, drain changed keys, convert `ValueJSON → RawValue`, write only
   changed keys to the render store (pull model — no full re-render per frame).
4. **Hot updates via `setGraphBundle(bundle, {tier})`.** Push edited graphs
   (`tier: "graphs"`) without reloading the GLB or losing device store state;
   `tier: "assets"` for a full reload. This is the authoring→runtime entry point.

**Rule for all designs:** speak `VizijAssetBundle` / `RuntimeGraphBundle` and
canonical **paths**, and go through `@vizij/runtime-react`. Never touch the arora
device directly. Prefer runtime-resolved metadata (`resolveFaceControls()`,
`inputConstraints`, pose groups as blend structure) over hard-coded paths.

Two known sharp edges the architecture sections should track: `runtime-react`
still lists `@vizij/orchestrator-react` as a **vestigial** dependency (unused at
runtime), and the motion-graph editor's _live preview_ still runs on its own
`OrchestratorProvider` (`orchestrator-wasm`) — the one place orchestrator is
still load-bearing in the authoring app. Committed programs, by contrast, run
inside the arora device as composed graph sources.

### The Face Package (deploy artifact)

A **Face Package** is a GLB with an embedded `VIZIJ_bundle` extension
(`packages/@vizij/render/src/types/vizij-bundle.ts`), carrying: rig graph(s),
pose config, animation clips, motion-graph programs, and metadata
(`activeMotionGraphId` so a face "just starts behaving" on load; optional
`speechConfig`). It is the single unit that flows DEFINE → … → DEPLOY.

### The live-control surface (already exists)

`apps/vizij-standalone` hosts a shared blackboard with three bridges —
**WebSocket** (+ a same-port browser control panel), **ROS 2** data topics, and
the **Semio Studio / Zenoh** remote-operator channel. The wire vocabulary is
`write_values` / `read_values` / `list_keys` / `list_methods` / `invoke`, with
server-pushed `values_changed`. Everything reduces to writing normalized floats
at canonical `rig/{faceId}/...` paths. Any reusable "Live Control" API should
mirror this vocabulary.

---

## 7. Reusable-package target architecture (L0–L4)

A shared baseline the proposals weight differently (Proposal C makes it the
centerpiece). Package names are proposals; `05-SYNTHESIS.md` fixes the final
boundaries.

```text
┌─ L4  Authoring / editor components ─────────────────────────────┐
│     Heavy editing surfaces packaged for reuse:                   │
│     rigging inspector, expression/pose editor, timeline editor,  │
│     program editor, validation/checkup, standard-control mapper  │
├─ L3  Framework-agnostic embed ──────────────────────────────────┤
│     <vizij-face> web component + <script> + iframe.              │
│     JS control API mirroring the WS vocabulary                   │
│     (writeValues / readValues / listKeys / invoke); optional     │
│     Live-Control bridge client. THE GAP TODAY.                   │
├─ L2  React kit — @vizij/components  (functional, not a "UI kit") ┤
│     @vizij/runtime-react provider/hooks (exists) +               │
│     NEW extracted components: viewport frame, controls panel,    │
│     transport bar, timeline, expression grid, program editor.    │
├─ L1  Headless face core — @vizij/face-core (framework-agnostic) ─┤
│     Extract the non-React logic from runtime-react's provider    │
│     into a plain FaceRuntime controller: load package → compose  │
│     → step device → get/set inputs → resolve controls →          │
│     transport. No React, no DOM. Speaks arora contract (§6).     │
├─ L0  Engines (external WASM, unchanged) ────────────────────────┤
│     @vizij/arora-web-wasm, @vizij/node-graph-wasm                │
└──────────────────────────────────────────────────────────────────┘
```

**What exists vs. what's new:**

- **Exists, reused as-is:** L0 engines; `@vizij/render` (R3F `Vizij` viewer);
  `@vizij/utils`; `@vizij/node-graph-authoring` (graph/IR compiler);
  `@vizij/speech-react`; and `@vizij/runtime-react` (the current bundle-first
  face unit — proven as a single-dependency drop-in by `apps/tutorial-*-face`).
- **New — L1 `@vizij/face-core`:** extract the framework-agnostic controller out
  of `VizijRuntimeProvider.tsx` so non-React hosts (and L3) can use it.
- **New — L2 `@vizij/components`:** functional, runtime-wired React components
  extracted from the authoring app's tangled `components/app/*` (viewport frame,
  controls overlay, reference-face, etc.) and the editors. Deliberately **not**
  named `*-ui` — these carry behavior, not just styling.
- **New — L3 embed:** the framework-agnostic `<vizij-face>` drop-in — the
  headline reuse deliverable.
- **New/extracted — L4:** the editor surfaces, packaged so the authoring app is
  a thin assembly rather than a monolith.

**Current extraction candidates** (tangled inside `apps/vizij-authoring`):
`src/utils/runtimeBundle.ts` (Face Package builder), the face-frame /
controls-overlay / reference-face components in `src/components/app/`,
`RigControllerProvider`, and speech services duplicated from `@vizij/speech-react`.

---

## 8. Cross-cutting design principles

These apply to every proposal; the SRDs show how each honors them.

- **Progressive disclosure.** A newcomer sees a face and a few controls; depth
  (expressions, programs, standard-control maps, validation) reveals on demand.
- **Runtime-truthful preview everywhere.** The live 3D face is always driven by
  the real arora runtime, never a mock — as today.
- **Metadata over hard-coding.** Controls, expressions, and connections are
  discovered from runtime metadata, so UI and embeds work across any face.
- **One artifact.** The Face Package is the single thing you save, share, embed,
  and deploy. Fix today's confusion where "Save" silently means "export".
- **Accessibility.** Keyboard-navigable, screen-reader-labeled, sufficient
  contrast in light/dark, and non-color-coded status — called out per proposal.
- **Real undo/redo.** A genuine history stack (today's menu items are stubs) is a
  baseline expectation, not a feature of any single proposal.
