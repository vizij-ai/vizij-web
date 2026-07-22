# Proposal C — Headless + Component Kit

_Part of the Vizij face-ecosystem redesign set. Reads on top of
[`00-FOUNDATION.md`](./00-FOUNDATION.md) (personas §2, lifecycle §3, feature
checklist §4, terminology §5, the arora contract §6, and the L0–L4 package
architecture §7). This proposal makes §7 the centerpiece._

---

## 1. Thesis

**Invert the priority: the product is the package suite, and the app is a thin
assembly of it.** Today `vizij-authoring` is a ~4,600-line monolith
(`apps/vizij-authoring/src/App.tsx`) that _contains_ all the reusable value, and
`@vizij/runtime-react` is the only thing another site can actually pick up. We
flip that — ship a layered suite (**L0** WASM engines → **L1**
`@vizij/face-core` headless controller → **L2** `@vizij/components` React kit →
**L3** `<vizij-face>` framework-agnostic embed → **L4** `@vizij/editor-*` editor
packages) where every capability lives in a versioned, documented package, and
the authoring app becomes a ~few-hundred-line reference assembly that imports L2
and L4. This directly answers the mandate to build "components others can use on
other sites to define, control, animate, and deploy Vizij faces," with the
framework-agnostic drop-in — the one thing that does not exist today — as the
headline deliverable.

---

## 2. Software Requirements Definition (SRD)

### 2a. Front-end organization = the package architecture

For Proposals A, B, D, "front-end organization" means panels and screens. For
Proposal C it means **the public API of five layers**. The reference app's own
layout is a downstream consequence (§2a.5), not the design driver.

The complete stack (foundation §7):

```text
┌ L4  @vizij/editor-*  — editor surfaces packaged for reuse ───────────────┐
│     @vizij/editor-timeline · @vizij/editor-program ·                     │
│     @vizij/editor-pose · @vizij/editor-rig-inspector ·                   │
│     @vizij/editor-control-map · @vizij/editor-checkup                    │
├ L3  @vizij/face-embed  — framework-agnostic <vizij-face> + JS API ───────┤
│     custom element, imperative controller mirroring the WS vocabulary,   │
│     iframe fallback. THE GAP TODAY.                                       │
├ L2  @vizij/components  — functional React kit (behavior, not styling) ───┤
│     FaceViewport · ControlsPanel · TransportBar · ExpressionGrid ·       │
│     ProgramCanvas · StandardControlMapper · CheckupPanel · SpeechPanel   │
├ L1  @vizij/face-core  — headless FaceRuntime controller (no React/DOM) ──┤
│     load package → compose → step → get/set inputs at paths →            │
│     resolve controls → transport → subscribe. Speaks arora contract.     │
├ L0  engines (external WASM, unchanged) ──────────────────────────────────┤
│     @vizij/arora-web-wasm · @vizij/node-graph-wasm ·                     │
│     @vizij/animation-wasm · @vizij/orchestrator-wasm                     │
└──────────────────────────────────────────────────────────────────────────┘
```

The design rule for every layer: **a layer may depend only on layers below it.**
L4 depends on L2 and L1; L2 depends on L1; L3 wraps L1 (+ the L0/render bundle);
nothing reaches sideways. `@vizij/runtime-react` stays as the React binding of
L1 (it becomes a thin adapter, §5).

---

#### 2a.1 · L1 — `@vizij/face-core` (the headless controller)

**This is the load-bearing extraction.** Today all the runtime intelligence —
load a GLB, extract the embedded bundle, compose rig/pose/program/animation
graphs into one arora device, step it, drain changed writes, stage inputs,
resolve controls, run transport — lives _inside a React component_,
`VizijRuntimeProvider` (`packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`,
3,450 lines). None of it is intrinsically React. The provider holds all real
state in **refs** (`stagedInputsRef`, `clipPlaybackRef`, `programPlaybackRef`,
`rigInputMapRef`, `outputPathsRef`, `poseControlBridgeValuesRef`, …) and only
uses React for the mount lifecycle and the rAF loop. That is exactly the shape
of a plain controller class wearing a React costume.

L1 lifts that logic into a framework-agnostic `FaceRuntime` controller with **no
React and no DOM imports**. Its public surface, method-by-method, mapped to the
code it is extracted from:

```ts
// @vizij/face-core
import type { ValueJSON, ShapeJSON } from "@vizij/orchestrator-react";
import type {
  VizijAssetBundle,
  RuntimeGraphBundle,
  VizijGraphAsset,
  PoseRigConfig,
} from "@vizij/face-core";

export interface FaceRuntimeStatus {
  loading: boolean;
  ready: boolean;
  error: FaceRuntimeError | null;
  errors: FaceRuntimeError[];
  namespace: string;
  faceId?: string;
  rootId?: string | null;
  outputPaths: string[]; // namespaced output signal paths
  stepHz?: number;
  controllers: { graphs: string[]; anims: string[] };
}

export interface FaceRuntimeOptions {
  assetBundle: VizijAssetBundle;
  namespace?: string;
  faceId?: string;
  updateTier?: "auto" | "assets" | "graphs";
  mergeStrategy?: MergeStrategyOptions; // default { outputs: "add", intermediate: "add" }
  createOptions?: CreateOrchOptions;
  transformOutputWrite?: (w: RuntimeOutputWrite) => RuntimeOutputWrite | null;
}

export class FaceRuntime {
  constructor(options: FaceRuntimeOptions);

  // ---- lifecycle -------------------------------------------------------
  /** Create the arora device, load the GLB/world, extract the embedded
   *  VIZIJ_bundle, compose graphs, register controllers. Resolves when ready.
   *  Extracted from the loadAssets() effect + registerControllers() +
   *  createOrchestrator() in VizijRuntimeProvider. */
  init(): Promise<void>;
  dispose(): void;

  // ---- composition (arora invariant #1) --------------------------------
  /** Recompose rig + pose + program graphs into the single device graph.
   *  Extracted from registerControllers()/registerMergedGraph(). */
  compose(): void;
  /** Hot-swap authored graphs without reloading the GLB or losing device
   *  store state. Extracted verbatim from setGraphBundle() +
   *  applyRuntimeGraphBundle() + resolveRuntimeUpdatePlan(). */
  setGraphBundle(
    bundle: RuntimeGraphBundle,
    opts?: { tier?: "auto" | "assets" | "graphs" },
  ): void;

  // ---- the step / drain loop (arora invariant #3) ----------------------
  /** Advance the device by dt (seconds): flush staged inputs, advance
   *  tweens+clips, step the device, drain changed writes → output values.
   *  Extracted from step(). NOTE: no rAF here — the host owns the clock. */
  step(dt: number, opts?: { forceRuntime?: boolean }): void;
  advanceAnimations(dt: number): void;

  // ---- inputs at canonical paths (arora invariant #2) ------------------
  /** Stage a ValueJSON at an (un-namespaced) path; namespacing + pose-weight
   *  fallback handled internally. Extracted from setInput(). */
  writeInput(path: string, value: ValueJSON, shape?: ShapeJSON): void;
  /** Batch form of writeInput — mirrors the WS write_values verb. */
  writeInputs(values: Record<string, ValueJSON>): void;
  /** Current cached value at a path (orchestrator snapshot). mirrors read_values. */
  readValue(path: string): ValueJSON | undefined;
  /** All known input paths + constraints (min/max/default), built from graph
   *  metadata. Extracted from extractInputConstraints()/inputConstraints. */
  listInputs(): Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >;
  /** All output signal paths currently emitted. mirrors list_keys. */
  listOutputs(): string[];
  stagePoseNeutral(force?: boolean): void;

  // ---- control resolution (metadata-over-hardcoding) -------------------
  /** Discover gaze/blink/eyelid controls from runtime metadata. Extracted
   *  from resolveFaceControls() (already framework-free today). */
  resolveControls(): ResolvedFaceControls;

  // ---- value + transport helpers ---------------------------------------
  animateValue(
    path: string,
    target: ValueJSON,
    opts?: AnimateValueOptions,
  ): Promise<void>;
  cancelAnimation(path: string): void;
  playAnimation(id: string, opts?: PlayAnimationOptions): Promise<void>;
  pauseAnimation(id: string): void;
  seekAnimation(id: string, timeSeconds: number): void;
  setAnimationLoop(id: string, enabled: boolean): void;
  getAnimationState(id: string): AnimationPlaybackState | null;
  stopAnimation(id: string, opts?: StopAnimationOptions): void;
  playProgram(id: string): void;
  pauseProgram(id: string): void;
  stopProgram(id: string, opts?: StopProgramOptions): void;
  getProgramState(id: string): ProgramPlaybackState | null;

  // ---- input drivers (external live control) ---------------------------
  /** Register a start/stop/dispose driver that pushes inputs each frame.
   *  Extracted from registerInputDriver(). */
  registerInputDriver(
    id: string,
    factory: InputDriverFactory,
  ): InputDriverLifecycle;

  // ---- observation (replaces React re-render) --------------------------
  /** Subscribe to status changes (loading/ready/errors/controllers). */
  onStatusChange(cb: (s: FaceRuntimeStatus) => void): () => void;
  /** Subscribe to drained output writes for a set of paths — the headless
   *  equivalent of the frame → setValues effect and useVizijOutputs(). */
  onValuesChanged(
    paths: string[] | "*",
    cb: (values: Record<string, RawValue>) => void,
  ): () => void;

  get status(): FaceRuntimeStatus;
  get assetBundle(): VizijAssetBundle;
}
```

**How L1 upholds the arora contract (§6), with no React/DOM:**

| Invariant                                                   | How `FaceRuntime` honors it                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. One composed graph, one device per face**              | `init()`/`compose()` build the single `{nodes, edges}` merged graph via the orchestrator's `registerMergedGraph()` when >1 source exists (exactly as `VizijRuntimeProvider` does at lines 2143–2161). One `FaceRuntime` = one device = one namespace.                          |
| **2. Unprefixed `params.path` is the cross-graph contract** | `writeInput()`/`readValue()` take canonical un-namespaced paths and apply `namespaceTypedPath()` / `stripNamespace()` internally (extracted from `setInput`, lines 1712–1766). Node ids get namespaced (`namespaceGraphSpec`, `namespaceControllerId`), paths do not.          |
| **3. `ValueJSON` I/O + step-in-`dt` / drain-changes**       | `step(dt)` calls the device step then drains `frame.merged_writes`, converts `ValueJSON → RawValue` via `valueJSONToRaw`, and only forwards changed keys to subscribers (extracted from the `frame` effect, lines 2279–2376). Pull model preserved — no full re-emit per tick. |
| **4. Hot updates via `setGraphBundle(bundle, {tier})`**     | `setGraphBundle()` reuses `applyRuntimeGraphBundle()` + `resolveRuntimeUpdatePlan()` unchanged; `tier: "graphs"` re-registers controllers without reloading the GLB or dropping device store state.                                                                            |

**What moves out of React:** the rAF/`setInterval` loop (lines 3269–3327),
`useState`/`useRef`, and the memoized `contextValue`. **What stays exactly:** the
composition, path bridging (`resolvePoseControlInputPath`, the pose-control
frame bridge at 2320–2352), constraint extraction, clip/program transport, and
the merge/dedup logic in `mergeAssetBundle()`. These become plain methods and
private fields. Because the provider already keeps this state in refs, the
extraction is mechanical, not a rewrite.

L1 re-exports the current type vocabulary so nothing downstream breaks:
`VizijAssetBundle`, `VizijGlbAsset`, `VizijGraphAsset`, `VizijAnimationAsset`,
`VizijProgramAsset`, `PoseRigConfig`, `RuntimeGraphBundle`, `RuntimeOutputWrite`
(today in `packages/@vizij/runtime-react/src/types.ts`), plus the pose-path
helpers (`buildRigInputPath`, `buildPoseWeightPathMap`) and `resolveFaceControls`
(today under `runtime-react/src/utils/`).

---

#### 2a.2 · L2 — `@vizij/components` (functional React kit)

L2 is the React kit — **components that carry behavior, not a styling
UI-kit**. Each is wired to L1 (via the thin `@vizij/runtime-react` provider that
now wraps a `FaceRuntime`) and is extracted from a specific place in
`apps/vizij-authoring`.

| Component                                    | Responsibility                                                                                                                                                                                   | Extracted / assembled from                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `<FaceRuntimeProvider>` / `useFaceRuntime()` | React binding over `FaceRuntime`: owns the rAF loop, mirrors `status`, exposes context. **This is today's `VizijRuntimeProvider` shrunk to an adapter.**                                         | `packages/@vizij/runtime-react/src/VizijRuntimeProvider.tsx`, `hooks/useVizijRuntime.ts`                                         |
| `<FaceViewport>`                             | Renders the live face; wraps `VizijRuntimeFace` (`Vizij` from `@vizij/render`, props `rootId`/`namespace` owned by runtime). Optional in-viewport play/pause overlay, selection glow, safe-area. | `runtime-react` `VizijRuntimeFace`; `src/components/app/{Viewer,RuntimeFaceFrame,RuntimeFaceControlsOverlay}.tsx` (inventory §9) |
| `<ControlsPanel>`                            | Slider/number grid over `runtime.listInputs()` (min/def/max), grouped, searchable. Drives `writeInput`. The reusable form of today's inspector rig-driver editing.                               | `src/components/inspector/*`, `src/components/panels/{VariablesPanel,inputCatalog}.ts` (§7, §8)                                  |
| `<StandardControlMapper>`                    | View/edit the Standard-Control map (`/standard/{ns}/{channel}/{track}/{attr}`), coverage, ranges.                                                                                                | `src/components/app/StdFeatureSpaces*.tsx`, `src/utils/standardInput*.ts` (§11)                                                  |
| `<TransportBar>`                             | Play/pause/stop/seek/loop/speed over `play/pause/seek/stop{Animation,Program}`. Source-agnostic (clip **or** program).                                                                           | `src/components/panels/AnimationPanel.tsx`, `RuntimeSourceToolbar.tsx`, `useGraphPlaybackControls.ts` (§4, §9)                   |
| `<ExpressionGrid>`                           | Expression (pose) chooser + weight sliders + blend/layering preview, from `assetBundle.pose.config`.                                                                                             | `src/poseRig/*`, `src/components/panels/VariablesPanel.tsx` pose surfaces (§6)                                                   |
| `<Timeline>`                                 | Keyframe timeline: ruler, playhead, track lanes, draggable keyframes, add-track.                                                                                                                 | `src/components/animation/{TimelineEditor,TrackRow}.tsx` (§4) → also the core of L4 `@vizij/editor-timeline`                     |
| `<ProgramCanvas>`                            | ReactFlow program graph: palette, typed edges, node inspectors, live value chart.                                                                                                                | `src/motiongraph/**` (§5) → core of L4 `@vizij/editor-program`                                                                   |
| `<CheckupPanel>`                             | Validation/audit surface: bundle audit, robot-data audit, graph diagnostics.                                                                                                                     | `src/components/app/{VizijBundleAuditPanel,RobotDataAuditPanel,GraphDiagnosticsPanel}.tsx` (§12)                                 |
| `<SpeechPanel>`                              | TTS/STT/LLM conversational surface bound to speech input paths. Reuses `@vizij/speech-react`.                                                                                                    | `src/components/panels/SpeechPanel.tsx` + hooks (§10)                                                                            |

L2 ships **headless-by-default**: components accept `className`/`render` props
and unstyled DOM with data-attributes, so a consumer's design system wins. A
thin `@vizij/components/styled` entry provides the default Tailwind look the
reference app uses. Hooks come too: `useRigInput(path)` and
`useVizijOutputs(paths)` already exist in `runtime-react/src/hooks/` and move up
as-is.

Minimal L2 usage (a custom controller page on someone else's React site):

```tsx
import {
  FaceRuntimeProvider,
  FaceViewport,
  ControlsPanel,
  TransportBar,
} from "@vizij/components";

export function MyFacePage() {
  return (
    <FaceRuntimeProvider src="/faces/quori.glb" namespace="site" autostart>
      <FaceViewport className="h-[480px]" />
      <ControlsPanel groupBy="standard" />
      <TransportBar />
    </FaceRuntimeProvider>
  );
}
```

---

#### 2a.3 · L3 — `@vizij/face-embed` (the framework-agnostic drop-in)

L3 is **the headline deliverable and the gap that exists nowhere today.** It
wraps a `FaceRuntime` (L1) + the `@vizij/render` R3F viewer in a Custom Element
so any site — plain HTML, Vue, Svelte, WordPress, a CMS — can drop in a face
with a `<script>` tag and drive it with vanilla JS. Its imperative API
**deliberately mirrors the `vizij-standalone` WebSocket vocabulary** (§6, and
`apps/vizij-standalone/src/hooks/useWebSocketSync.ts`): `write_values` /
`read_values` / `list_keys` / `invoke` / `values_changed`. One vocabulary from
the wire to the DOM.

**Custom-element attributes:**

| Attribute    | Meaning                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src`        | Face Package URL (GLB with embedded `VIZIJ_bundle`). Required.                                                                                                             |
| `namespace`  | Runtime namespace (default derived from element id). Isolates multiple faces on one page.                                                                                  |
| `autoplay`   | If present, play `metadata.activeMotionGraphId` on load — the same behavior the tutorial app implements manually (`tutorial-fullscreen-face/src/FaceApp.tsx` lines 60–85). |
| `program`    | Explicit program id to start instead of the bundle default.                                                                                                                |
| `background` | Background color (matches standalone's per-model background).                                                                                                              |
| `autostart`  | Whether the runtime steps automatically (maps to L1's rAF loop).                                                                                                           |

**Imperative JS API** (methods on the element, mirroring the WS verbs):

```ts
interface VizijFaceElement extends HTMLElement {
  // write_values — batch or single, canonical paths
  writeValues(values: Record<string, number | ValueJSON>): void;
  writeValue(path: string, value: number | ValueJSON): void;
  // read_values / list_keys
  readValues(paths: string[]): Record<string, number>;
  listKeys(): string[]; // input + output paths
  listInputs(): Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >;
  // invoke — the WS "method" verb: transport + pose + neutral as named methods
  invoke(
    method:
      | "playProgram"
      | "pauseProgram"
      | "stopProgram"
      | "playAnimation"
      | "pauseAnimation"
      | "seekAnimation"
      | "stagePoseNeutral"
      | "setPoseWeight",
    args?: Record<string, unknown>,
  ): unknown;
  // values_changed — server-pushed change stream
  on(
    event: "valuesChanged",
    cb: (values: Record<string, number>) => void,
  ): () => void;
  on(event: "ready" | "error", cb: (detail: unknown) => void): () => void;
  readonly runtime: FaceRuntime; // escape hatch to L1
}
```

This is a 1:1 mapping of `useWebSocketSync`'s event handlers: `update-values`
→ `writeValues`, `get-slot-values-request` → `readValues`, `reset` →
`invoke("stagePoseNeutral", { force: true })`, and the `set_slots`/node-list
sync → `listInputs()`.

**`<script>` tag + minimal HTML usage** (no build step, no framework):

```html
<!doctype html>
<html>
  <body>
    <!-- one script defines the <vizij-face> element -->
    <script
      type="module"
      src="https://cdn.vizij.ai/face-embed@1/vizij-face.js"
    ></script>

    <vizij-face
      id="lobby"
      src="/faces/quori.glb"
      namespace="lobby"
      autoplay
      background="#111"
      style="width: 480px; height: 480px;"
    ></vizij-face>

    <button onclick="grinAndLook()">React</button>

    <script>
      const face = document.getElementById("lobby");

      face.on("ready", () => {
        console.log("inputs:", face.listInputs());
      });

      // drive it live — same paths a robot or WS client would use
      function grinAndLook() {
        face.writeValues({
          "/standard/vizij/left_eye/pos/x": 0.6,
          "/standard/vizij/right_eye/pos/x": 0.6,
          "/expressions/smile.weight": 1.0,
        });
      }

      // subscribe to output signals (values_changed)
      face.on("valuesChanged", (values) => {
        document.getElementById("jaw").textContent =
          values["/standard/vizij/mouth/morph/jaw_open"]?.toFixed(2);
      });
    </script>
  </body>
</html>
```

**COOP/COEP + iframe fallback.** arora WASM requires cross-origin isolation
(`COOP: same-origin`, `COEP: require-corp` — inventory §13). A host site often
cannot set those headers. L3 therefore ships **two delivery modes** behind the
same element API:

1. **Direct mode** — the custom element instantiates `FaceRuntime` in the host
   page. Requires the host to be cross-origin isolated. Lowest latency, shares
   the page's memory.
2. **Iframe mode** (default when isolation is absent) — the element renders an
   `<iframe>` pointing at a Vizij-hosted, already-isolated player page; the same
   `writeValues/readValues/listKeys/invoke/on` API is proxied over
   `postMessage`. The consumer's code is byte-identical; only the transport
   changes. The element auto-detects `crossOriginIsolated` and picks a mode
   (overridable with a `mode="direct|iframe"` attribute).

L3 is built with a light custom-element wrapper mounting the same React tree the
tutorials use (`createRoot` + `<VizijRuntimeProvider><VizijRuntimeFace/>` —
`tutorial-fullscreen-face/src/main.tsx`), so the embed and the app share one
render path.

---

#### 2a.4 · L4 — `@vizij/editor-*` (editor packages)

L4 packages the **heavy editing surfaces** so the app is an assembly, not the
owner. Each editor is a self-contained package that operates on a typed authored
model and emits a `RuntimeGraphBundle` for L1's `setGraphBundle()` — i.e. every
editor's "commit" is a hot graph swap, exactly the tooling flow
`vizij-authoring` uses today.

| Package                       | Owns                                                            | Authored model (schema, inventory §15)                       | Extracted from                                                      |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `@vizij/editor-rig-inspector` | DEFINE: controls, transforms, materials, morphs, bindings/links | `bindingAuthoringStore`, `src/rig/*`                         | `src/components/inspector/*`, `src/components/binding/*` (§7)       |
| `@vizij/editor-pose`          | ANIMATE: expressions, expression sets, layering, neutral        | `PoseDefinition`, `PoseGroupDefinition`, `PoseRigConfigFile` | `src/poseRig/**`, `src/components/poseRig/*` (§6)                   |
| `@vizij/editor-timeline`      | ANIMATE: keyframe animations/clips                              | `AnimationClipIR`                                            | `src/components/animation/**`, `src/state/animationStore.ts` (§4)   |
| `@vizij/editor-program`       | ANIMATE: programs/behaviors (node graph)                        | `useEditorStore` nodes/edges                                 | `src/motiongraph/**` (§5)                                           |
| `@vizij/editor-control-map`   | DEFINE: standard-control mapping                                | `ManagedStandardInput`                                       | `src/components/app/StdFeatureSpaces*`, `src/referenceFace/*` (§11) |
| `@vizij/editor-checkup`       | Cross-cutting: validation/audits, import discrepancy review     | `GraphDiffResult`, `MachineReport`                           | `src/components/{app/*Audit*,discrepancy/*}` (§2, §12)              |

**Boundary rule for L4:** an editor package may import L1 (`@vizij/face-core`)
and L2 (`@vizij/components`) but **never another L4 editor**. Cross-editor
coordination (e.g. inserting a keyframe from the pose editor into the timeline)
happens through the app shell or a small shared `@vizij/editor-shared` bus — it
is not baked into any editor. This keeps each editor droppable on its own: a
partner site can embed just `@vizij/editor-timeline` over their own face.

The heavy authoring dependencies (`ReactFlow` for `editor-program`,
`react-colorful` for material editing) are isolated to the editor that needs
them — so a consumer of L2/L3 never pays for ReactFlow.

---

#### 2a.5 · The thin reference app

`vizij-authoring` becomes **VizijStudio**, a reference assembly: it imports L2
for the viewport/controls/transport/speech, L4 for the editors, wires the shell
(menu bar, resizable panels, edit-focus layouts, undo/redo history), and adds
almost no runtime logic of its own. Concretely, `App.tsx` shrinks from ~4,600
lines to a composition root: a `<FaceRuntimeProvider>` at the top, an app-shell
that mounts editors on demand, and the DEFINE→CONTROL→ANIMATE→DEPLOY lifecycle
(§3) as the top-level navigation. The Face Package builder
(`src/utils/runtimeBundle.ts` — `buildRuntimeBaseBundle`/`buildRuntimeGraphBundle`,
which today prove the whole consumer pattern) moves into L1 as
`FaceRuntime`-adjacent helpers. `apps/vizij-standalone` already _is_ a thin
consumer (`App.tsx` builds a `VizijAssetBundle` and mounts
`VizijRuntimeProvider` + `VizijRuntimeFace`); it gets rebuilt on L3's embed to
prove the pattern all the way down.

**Mitigating "app UX becomes a by-product" (the stated risk).** This is the real
danger of a packaging-first design. Four countermeasures:

1. **The reference app is a first-class package consumer, dogfooded in CI.** If a
   workflow is clumsy in VizijStudio, that is a bug in the L2/L4 API, and it is
   fixed in the package — the app is the acceptance test for API ergonomics.
2. **Lifecycle IA lives in the app, not the packages.** Progressive disclosure,
   onboarding, and the DEFINE→DEPLOY spine are owned by the shell so the app can
   still be _designed_, not just assembled.
3. **A UX owner for the reference app** with authority to file blocking issues
   against package APIs. Packaging discipline cannot mean "ship whatever composes."
4. **Golden-path E2E tests** (extend today's Playwright `e2e/`) run against the
   assembled app, so a good app experience is a release gate.

---

### 2b. Terminology

Two audiences, two glossaries. **End-users** of the reference app see the
foundation's plain-language terms (§5). **Developers** consuming packages see an
API vocabulary that is precise and stable.

**End-user facing** (reference app), per foundation §5:

| Internal today                            | User-facing                                                           |
| ----------------------------------------- | --------------------------------------------------------------------- |
| rig / binding / driver / animatable       | **Control**, and a **Link**/**Formula** between controls              |
| standard inputs / Standard Feature Spaces | **Standard Controls** / **Control Map**                               |
| pose / pose group / blend stage           | **Expression** / **Expression Set** / **Layering** / **Resting Face** |
| motiongraph / node-graph program          | **Program** / **Behavior**                                            |
| animation clip / keyframe                 | **Animation** / **Clip** / **Keyframe** (kept)                        |
| bundle / GLB / `VIZIJ_bundle`             | **Face Package**                                                      |
| endpoints / WS·ROS2·Studio bridges        | **Live Control** / **Connections**                                    |
| discrepancy wizard / audits               | **Checkup**                                                           |
| arora device / IR / compile               | _(hidden)_                                                            |

**Developer-facing** (package/API naming). Distinct discipline: developer names
must be **honest about mechanism** because the developer needs to reason about
behavior. So the API keeps `writeInput`/`readValue`/`step`/`setGraphBundle` and
canonical **paths** — these are the arora contract's real nouns. The mapping
between the two vocabularies is documented once, in `@vizij/face-core`:

| Concept                       | End-user term     | Package API term                                     |
| ----------------------------- | ----------------- | ---------------------------------------------------- |
| The artifact                  | Face Package      | `VizijAssetBundle` / `.glb`                          |
| A single controllable channel | Control           | input **path** (`writeInput(path, …)`)               |
| Set of universal names        | Standard Controls | `/standard/{ns}/{channel}/{track}/{attr}` paths      |
| A named look                  | Expression        | pose (`PoseDefinition`, `poses/{id}.weight` path)    |
| Reactive logic                | Program           | `VizijProgramAsset`                                  |
| External driving              | Live Control      | `writeValues` / `readValues` / `listKeys` / `invoke` |

The rule: **user terms describe intent; API terms describe the path/value
mechanism.** The embed (L3) intentionally uses the API vocabulary
(`writeValues`, `listKeys`) because its audience is developers, and it is the
same vocabulary the WS bridge already speaks — so a robotics integrator moving
from ROS 2/WS to the web embed sees identical verbs.

---

### 2c. Workflows

Because the product is the suite, workflows come in two families.

#### End-user journeys (in the reference app)

- **DEFINE** — Import a Face Package or GLB (`<FaceViewport>` + `@vizij/editor-rig-inspector`), run the guided **Checkup** (`@vizij/editor-checkup`, folding today's orientation/discrepancy prompts into one reviewable step), name **Controls**, map **Standard Controls** (`@vizij/editor-control-map`).
- **CONTROL** — Drive controls live in `<ControlsPanel>`; try gaze/blink via resolved controls; open **Live Control** to connect an external signal (drives the same paths).
- **ANIMATE** — Author **Expressions** (`@vizij/editor-pose`), **Animations** (`@vizij/editor-timeline`), **Programs** (`@vizij/editor-program`), and **Speech** (`<SpeechPanel>`); every edit commits via `setGraphBundle({tier:"graphs"})` so the live face updates without a reload.
- **DEPLOY** — Save/Export **one Face Package** (`.glb` + embedded `VIZIJ_bundle`); copy the `<vizij-face>` embed snippet; the app shows the exact HTML from §2a.3 pre-filled with the package URL.

#### Developer journeys (the reuse mandate)

1. **Install packages.**

   ```bash
   pnpm add @vizij/components   # pulls @vizij/face-core, @vizij/render (peer: react)
   # or, no framework:
   pnpm add @vizij/face-embed
   ```

2. **Embed a face on a plain HTML site** — drop the `<script>` + `<vizij-face src=…>` from §2a.3. Zero build. Iframe fallback handles non-isolated hosts automatically.
3. **Drive it live from a host app** — `face.writeValues({ … })` on pointer/emotion/speech events; `face.on("valuesChanged", …)` to mirror outputs. Identical verbs to the ROS 2 / WebSocket bridges, so robot-stack code ports directly (`useWebSocketSync` becomes one thin adapter onto the same element API).
4. **Build a custom editor** — a partner assembles their own tool from `<FaceRuntimeProvider>` + `<FaceViewport>` + `@vizij/editor-timeline` over their own faces, skipping the surfaces they do not want. No monolith to fork.
5. **Headless server/robot use** — import `@vizij/face-core` alone, `new FaceRuntime({assetBundle})`, `init()`, and drive `step(dt)` + `writeInput()` from a Node/worker loop with no DOM. This is impossible today because the logic is trapped in a React component.

---

### 2d. Accessibility + API ergonomics & discoverability

**End-user accessibility** (cross-cutting principle, foundation §8): L2/L4
components ship keyboard-navigable controls, ARIA roles/labels, focus
management, and non-color-coded status (Checkup uses icon+text, not just red).
Sliders in `<ControlsPanel>` expose `aria-valuenow/min/max` from
`runtime.listInputs()`. Light/dark meet contrast in both themes. Because
accessibility lives in the shared L2 components, **every** consumer site inherits
it — a distinct advantage of packaging-first over per-app implementation.

**Developer API ergonomics & discoverability** — a first-class requirement here,
since the API _is_ the product:

- **Fully typed public APIs.** Every package ships `.d.ts`; the type vocabulary
  (`VizijAssetBundle`, `RuntimeGraphBundle`, `FaceScalarControl`, …) is exported
  and documented. `listInputs()`/`listKeys()` make a face **self-describing** at
  runtime, so a developer can discover controls without reading face-specific
  docs — the same metadata-over-hardcoding principle that powers
  `resolveFaceControls()` and `useWebSocketSync`'s constraint-driven slot sync.
- **One vocabulary, three transports.** `writeValues/readValues/listKeys/invoke`
  is identical across L3 embed JS, the WS bridge, and (as method names) L1 — the
  smallest thing a developer must learn.
- **Docs + runnable examples per package.** Each package README carries a
  copy-paste Quick Start (the current `@vizij/runtime-react/README.md` is the
  template). The tutorial apps (`apps/tutorial-fullscreen-face`,
  `apps/tutorial-agent-face`) become the L2/L3 example gallery, plus a new
  plain-HTML example for L3. A Storybook over L2 gives live component docs.
- **Progressive API depth.** `<vizij-face autoplay>` needs zero JS; `writeValues`
  is the next step; `element.runtime` (the raw `FaceRuntime`) is the escape hatch
  for advanced hosts. Newcomers are never forced to the bottom layer.

---

## 3. Feature-coverage matrix

All 19 inventory areas mapped to an owning layer/package/component. Nothing
dropped. "Fix" marks a §18 gap this design repairs.

| #   | Inventory area                           | Owner (layer · package/component)                                                                         | Notes                                                                                                                                                                                                                      |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Application shell, layout & navigation   | **Reference app** (VizijStudio shell) + `@vizij/editor-shared`                                            | IA re-organized around the DEFINE→DEPLOY lifecycle; 13-panel/4-navigation tangle replaced by lifecycle stages. **Fix:** real undo/redo history in the shell (§18).                                                         |
| 2   | Import                                   | **L4** `@vizij/editor-checkup` + **L1** `FaceRuntime.init()`                                              | GLB/glTF load is L1 (`loadGLTFFromBlobWithBundle`); preset library + reference-face + graph/pose JSON import + orientation/discrepancy folded into the guided **Checkup**.                                                 |
| 3   | Export / Save                            | **L1** Face Package builder (from `src/utils/runtimeBundle.ts`) + **L4** `editor-checkup` gate            | One artifact. **Fix:** Save ≠ Export confusion resolved — "Face Package" is the single unit. **Fix:** SFS export ships (was "coming soon").                                                                                |
| 4   | Keyframe animation editor                | **L4** `@vizij/editor-timeline` (+ **L2** `<TransportBar>`, `<Timeline>`)                                 | Timeline/tracks/keyframes as reusable components. Transport bridges via L1 clip transport.                                                                                                                                 |
| 5   | Procedural motion-graph editor (Program) | **L4** `@vizij/editor-program` (+ **L2** `<ProgramCanvas>`)                                               | ReactFlow isolated to this package. Committed programs run in the arora device via `setGraphBundle`. **Fix:** retire the vestigial live-preview `OrchestratorProvider` (§5, foundation §6) by stepping preview through L1. |
| 6   | Pose rig authoring                       | **L4** `@vizij/editor-pose` (+ **L2** `<ExpressionGrid>`)                                                 | "Expressions/Sets/Layering/Resting Face" terminology. Pose config schema unchanged.                                                                                                                                        |
| 7   | Inspector (4 modes)                      | **L4** `@vizij/editor-rig-inspector`                                                                      | Scene-object / control-driver / expression / material modes; binding/link editor; chain navigation.                                                                                                                        |
| 8   | Left-sidebar authoring surfaces          | **L2** `<ControlsPanel>` + **Reference app** shell; hierarchy in `editor-rig-inspector`                   | Hierarchy, variables, materials, inputs become panels the app arranges.                                                                                                                                                    |
| 9   | 3D viewport / runtime & preview          | **L2** `<FaceViewport>` (wraps `@vizij/render` + L1)                                                      | Runtime-truthful preview everywhere. Empty-state demo becomes an L2/L3 sample.                                                                                                                                             |
| 10  | Speech & conversational avatar           | **L2** `<SpeechPanel>` over `@vizij/speech-react`                                                         | De-duplicate: app's copied speech services (§7 extraction candidates) collapse into the package. Speech config round-trips in the Face Package (`VizijSpeechConfig`).                                                      |
| 11  | Standard Feature Spaces (mapping)        | **L4** `@vizij/editor-control-map` (+ **L2** `<StandardControlMapper>`)                                   | "Standard Controls / Control Map." **Fix:** export ships.                                                                                                                                                                  |
| 12  | Diagnostics, audits & debug              | **L4** `@vizij/editor-checkup` (+ **L2** `<CheckupPanel>`)                                                | Bundle/robot-data/graph audits + memory harness unify under Checkup.                                                                                                                                                       |
| 13  | Architecture & WASM engines (arora)      | **L0** (unchanged) + **L1** `@vizij/face-core`                                                            | arora contract preserved verbatim (§5). COOP/COEP handled by L3 (direct) or the isolated iframe host (fallback).                                                                                                           |
| 14  | Internal `@vizij/*` dependency map       | **All layers** — this is the dependency graph (§5)                                                        | `@vizij/runtime-react` becomes L1's React adapter; `orchestrator-react` vestigial dep removed (foundation §6).                                                                                                             |
| 15  | Data model / authored-entity schemas     | **L1** shared types + per-**L4** editor models                                                            | Schemas re-exported from L1 so every layer agrees on one vocabulary.                                                                                                                                                       |
| 16  | State management                         | **L1** owns runtime state (refs→controller fields); **L4** owns per-editor stores; app owns shell/history | Clear ownership replaces today's two-pattern coexistence.                                                                                                                                                                  |
| 17  | Persistence                              | **Reference app** + **L1** package builder                                                                | No project DB (kept); Face Package is the durable artifact. localStorage (theme/speech keys) stays app-level.                                                                                                              |
| 18  | Known gaps / caveats                     | **Reference app** (undo/redo) + **L1/L4** (Save≠Export, SFS export)                                       | Explicitly repaired — see rows 1, 3, 11. Stale `temp.txt` / doc removed during extraction.                                                                                                                                 |
| 19  | Testing & build                          | **Per-package** unit + typecheck + lint; **app** E2E golden paths                                         | Each package gets its own test suite; the reference app's Playwright suite becomes the API acceptance gate (§2a.5).                                                                                                        |

---

## 4. Review — self-critique

**Completeness.** All 19 areas land in a named owner; the four §18 gaps
(undo/redo, Save≠Export, SFS export, stale files) are repaired rather than
carried. The design is the only one in the set that fully answers the reuse
mandate at every level — headless (L1), React (L2), no-framework (L3), and
editor (L4) — and the framework-agnostic drop-in that "does not exist today"
(foundation §1) is a concrete deliverable with a real API.

**Where it is strong.** The riskiest extraction (L1) is _mechanical_ because
`VizijRuntimeProvider` already isolates its state in refs and its arora coupling
in a handful of helper modules; we are moving code, not redesigning the runtime.
The arora contract is preserved by construction (§5). Accessibility and API
consistency, done once in shared packages, propagate to every consumer.

**Where it is weakest — honest tensions:**

1. **Packaging overhead is real and permanent.** Seven+ new/split packages mean
   Changesets, semver discipline, peer-dep matrices, per-package CI, and
   coordinated releases. A one-line runtime fix can now touch three packages and
   a version bump. This is a genuine tax the other proposals do not pay. Mitigation:
   a monorepo with fixed/locked versioning for the core trio (`face-core`,
   `runtime-react`, `render` — they already "stay on the same release line" per
   the current README) so most changes are one coordinated bump, not N independent ones.
2. **API surface size.** `FaceRuntime` exposes ~30 methods (it inherits the
   provider's full `VizijRuntimeContextValue`). A large public surface is a large
   compatibility commitment. Mitigation: tier the API — a small **stable core**
   (`init`, `step`, `writeInput`, `readValue`, `listInputs`, `setGraphBundle`,
   `onValuesChanged`) marked `@stable`, and the transport/driver helpers marked
   `@experimental` until proven, matching today's "Status: experimental" honesty.
3. **The reference app can rot into a demo.** Flagged in the prompt and the top
   risk. If the org treats VizijStudio as "just the sample," its UX degrades.
   Mitigation is organizational, not technical (§2a.5): a UX owner, golden-path
   E2E as a release gate, and the rule that app clumsiness is a package-API bug.
4. **L3 iframe fallback splits behavior subtly.** postMessage proxying adds
   latency and serialization limits (e.g. `invoke` return values must be
   JSON-serializable) that direct mode does not have. Consumers on non-isolated
   hosts get a slightly different performance/latency profile. Mitigation:
   document the two modes explicitly and keep the API surface identical so code
   ports unchanged even if timing differs.

**Simplicity verdict.** For a _consumer_, this is the simplest possible story —
one script tag, or one `pnpm add`, or one class. For the _maintainer_, it is the
most complex proposal in the set. That trade is the whole point: we accept
internal packaging complexity to make external reuse trivial. If the org cannot
staff the packaging discipline, Proposal A or D is safer.

---

## 5. Architecture

### 5.1 Definitive L0–L4 decomposition

```text
L0  engines (unchanged, external WASM)
    @vizij/arora-web-wasm · @vizij/node-graph-wasm ·
    @vizij/animation-wasm · @vizij/orchestrator-wasm

L1  @vizij/face-core          headless FaceRuntime controller (no React/DOM)
    depends on: L0, @vizij/utils, @vizij/value-json,
                @vizij/node-graph-authoring (compileIrGraph), @vizij/render (types only)

L2  @vizij/components         functional React kit
    @vizij/runtime-react      (thin React adapter over FaceRuntime; kept for compat)
    depends on: L1, @vizij/render (viewer), @vizij/speech-react; peer react/react-dom

L3  @vizij/face-embed         <vizij-face> custom element + JS API + iframe host
    depends on: L1, @vizij/render; bundles react/react-dom internally (no peer)

L4  @vizij/editor-rig-inspector · editor-pose · editor-timeline ·
    editor-program · editor-control-map · editor-checkup · editor-shared
    depends on: L1, L2 (+ ReactFlow, react-colorful scoped to the editors that use them)
```

### 5.2 Exact arora-contract preservation

The four invariants (foundation §6) are preserved by keeping the arora boundary
where it already is and only moving it down one layer, from React component into
L1 class:

- **The boundary stays narrow.** L1 is the _only_ code that touches the
  orchestrator/arora device (`useOrchestrator` → internal orchestrator handle).
  L2/L3/L4 speak `VizijAssetBundle` / `RuntimeGraphBundle` and canonical **paths**
  — never the device — exactly as the foundation mandates ("Never touch the arora
  device directly").
- **Composition, path identity, ValueJSON step/drain, and hot updates** are the
  extracted methods `compose()`, `writeInput()`/`readValue()`, `step()`, and
  `setGraphBundle()` — each traced to its current line range in §2a.1. No
  semantics change; the rAF _driver_ moves to L2's `<FaceRuntimeProvider>` (React)
  or L3's element (custom-element `connectedCallback`), while `step(dt)` itself is
  pure L1.
- **Two sharp edges resolved.** (a) `@vizij/orchestrator-react` is listed as a
  vestigial `runtime-react` dependency (foundation §6) — the extraction drops it
  from L1's dependency set. (b) The motion-graph editor's live preview still runs
  its own `OrchestratorProvider` (`orchestrator-wasm`) — L4 `editor-program`
  instead steps its preview through an L1 `FaceRuntime`, removing the last
  load-bearing orchestrator outside the composed device.

### 5.3 Extraction map (current file → target package)

| Current location                                                                                                                                  | → Target                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `runtime-react/src/VizijRuntimeProvider.tsx` (composition, step/drain, transport, drivers, `setGraphBundle`)                                      | **L1** `@vizij/face-core` `FaceRuntime`                            |
| `runtime-react/src/{updatePolicy,context}.ts`, `utils/{graph,valueConversion,posePaths,poseRuntime,clipPlayback,animationBridge,faceControls}.ts` | **L1** `@vizij/face-core` internals + exports                      |
| `runtime-react/src/types.ts`                                                                                                                      | **L1** shared type vocabulary (re-exported)                        |
| `runtime-react/src/{VizijRuntimeProvider(shell),VizijRuntimeFace}.tsx`, `hooks/*`                                                                 | **L2** `@vizij/runtime-react` (thin adapter) + `@vizij/components` |
| `apps/vizij-authoring/src/utils/runtimeBundle.ts` (`buildRuntimeBaseBundle`, `buildRuntimeGraphBundle`)                                           | **L1** package-builder helpers                                     |
| `apps/vizij-authoring/src/components/app/{Viewer,RuntimeFaceFrame,RuntimeFaceControlsOverlay,ReferenceFaceRuntime}.tsx`                           | **L2** `<FaceViewport>`                                            |
| `apps/vizij-authoring/src/components/{inspector,binding}/*`, `src/rig/*`                                                                          | **L4** `@vizij/editor-rig-inspector`                               |
| `apps/vizij-authoring/src/poseRig/**`, `components/poseRig/*`                                                                                     | **L4** `@vizij/editor-pose`                                        |
| `apps/vizij-authoring/src/components/animation/**`, `state/animationStore.ts`                                                                     | **L4** `@vizij/editor-timeline`                                    |
| `apps/vizij-authoring/src/motiongraph/**`                                                                                                         | **L4** `@vizij/editor-program`                                     |
| `apps/vizij-authoring/src/components/app/StdFeatureSpaces*`, `utils/standardInput*`, `referenceFace/*`                                            | **L4** `@vizij/editor-control-map`                                 |
| `apps/vizij-authoring/src/components/{app/*Audit*,discrepancy/*,app/GraphDiagnosticsPanel}.tsx`                                                   | **L4** `@vizij/editor-checkup`                                     |
| `apps/vizij-authoring/src/components/panels/SpeechPanel.tsx` + speech hooks (dedup vs `@vizij/speech-react`)                                      | **L2** `<SpeechPanel>`                                             |
| `apps/vizij-authoring/src/{App.tsx(shell),layouts,state/workspaceStore}.tsx`                                                                      | **Reference app** VizijStudio                                      |

### 5.4 Dependency graph

```text
        L0 engines (arora, node-graph, animation, orchestrator wasm)
                              │
                              ▼
                   L1  @vizij/face-core ───────────────┐
                    │            │                      │
       ┌────────────┘            │                      │
       ▼                         ▼                      ▼
L2 @vizij/runtime-react   L2 @vizij/components     L3 @vizij/face-embed
   (React adapter)             │   │                 (bundles React)
                               │   └─────────┐
                               ▼             ▼
                     L4 editor-timeline / -program / -pose /
                        -rig-inspector / -control-map / -checkup
                               │
                               ▼
                    Reference app (VizijStudio)  +  vizij-standalone (on L3)
```

Acyclic, one-directional. `@vizij/render`, `@vizij/utils`,
`@vizij/node-graph-authoring`, `@vizij/speech-react` sit alongside as existing
shared deps (reused as-is per foundation §7).

### 5.5 Versioning & publishing strategy

- **Changesets** for the monorepo. Every PR touching a package includes a
  changeset; release automation opens a version PR and publishes on merge.
- **Semver, honestly applied.** L1's stable core (§4) follows strict semver; the
  `@experimental` transport/driver helpers may break in minors while the suite is
  pre-1.0 (the current README already declares "experimental").
- **Fixed version line for the core trio.** `@vizij/face-core`,
  `@vizij/runtime-react`, and `@vizij/render` publish in lockstep (they already
  "stay on the same workspace/release line" per today's README), so a runtime
  change is one coordinated bump. Editors (L4) and the embed (L3) version
  independently against a `face-core` peer range.
- **Peer dependencies.** L2/L4 declare `react`/`react-dom` and `@vizij/face-core`
  as peers (consumer controls the versions); L3 bundles React internally so a
  no-framework host needs nothing. WASM assets follow the existing
  async-wasm/`asset/resource` bundler guidance (current README) and the
  cross-origin-isolation requirement is documented per package.
- **Public API surface tests.** Each package snapshots its `.d.ts` public
  surface in CI; a diff to the stable core fails without an accompanying
  changeset — turning the "large surface is a compat commitment" risk (§4) into a
  guarded, reviewable event.

---

## 6. Development plan

Extract bottom-up so each layer is validated before the next depends on it, then
reassemble the app last. Throughout, `apps/vizij-standalone` and the
`apps/tutorial-*-face` apps act as living consumer tests — they already prove the
single-dependency drop-in pattern.

**Phase 0 — Monorepo & release plumbing (1 sprint).** Add Changesets, per-package
build/test/lint/typecheck, `.d.ts` surface snapshots, and the fixed-line release
config for the core trio. No code moves yet. Exit: an empty `@vizij/face-core`
publishes green.

**Phase 1 — Extract L1 `@vizij/face-core` (2–3 sprints).** Move the controller
logic out of `VizijRuntimeProvider.tsx` into a `FaceRuntime` class; move the
arora helper modules and `types.ts`; fold in `runtimeBundle.ts`. Rewrite
`@vizij/runtime-react` as a thin React adapter that instantiates a `FaceRuntime`,
owns the rAF loop, and re-exposes the same `useVizijRuntime()` context so **no
current consumer changes**. Exit gate: `apps/tutorial-fullscreen-face`,
`apps/tutorial-agent-face`, `apps/vizij-standalone`, and `vizij-authoring` all run
unchanged on the adapter; a new headless Node smoke test drives `new FaceRuntime`
→ `init` → `step` → `writeInput` with no DOM.

**Phase 2 — Extract L2 `@vizij/components` (2 sprints).** Lift `<FaceViewport>`,
`<ControlsPanel>`, `<TransportBar>`, `<ExpressionGrid>`, `<StandardControlMapper>`,
`<CheckupPanel>`, `<SpeechPanel>` from the app's `components/app/*` and dedup the
copied speech services against `@vizij/speech-react`. Stand up Storybook as live
docs. Exit: the tutorials rebuild on L2 components; Storybook covers each.

**Phase 3 — L3 `@vizij/face-embed` (2 sprints).** Build the `<vizij-face>` custom
element mounting the tutorial render path; implement the `writeValues/readValues/
listKeys/invoke/on` API; add the isolated iframe host + postMessage proxy and the
`crossOriginIsolated` auto-detect. Rebuild `apps/vizij-standalone`'s
`useWebSocketSync` as a thin adapter onto the element API to prove vocabulary
parity. Ship a plain-HTML example (§2a.3). Exit: a non-isolated static page drives
a face live via CDN `<script>`.

**Phase 4 — Extract L4 editors (3–4 sprints, parallelizable).** One package at a
time, each behind its own tests: `editor-timeline`, `editor-program` (retire the
vestigial preview `OrchestratorProvider`), `editor-pose`, `editor-rig-inspector`,
`editor-control-map`, `editor-checkup`. Each commits through `setGraphBundle`.
Exit: each editor mounts standalone in Storybook over a sample face.

**Phase 5 — Reassemble the reference app (2 sprints).** Rebuild `vizij-authoring`
as VizijStudio: shell + lifecycle IA + L2/L4 assembly, adding **real undo/redo**
history, the Save/Export split, and SFS export (the §18 fixes). Delete dead code
(`temp.txt`, stale docs). Exit gate: golden-path Playwright E2E green as the
release gate; `App.tsx` is a composition root, not a monolith.

**Migration path from today.** The sequence is non-breaking at every step because
`@vizij/runtime-react` remains the compatibility façade throughout Phases 1–2 —
existing apps keep importing `VizijRuntimeProvider`/`useVizijRuntime`/
`VizijRuntimeFace` while their internals are hollowed out onto L1/L2. `vizij-standalone`
migrates to L3 in Phase 3 (it is already a thin consumer). Only in Phase 5 does the
authoring app itself change shape — and by then every capability it needs already
lives in a validated package. If the org stalls after any phase, the suite is
still shippable: L1+L2 alone is a better `runtime-react`; L3 alone already
delivers the missing drop-in.
