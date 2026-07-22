# Track 2 — Implementation Sketches (R0–R5)

_Follows [`05-SYNTHESIS.md`](./05-SYNTHESIS.md) §6 (the two-track development
plan) and [`03-headless-component-kit.md`](./03-headless-component-kit.md)
(Proposal C, whose architecture Track 2 implements). Where the synthesis says
**what** each phase ships, this document sketches **how** — with concrete
options, a recommendation per decision, and what changed on `main` since the
study was written. Purpose: give the team enough shape to pick approaches and
cut tickets._

Status: proposal for discussion — nothing here is committed work.

> **Update (2026-07-22, after the arora-9 wave began landing):** main took a
> second runtime rewrite while this plan was in motion — the device package is
> now **`@vizij/runtime` 1.0** and a driving provider hands the device to its
> **own ~60 Hz `run()` loop** (the JS loop only pumps: tweens, routing, staged
> flush, change drain); recomposition goes through **`device.loadGraph` in
> place** (VIZ-57), retiring most of the restart-and-carry-the-store dance;
> animation transport/feedback is now fully device-side; and PR #75's
> suspension inference landed. Consequences threaded through below: §3.3's
> step-driver extraction shrinks to pump-loop policy, and §3.4's L0 dependency
> is `@vizij/runtime`. **R1's hollow-out has been re-ported onto the wave**:
> the first extraction pass (against the pre-wave provider) proved the §3.1
> method end-to-end, and Victor's arora-9 delta was then transplanted into the
> extracted `FaceRuntime`/adapter split — so runtime changes and the extraction
> now coexist on this branch. Until the VIZ-53 wave fully settles, expect each
> new runtime change on main to need the same delta-transplant treatment.

---

## 1. What changed on `main` since the synthesis (July 2026)

The synthesis' Track 2 plan predates a burst of runtime work. Four changes
materially alter the plan — all in Track 2's favor:

1. **The orchestrator is gone (PR #66, merged 2026-07-18; supersedes #63).**
   Both "sharp edges" the study tracked are resolved: the vestigial
   `@vizij/orchestrator-react` dependency is deleted, and the motion-graph
   editor's private `OrchestratorProvider` is retired — the editor's preview
   now runs inside the one arora device via `setGraphBundle` + `playProgram`.
   **R1 no longer needs to coordinate with #63, and R3's "retire the preview
   orchestrator" work item is already done.**
2. **Animations tick through the device (also #66).** The JS clip pipeline was
   retired; clips convert and play via `@vizij/animation-module`
   (`DeviceSlot` / `AnimationModuleHost`), stepped inside the device as an
   "animations" graph source. The provider surface R1 extracts is therefore
   _simpler_ than Proposal C §2a.1 described — clip playback is transport
   calls over the device, not a JS evaluation loop.
3. **The observation surface L1 needs already exists.** PRs #66/#68/#70 added
   `subscribeToStep(listener)`, `getStoreSnapshot()`, and
   `subscribeToStoreChanges(listener)` to the runtime context. Proposal C's
   `onValuesChanged()` — designed as a to-be-built headless equivalent of the
   React effect — is now essentially a rename of `subscribeToStoreChanges`.
4. **R0 is half-built.** Changesets is configured (`.changeset/config.json`,
   public access) and a tag-triggered `publish-npm` workflow exists. What's
   missing from R0 is only: the fixed release line for the core trio, public
   API surface snapshots, and per-package CI granularity.

Also relevant, in flight:

- **PR #75 (open)** — suspension inference in the provider's step loops (and
  the closed experiment #76, interval- vs rAF-driven stepping) show that the
  **clock policy is actively evolving**. That argues for extracting the step
  _driver_ as a shared, swappable piece (see §3.3) rather than freezing it
  into either the React adapter or the embed.
- **Track 1 status:** U1 is complete (PR #65); U2/U3 have not started. The
  synthesis' ordering (Track 1 ships first) stands, but §6 below revisits the
  pull-forward option now that #66 removed Track 2's main prerequisite.

Current extraction inventory (`packages/@vizij/runtime-react/src`, post-#66):

| File                                                          | Lines      | Notes                                             |
| ------------------------------------------------------------- | ---------- | ------------------------------------------------- |
| `VizijRuntimeProvider.tsx`                                    | ~3,770     | The monolith R1 hollows out                       |
| `types.ts`                                                    | ~390       | Public vocabulary; moves to L1 and is re-exported |
| `updatePolicy.ts`                                             | ~200       | Pure logic, moves as-is                           |
| `utils/*` (9 files)                                           | ~1,800     | Pure helpers, move as-is                          |
| `engine/{aroraEngine,animationModule,animationModuleHost}.ts` | new in #66 | `DeviceSlot` — already framework-free             |
| `hooks/*`, `VizijRuntimeFace.tsx`, `context.ts`               | small      | Stay in the L2 adapter                            |

The provider already imports only framework-free deps for its logic
(`@vizij/value-json`, `@vizij/utils`, `@vizij/node-graph-authoring`'s
`compileIrGraph`, `@vizij/animation-module`, `@vizij/render` **types**) — the
React imports are confined to the component shell. The extraction remains, as
Proposal C argued, mechanical rather than a rewrite.

---

## 2. R0 — Release plumbing (mostly done; finish, don't rebuild)

**Exists:** Changesets (public access, `main` base), tag-triggered
`publish-npm` workflow, per-package `tsup` builds with `.d.ts` output,
`run-affected.sh` for scoped lint/test/typecheck.

**To add:**

1. **Fixed release line for the core trio.** One-line change:

   ```jsonc
   // .changeset/config.json
   "fixed": [["@vizij/face-core", "@vizij/runtime-react", "@vizij/render"]]
   ```

2. **Public API surface snapshots.** Options:
   - **(a) Commit the built `.d.ts` as a snapshot** — a CI step builds each
     publishable package and diffs `dist/index.d.ts` against a committed
     `api/<pkg>.d.ts`; a mismatch fails unless the PR includes a changeset.
     Zero new tooling; the diff is human-reviewable in the PR.
   - (b) `@microsoft/api-extractor` — richer (release tags like `@stable` /
     `@experimental` become enforceable), but a heavier toolchain and its own
     config per package.
   - **Recommendation: start with (a)**; adopt (b) only when the `@stable` /
     `@experimental` tiering (§3.2) needs machine enforcement, which is a
     post-first-publish concern.
3. **Package hygiene gate:** add `publint` + `arethetypeswrong` to CI for
   publishable packages — cheap insurance for the exports/dual-format setup
   the embed (bundled React, wasm assets) will stress.

Exit: unchanged from the synthesis — an empty `@vizij/face-core` publishes
green through the existing workflow.

---

## 3. R1 — Extract L1 `@vizij/face-core` (the load-bearing phase)

### 3.1 Extraction strategy — three options

**Option A — big-bang port.** Create the package, write the `FaceRuntime`
class there, move `types.ts`/`updatePolicy.ts`/`utils/*`/`engine/*`, and
rewrite the provider as an adapter, all in one PR.

- Pro: cleanest end state per PR count.
- Con: one enormous, hard-to-review diff over the single most load-bearing
  file in the repo; any regression bisects to "the extraction".

**Option B — hollow out in place, then move (strangler).** Recommended.

1. **PR 1:** create `runtime-react/src/core/FaceRuntime.ts` _inside the
   existing package_. Move state from provider refs into class fields
   method-by-method; the provider delegates to a single
   `faceRuntimeRef.current`. Because the provider already keeps all real
   state in refs and effects, each method move is a small, testable diff, and
   the existing 75-test suite plus consumer apps validate every step. No
   consumer changes; no package boundary yet.
2. **PR 2:** cut the rAF/interval loop over to the extracted step driver
   (§3.3) — coordinate with #75, which edits exactly this code.
3. **PR 3:** physically move `src/core/` + `types.ts` + `updatePolicy.ts` +
   `utils/*` + `engine/*` to `packages/@vizij/face-core`; `runtime-react`
   re-exports everything it re-exported before. This diff is rename-only plus
   import paths — trivially reviewable.
4. **PR 4:** headless Node smoke test + README + first publish.

**Option C — expose the context object as "the API", skip the class.** The
context value in `types.ts` already _is_ the ~30-method interface. Freezing it
as the public API without extraction would be cheap — but delivers no headless
runtime, so L3/L4 and non-React hosts stay blocked. Rejected as an end state;
useful only as the interface-naming starting point (see below).

### 3.2 The `FaceRuntime` surface — derive from the context, don't invent

Proposal C §2a.1 sketched the API before #66/#68/#70; the real context surface
has since converged on it. Mapping (context → L1):

| Today's context (`types.ts`)                                   | `FaceRuntime`                                                             | Tier         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------ |
| provider mount / `assetBundle` prop                            | `init()` / `dispose()`                                                    | stable       |
| `setInput(path, value, shape?)`                                | `writeInput(...)` (keep `setInput` alias)                                 | stable       |
| `getValueSnapshot(path)`                                       | `readValue(path)`                                                         | stable       |
| `inputConstraints`                                             | `listInputs()`                                                            | stable       |
| `getStoreSnapshot()`                                           | `getStoreSnapshot()`                                                      | stable       |
| `subscribeToStoreChanges(cb)`                                  | `onValuesChanged(paths \| "*", cb)` — adds path filtering, else identical | stable       |
| `subscribeToStep(cb)`                                          | `onStep(cb)`                                                              | stable       |
| `setGraphBundle(bundle, opts)`                                 | same                                                                      | stable       |
| `step(dt, opts)`                                               | same — pure, host owns the clock                                          | stable       |
| `stagePoseNeutral(force?)`                                     | same                                                                      | stable       |
| `animateValue` / `cancelAnimation`                             | same                                                                      | experimental |
| `play/pause/seek/stop/…Animation`, `…Program`, `get…State`     | same                                                                      | experimental |
| `registerInputDriver(id, factory)`                             | same                                                                      | experimental |
| `setValue` / `setRendererValue` (render-store writes)          | **stays in L2** — it's a React/render concern                             | —            |
| status fields (`loading/ready/errors/outputPaths/controllers`) | `status` getter + `onStatusChange(cb)`                                    | stable       |

Decisions this table encodes (flagging for review):

- **Keep the mechanism names** (`setInput` stays available; `writeInput` is
  the documented name) so PR 3 above is a pure move — renames land as aliases,
  deprecations come later.
- **The render-store write path does not move.** L1 emits value changes;
  applying them to the Three/zustand render store is `@vizij/render` + L2
  territory. This keeps L1 truly DOM-free.
- **Tiering answers synthesis open question #5:** the stable core is the
  seven-verb set the synthesis named plus the observation trio that now
  exists; everything transport/driver-shaped ships `@experimental`.

### 3.3 Clock ownership — extract the pump driver as its own piece

Proposal C put the rAF loop in the L2 adapter. The picture has since changed
twice: #75 added suspension inference (`dt = 0` re-baselining across host
suspensions), and the arora-9 wave moved the **engine clock into the device
itself** — a driving host hands the device to its own `run()` loop, and the
JS loop that remains is a _pump_ (tweens, animation routing, staged-input
flush, change drain), not the engine stepper.

**Sketch (revised):** ship `createPumpDriver(runtime, opts)` in face-core —
owns rAF/interval selection, visibility handling, and the suspension
inference for the pump; calls the runtime's per-frame pump. Both L2 (React)
and L3 (custom element) mount one in their lifecycle hooks. Manual stepping
(`step(dt, { forceRuntime })`) stays available for non-driving/headless
hosts, so tests can still drive time by hand.

### 3.4 Dependencies and one type-home decision

`@vizij/face-core` deps: L0 wasm engines (`@vizij/runtime` — the device
package, renamed from `@vizij/arora-web-wasm` in the arora-9 wave),
`@vizij/animation-module`, `@vizij/value-json`, `@vizij/utils`,
`@vizij/node-graph-authoring` (`compileIrGraph`). Plus, today,
`@vizij/render` — **types only**
(`World`, `VizijBundleExtension`, the `VIZIJ_bundle` schema in
`render/src/types/vizij-bundle.ts`).

A types-only dependency from L1 up to a rendering package inverts the layer
rule. Options:

- **(a) Move the Face Package schema** (`vizij-bundle.ts`, plus the small
  shared value types) into face-core (or a tiny `@vizij/face-package-types`);
  render imports it back. Honest layering; render's public API re-exports keep
  its consumers unbroken. **Recommended.**
- (b) Keep the dep, marked types-only. Cheaper now; permanently weird, and it
  drags `three` peer metadata near L1's install graph.

Also fold in `apps/vizij-authoring/src/utils/runtimeBundle.ts`
(`buildRuntimeBaseBundle` / `buildRuntimeGraphBundle`) as face-core's Face
Package builder helpers — they are already app-independent.

### 3.5 Exit gates and one flagged risk

Unchanged from the synthesis: all four consumer apps + both tutorials run
unmodified on the adapter; plus a **headless smoke test** (`new FaceRuntime` →
`init` → `step` → `writeInput` → `onValuesChanged`, no DOM).

**Flagged risk — wasm-in-Node: RESOLVED (spiked 2026-07-20).** Both modules
run headless in plain Node 20 with no DOM and no bundler: `@vizij/arora-web-wasm`
`init()` completes in ~50ms, `startDevice` accepts a real input-node spec, and
`setValue → step(16) → drainChanges` round-trips values (golden `arora/dt`
/ `arora/time` keys present); `@vizij/animation-module`'s
`loadAnimationModule()` resolves its header + wasm bytes. The
`@vizij/wasm-loader` Node entrypoint (file-URL → `fs/promises` read) is what
makes this work. The spike is kept as a runnable gate:
`pnpm --filter @vizij/runtime-react smoke:node`
(`packages/@vizij/runtime-react/scripts/headless-node-smoke.mjs`); R1 PR-4
extends it to drive `FaceRuntime` directly and it moves to face-core with the
package. The Playwright fallback gate is not needed.

---

## 4. R2 + R3 — Components and editors (sketch level)

These phases depend on U2/U3 shaping the surfaces first ("build Track 1
extraction-ready"), so sketches stay coarser; detail them when U3 starts.

**R2 `@vizij/components`.** Extraction order by coupling (lowest first):
`<FaceViewport>` (wraps `VizijRuntimeFace` + frame/overlay components) →
`<TransportBar>` → `<ControlsPanel>` (over `listInputs()`) →
`<ExpressionGrid>` → `<CheckupPanel>` (U1 built this component-shaped
already) → `<SpeechPanel>` (includes the speech-service dedup against
`@vizij/speech-react`). Styling: headless-by-default via data-attributes +
`className` passthrough, with a `@vizij/components/styled` entry carrying the
app's Tailwind look — pick one pattern with the first component and hold it.
Storybook (or the lighter Ladle) stands up here as the living docs surface.

**R3 `@vizij/editor-*`.** Order: `editor-timeline` (self-contained store) →
`editor-program` (ReactFlow isolated; the device-preview migration is already
done per #66) → `editor-pose` → `editor-control-map` → `editor-checkup` →
`editor-rig-inspector` last (most entangled with app stores). Two seams to
design once, in `editor-shared`:

- **History:** PR #65's undo/redo engine snapshots the four document stores
  from the app. When stores move into editor packages, each editor exports a
  `HistoryScope` (`getSnapshot()` / `restore(snapshot)` / subscribe) and the
  app-owned history engine composes them — the engine already works this way
  internally, so this is formalizing, not rebuilding.
- **Commit path:** every editor's "apply" is `setGraphBundle({...}, {tier:
"graphs"})` against the host runtime — no editor touches the device.

---

## 5. R4 — `@vizij/face-embed` (the headline deliverable)

### 5.1 Element implementation

Custom element wrapping the same React tree the tutorials mount
(`createRoot` + provider + `VizijRuntimeFace`), React bundled internally (no
peer). The alternative — a React-free viewer — would fork `@vizij/render` and
is rejected. Cost: bundle size (~React + three + wasm); acceptable for a
`<script type="module">` embed, and three dominates anyway.

### 5.2 API — now a thin mapping, not new design

The verbs map 1:1 onto surfaces that exist today (post-#66/#68/#70):

| Element API                                | Backing L1 call                             |
| ------------------------------------------ | ------------------------------------------- |
| `writeValues(map)` / `writeValue(path, v)` | `writeInput` per entry                      |
| `readValues(paths)`                        | `readValue` per path                        |
| `listKeys()`                               | `getStoreSnapshot()` keys                   |
| `listInputs()`                             | `listInputs()`                              |
| `invoke(method, args)`                     | transport methods + `stagePoseNeutral`      |
| `on("valuesChanged", cb)`                  | `onValuesChanged("*", cb)`                  |
| `on("ready" \| "error", cb)`               | `onStatusChange`                            |
| `runtime` (escape hatch)                   | the `FaceRuntime` itself (direct mode only) |

Attributes per Proposal C §2a.3 (`src`, `namespace`, `autoplay`, `program`,
`background`, `autostart`, `mode`).

### 5.3 Delivery modes — the real work is the iframe host

- **Direct mode** requires `crossOriginIsolated` (COOP/COEP — every in-repo
  app already sets these headers in its Vite config). Auto-detect; allow
  `mode="direct|iframe"` override.
- **Iframe mode** needs a **hosted, already-isolated player page**. Sketch:
  a new `apps/face-embed-host` — a static page that mounts the element in
  direct mode and speaks a postMessage RPC (request-id + method + args;
  responses and `valuesChanged` batches pushed back). Constraints to
  document: JSON-serializable args/returns only; `runtime` escape hatch
  unavailable; one extra hop of latency. **Open question for the team:**
  where this page is deployed and whether `cdn.vizij.ai` (Proposal C's
  strawman) exists — this is an infra decision, not a code one, and it gates
  the "zero-setup embed" promise for non-isolated hosts.

### 5.4 Proof obligations

1. Plain-HTML example page (no build step) driving a face via the CDN script.
2. `apps/vizij-standalone`'s `useWebSocketSync` rebuilt as a thin adapter
   over the element API — the vocabulary-parity proof. Note the store bridge
   became change-driven and bidirectional while the study was in review
   (#68/#70/#72), which makes this adapter _more_ natural: `values_changed`
   push already mirrors `subscribeToStoreChanges` semantics.

---

## 6. Sequencing, parallelism, and the pull-forward decision

Updated dependency picture (R-phases only):

```text
R0 (½ sprint, mostly exists)
 └─ R1 face-core (2–3 sprints)  ← wait for the VIZ-53 arora-9 wave to settle
     ├─ R4 face-embed (2 sprints)          — needs only R1
     ├─ R2 components (2 sprints)          — wants U3 shapes
     │   └─ R3 editors (3–4 sprints, per-editor parallel)
     └────────└─ R5 cleanup (1–2 sprints)
```

**The pull-forward question, revisited.** The synthesis allowed "R1 + R4 as a
parallel spike" if an external consumer needs the embed sooner. Two facts
have strengthened that option: #66 removed R1's biggest prerequisite, and
PRs #68/#70 built the observation surface R1/R4 needed. R1+R4 is now a
self-contained ~4-sprint lane that never touches the files U2/U3 edit
(`App.tsx`, panels, stores) — the conflict argument for strict sequencing has
mostly dissolved. **Recommendation:** keep Track 1 as the priority lane, but
treat R0+R1 (and optionally R4) as a parallel lane the moment there is a
second pair of hands or a concrete embed consumer; otherwise start R0's
remaining items (they're one-PR sized) immediately and begin R1 after U2.

**Ticket-cutting starting point** (suggested epics): R0-finish (fixed line,
API snapshots, publint) · R1-a hollow-out · R1-b step driver (after #75) ·
R1-c package move · R1-d headless smoke + publish · R4-a element direct mode ·
R4-b iframe host + RPC · R4-c standalone adapter + HTML example · R2/R3 per
component/editor once U3 lands.

## 7. Open questions (decisions needed before tickets)

1. **Face Package type home** — move `vizij-bundle.ts` into face-core vs. a
   types-only render dep (§3.4; recommendation: move).
2. **Wasm-in-Node** — does the headless smoke test run in Node, or is the
   gate a browser-context test? (One-day spike, §3.5.)
3. **Embed hosting** — where does the iframe host page / CDN script live
   (§5.3)? Pure infra, but it gates R4-b.
4. **Storybook vs Ladle** for R2's living docs.
5. **Pull-forward** — run R0+R1(+R4) as a parallel lane now, or hold to
   strict Track 1 → Track 2 sequencing (§6)?
