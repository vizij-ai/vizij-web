# GLB Animation Round-Trip Plan

Date: 2026-09-02
Owner: TBD
Status: proposed
Scope: `apps/vizij-authoring`, `packages/@vizij/render`

## Objective

Make native glTF animation a first-class, bidirectional interchange surface:

1. **Import** — load animations embedded in a GLB as native glTF `animations`
   (i.e. _not_ in the `VIZIJ_bundle` extension) and convert them to Vizij
   animation clips wherever they can be resolved to Vizij channels.
2. **Bake** — write Vizij animation clips back out as native glTF animation
   channels wherever the target is expressible in glTF.
3. **Survive external editing** — a user opening the GLB in Blender, changing
   things, and bringing it back must not silently lose or corrupt animation
   work.

The third requirement is the hard one and drives the design.

## The Identity Finding (read this first)

Animation bindings in Vizij are **name-derived, not id-derived**. This is the
single most important fact for sustainability, and it is good news.

An `AnimationTrackIR` binds via `variableId` + `channel`, where:

```text
channel     = /propsrig/{normalizeStandardRigGroup(elementName)}/{featureKey}/{component}
variableId  = deriveStandardRigInputIdFromPath(channel)   // path with "/" -> "_"
```

(`src/rig/autoInputs.ts`, `deriveStandardRigInputIdFromPath` in
`@vizij/utils/rig/standard-inputs.ts`.)

Consequences:

1. Animatable ids are `createBrowserSafeId()` — random, regenerated on every
   non-`RobotData` import. **This does not break animation bindings**, because
   no track references an animatable id.
2. What _does_ break bindings is a change to the triple
   **(element name, feature key, component)**: renaming a mesh, renaming a
   morph target, deleting a mesh, or a name collision shifting an
   `ensureUniquePath` `_2` suffix.
3. Therefore the contract to defend is exactly that triple. Everything in the
   sustainability section below follows from stabilizing and monitoring it.

Related, already-working behavior worth not breaking: both authoring load call
sites pass `aggressiveImport = true` (`src/App.tsx`), so
`useRobotData = hasRobotData`. A GLB that still carries the `RobotData`
extension restores ids _and_ names; a Blender-processed GLB that lost it falls
through to `importScene`, which regenerates the rig from geometry with fresh
random ids but identical names. Geometry round-trip through Blender already
works. Animation is the missing half.

## Current-State Facts (verified)

1. **Import** — `extractVizijAnimations()` already parses native glTF animation channels and
   `loadGLTF*` already returns them on `LoadedVizijAsset.animations`
   (`packages/@vizij/render/src/functions/gltf-loading/extract-animations.ts`,
   `load-gltf.ts`).
2. **Import** — `useVizijAssetLoader` destructures `{ world, animatables, bundle, scene }`
   and **silently discards `animations`**. Nothing in authoring reads it.
3. **Import** — `extractVizijAnimations()` early-exits on
   `if (robotNodeIndex.size === 0) return animations`, so a GLB without the
   `RobotData` extension — i.e. anything Blender touched — yields nothing.
4. `@vizij/runtime-react`'s `convertExtractedAnimations` _does_ consume the
   payload, keyed on `componentId` / `componentId:index`. So such a clip plays
   in `demo-vizij-player` while staying invisible in authoring, and it uses a
   different channel convention than bundle clips (which use rig input paths).

5. **Export** — `exportScene()` already accepts `animations?: AnimationClip[]` and forwards
   it to `GLTFExporter` with `includeCustomExtensions: true`
   (`packages/@vizij/render/src/functions/export.ts`). **Authoring never passes
   it**; the call site is `useVizijExport.ts` around line 1070.
6. **Export** — `RobotData` is regenerated from live store state on every renderable
   (`createStoredRenderable` in `renderables/{shape,group,ellipse,rectangle}.tsx`
   writing `userData.gltfExtensions.RobotData`), so export always emits current,
   authoritative identity — it is not passed through from the loaded file.
7. **Export** — the export body is a mounted R3F `Group`, not a `Scene`, so `exportScene`
   does `sourceRoot.clone(true)`. Clone changes uuids and preserves names.

## GLTFExporter constraints (all must be respected when baking)

These were read out of `three-stdlib/exporters/GLTFExporter.js` and each one
rules out an otherwise-obvious implementation:

1. `PATH_PROPERTIES` maps only `position -> translation`,
   `quaternion -> rotation`, `scale -> scale`,
   `morphTargetInfluences -> weights`. **Euler `rotation` is not supported.**
   Vizij's rotation animatable is `euler`, so baking rotation requires building
   `QuaternionKeyframeTrack`s.
2. **No per-component channels.** `outputItemSize = values.length / times.length`
   must be 3 (translation/scale) or 4 (quaternion). Vizij's per-component
   scalar tracks must be **recombined into vector tracks**, with un-animated
   components filled from the node's current value. The fill policy must be
   explicit, not incidental.
3. Morph tracks must be named `<node>.morphTargetInfluences[<morphName>]` —
   by **name**. `mergeMorphTargetTracks` does
   `morphTargetDictionary[propertyIndex]` and **throws**
   `"Morph target name not found"` on a miss. Note the asymmetry: the importer
   emits indices, the exporter demands names.
4. `mergeMorphTargetTracks` **throws** on CUBICSPLINE morph tracks and silently
   downgrades other non-linear modes to LINEAR with a console warning. Cubic
   morph curves must be resampled to linear before baking.
5. `PropertyBinding.findNode(root, nodeName)` resolves by **name**; on a miss
   `processAnimation` logs a warning and `return null`s, so the **entire clip
   disappears silently**. Every track binding must be pre-validated.
6. Because `exportScene` clones the root (fact 7 above), **uuid-bound tracks
   break and name-bound tracks survive**. Clips must be name-bound.

## What can and cannot round-trip

This is the honest scope of "where possible", and it should be stated in the UI
rather than discovered by users.

| Vizij channel                                                                                                                       | Bakes to glTF? | Notes                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------- |
| propsrig `translation` x/y/z                                                                                                        | yes            | recombine to `translation`, stride 3        |
| propsrig `scale` x/y/z                                                                                                              | yes            | recombine to `scale`, stride 3              |
| propsrig `rotation` x/y/z (euler)                                                                                                   | yes, converted | euler -> quaternion, stride 4               |
| propsrig morph/blendshape                                                                                                           | yes            | must emit morph **name**; linear only       |
| propsrig material features (`color`, `opacity`, `roughness`, `metalness`, `emissive`, `emissiveIntensity`, `shininess`, `specular`) | **no**         | core glTF animation has no material channel |
| abstract rig inputs, pose weights, group/stage outputs                                                                              | **no**         | graph-level signals, not node properties    |

So the baked glTF animation covers only the node-transform + morph subset.

**Therefore: the Vizij bundle stays authoritative; baked glTF animation is a
derived, lossy, interoperable projection.** Every design decision below follows
from that asymmetry. Baking is for interoperability (Blender, viewers, other
engines), never for storage.

## Architecture

```text
IMPORT
  .glb --> GLTFLoader --> LoadedVizijAsset.animations   (already produced, currently dropped)
                              |
                              v
                    GltfAnimationDocument     source-neutral curve set + provenance
                              |
                              v
                    ChannelResolver           identity mode | name mode
                              |
                              v
                    AnimationClipIR[] --> AuthoredAnimationTarget[]

BAKE
  AnimationClipIR[]  (semantic: rig inputs, pose weights)
                              |
                              v
                    GraphSampler              stageInput + setTime + evalAll per frame
                              |                -> one value curve per ANIMATABLE
                              v
                    ClipBaker                 decimate, recombine, euler->quat, morph names
                              |
                              v
                    THREE.AnimationClip[] + BakeReport
                              |
                              v
                    exportScene({ animations })   (existing, unused option)
```

### `ChannelResolver` — two modes, no guessing in mode 1

**Identity mode** (GLB carries `RobotData`): glTF node index -> `RobotData`
feature -> `value.id` (componentId) -> the managed input whose
`metadata.componentId` matches. An exact lookup, not a match.

**Name mode** (no `RobotData` — the Blender case): glTF node name + channel
path -> `(elementName, featureKey, component)` -> propsrig path -> input id,
using the same normalization the rig generator uses
(`normalizeStandardRigGroup`). For `weights`, resolve the channel's target
index to a morph name via the mesh's `morphTargetDictionary`, then through the
**same** `sanitizeMorphKey()` that `import-geometry.ts` uses, or the keys will
not line up.

Both modes emit per-curve decisions with a reason, plus explicit
`unresolved[]`. Nothing is dropped silently (`ARCHITECTURE.md` §Diagnostics 3).

### Value handling on import

1. `translation` / `scale`: split stride-3 into x/y/z scalar tracks.
2. `rotation`: quaternion -> euler `XYZ` radians, because the target animatable
   is `AnimatableEuler`. Requires sign-continuity (negate `q` when
   `dot(q_prev, q) < 0`) and per-channel unwrapping so consecutive keys differ
   by `< π` — otherwise the timeline shows a 360° snap the source did not have.
3. `weights`: stride equals the mesh's morph count; slice the per-target column
   into one scalar track per morph.
4. `CUBICSPLINE`: **preserve** tangents as `interpolation: "cubic"` with
   `inTangent`/`outTangent`. `AnimationKeyframeIR` already carries these and
   `evaluateAnimationTrackAtTime` already implements Hermite evaluation; the
   runtime's `hasTripletTangents` path confirms the triplet-stride layout.
5. **No unit or axis conversion.** Same file, same node, same frame: the curve
   values already sit in the frame the animatable defaults were read from.

## Sustainability model

### Principle

The bundle is the source of truth. A baked clip is a projection. On import, a
baked clip must never overwrite its own bundle original.

### Provenance stamping

Every baked clip carries, in the glTF animation's `extras` **and** in its name:

```text
extras.vizij = {
  bakedFrom: "<authored clip id>",
  bakeHash: "<hash of the source AnimationClipIR>",
  bakedAt: "<iso timestamp>",
  channelManifestHash: "<hash of the manifest below>",
  lossy: ["morph-cubic-to-linear", "material-channels-dropped", ...]
}
```

**`extras`, not a custom extension** — deliberately. Blender's glTF importer
maps node/animation `extras` into custom properties and writes them back out,
while unknown _extensions_ are dropped. If provenance lived only in
`VIZIJ_bundle`, every Blender pass would look like a brand-new external
animation and silently duplicate clips on each round trip. This one detail is
the difference between a workflow that converges and one that accumulates
garbage.

### Import triage: three cases

| Case | Condition                                                             | Behavior                                                                                                                     |
| ---- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1    | Baked clip whose `bakedFrom` matches a bundle clip, `bakeHash` agrees | Ignore the baked copy. Bundle wins. No duplicate, no prompt.                                                                 |
| 2    | Baked clip matches a bundle clip but `bakeHash` differs               | The GLB was edited externally. Offer: keep Vizij's, adopt the external version, or fork to a new clip. **Never auto-merge.** |
| 3    | Native clip with no bundle counterpart                                | Genuinely external. Import as a new clip through name-mode resolution.                                                       |

### Channel manifest and drift detection

At export, persist a manifest in the bundle: for each channel, the propsrig
path plus the `(elementName, featureKey, component, morphName)` it was derived
from, and a light geometry fingerprint per element (morph-name set + vertex
count).

At import, diff the manifest against the rebuilt catalog and classify:

| Class           | Signal                                                               | Proposed resolution                                                                                                                                     |
| --------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unchanged       | path present, fingerprint matches                                    | bind silently                                                                                                                                           |
| renamed         | manifest path absent; an unmanifested element matches on fingerprint | offer remap (high confidence)                                                                                                                           |
| deleted         | path absent, no fingerprint match                                    | orphan the track (see below)                                                                                                                            |
| added           | element present, no manifest entry                                   | new inputs, no tracks — informational                                                                                                                   |
| collision shift | `_2`-style suffix migrated                                           | auto-remap **with a warning**, since `ensureUniquePath` runs over the deterministically sorted `buildFeatureEntries` output and the shift is detectable |

Surface all of this through the **existing** discrepancy machinery rather than a
parallel UI: `GraphDiffEntry` / `GraphDiffKind` (`missing | unexpected |
mismatch`) / `MissingInputResolution` in `src/types/discrepancy.ts` already
model precisely this shape. Add an `animation` `GraphDiffCategory` and extend
`DiscrepancyWizard`.

### Orphan tracks: never destroy keyframe work

A track whose channel disappeared is **not** dropped. It is retained in the
clip as `detached`, carrying its last-known channel and manifest entry,
excluded from compile and export-validation, and re-attachable from the
inspector. A rename in Blender must cost a remap click, not hours of keyframing.

This needs a small `AnimationTrackIR` addition (`detached?: true` plus
`lastKnownChannel`), which `compileAnimationClipIr` filters out — it already
drops tracks with empty channels, so the seam exists.

### Determinism

1. `import(bake(x)) === x` for the bakeable subset, modulo declared lossiness.
   Golden-file test.
2. Baking twice from unchanged state produces identical bytes (stable ordering,
   quantized times/values) so GLB diffs stay reviewable.
3. Importing the same GLB twice produces identical IR and no duplicate clips.

## UI / UX

1. **Import**: after load, if native animations were found, a non-blocking
   summary appears — "3 embedded animations found, 2 resolved, 1 needs
   mapping" — opening the same review surface as other imports. Case-1 clips
   are not mentioned; they are noise.
2. **Bake on export**: a checkbox in `ExportDialog`, default **on**, with a
   preflight showing exactly what will and will not bake, using the
   round-trip table above. Material and pose channels are listed as "bundle
   only" so the limitation is visible before writing, per `UI_DESIGN.md`
   §Import/Export UX Contract item 2.
3. **Drift review**: reuse `DiscrepancyWizard` with the new `animation`
   category; per-entry remap/ignore/orphan choices.
4. **Detached-track affordance**: visibly marked in the timeline with a
   "reattach" action, never hidden.

## Testing

Unit:

1. Quaternion <-> euler with sign flips, ±180°, gimbal near ±90°, and unwrap;
   assert per-key round-trip within tolerance.
2. Vector recombination: partial component coverage (only `x` animated) fills
   the rest from node state; assert stride 3/4 exactly.
3. Morph name emission: assert names, not indices, and that a missing name is
   caught by pre-validation rather than reaching `mergeMorphTargetTracks` and
   throwing.
4. `weights` stride slicing across multi-morph meshes.
5. CUBICSPLINE preserved on import; cubic morph resampled to linear on bake
   with a `lossy` marker recorded.
6. Manifest drift classification for each row of the drift table, including the
   `_2` collision shift.
7. Triage cases 1–3, including the Blender-`extras` survival path.
8. Determinism: double bake byte-identical; double import no duplicates.

Reference corpus (primary): the three `*_Latest_Blender_Export.glb` files in
`public/assets`, paired with their `*_Current*.glb` counterparts as target
faces. These drive a committed **resolution-rate test** asserting exact counts:

| Face   | expected resolved | expected unresolved |
| ------ | ----------------- | ------------------- |
| Quori  | 37                | 0                   |
| Hugo   | 31                | 0                   |
| Toasty | 8                 | 0                   |

Resolved paths are additionally compared against **committed golden literals**
(`__tests__/blenderCorpusGolden.ts`), not against a catalog rebuilt with the
same helpers. Mutation testing during phase 0 proved this necessary: with a
symmetric comparison, breaking `propsRigElementSegment` (so `l_tlid` became
`ltlid`) still passed, because both sides of the comparison moved together. A
golden comparison fails, naming every binding that would break.

One related finding, recorded so nobody "fixes" it later: morph-slug casing is
**not** load-bearing for path resolution, because keys pass through
`normalizeStandardRigGroup` again when the path is built, which lowercases
independently. Removing `toLowerCase` from `sanitizeMorphKey` fails the unit
tests and cannot fail the corpus test. Casing still matters as the stored
feature key on the renderable and in exported `RobotData`, so the rule is
pinned by unit test rather than by the corpus.

Corpus-derived grouping assertions:

1. Quori's 13 animations reassemble into **one** clip spanning `0..5s`, with
   `Face_Tran_CAction` keys at `0..0.708` and `L_Eye_GeoAction.002` keys at
   `2.375..5.0` — relative timing preserved, no per-animation shift.
2. Toasty's 3 animations reassemble into one clip with keys at
   `10.542..12.833` and `21.542..21.958`, preserving the ~9s gap.
3. Re-importing the same file twice yields identical IR and no duplicate clips.

Synthetic `.gltf` + JSON fixtures should be written **only** for cases the
corpus lacks: a `CUBICSPLINE` sampler (the corpus is entirely `LINEAR`), a
`RobotData`-present identity-mode file, and a name-drift case for the
orphan/remap path.

One genuinely new fixture is still required: a real Vizij -> Blender -> Vizij
pass, to settle whether `extras` provenance survives. **The corpus cannot
answer this** — its `RobotData` lived in `extensions` (which Blender drops), so
those files never carried node `extras` to preserve. Until it exists, treat
`extras` survival as an assumption and ensure triage degrades safely if it is
false (worst case: case 3, one extra clip — not corruption).

Playwright: import a GLB with native animations, assert clips appear and play;
export with baking on, re-import the result, assert no duplicate clips and
identical track counts.

## Risks

| Risk                                                                                   | Mitigation                                                                                                                       |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Silent whole-clip loss from a single unresolvable track binding (constraint 5)         | pre-validate every binding; never hand `GLTFExporter` an unvalidated clip                                                        |
| `mergeMorphTargetTracks` throwing mid-export and failing the whole GLB                 | resolve and validate morph names up front; resample cubic morphs before baking                                                   |
| Blender dropping provenance and duplicating clips every pass                           | provenance in `extras`, plus the real Blender round-trip fixture as a regression guard                                           |
| Renames silently destroying keyframe work                                              | orphan/detach rather than drop; remap flow                                                                                       |
| Corpus is entirely `LINEAR`, so CUBICSPLINE handling ships unexercised by real data    | cover with a synthetic `.gltf` fixture; treat cubic support as unvalidated against real Blender output until such a file appears |
| Corpus is entirely per-Action mode, so the other three Animation Modes ship unverified | they reduce to the trivial 1:1 mapping; mark best-effort and add a fixture if a real file surfaces                               |
| Baked clips being mistaken for source of truth                                         | one-directional precedence rule (bundle wins), enforced in triage case 1                                                         |
| Two channel conventions (`componentId` vs rig path) drifting further apart             | resolve both to rig input paths in `ChannelResolver`; unify as part of phase 2                                                   |

## Phasing

| Phase | Deliverable                                                                                                                                                                                                                                                                                                                                                            | Notes                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | **done** — corpus locked; `src/animationImport/` resolver + golden corpus test (33 tests); shared `sanitizeMorphKey` / `deriveMorphFeatureKeys` extracted to `@vizij/render`; shared `buildPropsRigInputPath` exported from `autoInputs`                                                                                                                               | mutation-tested: a path-rule change fails the corpus test                                                                                                                   |
| 1     | Channel manifest + provenance contract; `detached` track support in IR and compiler                                                                                                                                                                                                                                                                                    | small shared foundation both directions depend on                                                                                                                           |
| 2     | Import: stop discarding `LoadedVizijAsset.animations`; drop the `RobotData` early exit; `ChannelResolver` identity + **exact** name mode (no fuzzy tiers yet); `weights` -> `targetNames` -> `sanitizeMorphKey`; CUBICSPLINE preservation; per-Action reassembly onto one shared timeline                                                                              | unifies the `componentId` vs rig-path convention; validated against the corpus ; input range fitting (widen targets to admit imported curves, reported per input)           |
| 3     | **done** — `src/animationBake/`: `bakeClipToTrackSpecs` + `BakeReport` + `toThreeAnimationClip` with binding pre-validation; graph sampler (`sampleClipThroughGraph` behind a `GraphEvaluator` port, device adapter, measured hop cost); RDP decimation; cubic-aware track sampling; `detectBakeHazards`; `exportScene({ animations })` wired through `useVizijExport` | 53 tests, incl. real-wasm device tests and a wiring test; mutation-checked on units, constant-drop, tick-abort, RDP tolerance, endpoints, tangents, and the export argument |
| 4     | Triage cases 1–3 + dedupe on import                                                                                                                                                                                                                                                                                                                                    | makes repeat round-trips converge                                                                                                                                           |
| 5     | Drift detection + `DiscrepancyWizard` `animation` category + reattach UI                                                                                                                                                                                                                                                                                               | the external-edit story                                                                                                                                                     |
| 6     | Corpus regression suite (resolution rate must stay 100%, no duplicate clips across a bake->import cycle), e2e, docs (`ARCHITECTURE.md` boundary section, `UI_DESIGN.md` contract, export guidance, `BACKLOG`/`ROADMAP`/`TRACKER`)                                                                                                                                      | one _new_ round-trip fixture is still needed to settle `extras` survival — the corpus cannot answer it                                                                      |

Phases 0–2 are independently shippable: they turn an already-parsed,
already-discarded payload into editable clips.

## Decisions

1. **Bake by default on GLB export** — confirmed 2026-09-02. Interop is the
   point; the preflight makes the lossy set visible before writing.
2. **Bake all authored clips** — confirmed 2026-09-02. No per-clip opt-in;
   Blender users get the full set.
3. **Material channels: option A — accept the gap** — confirmed 2026-09-02.
   The bundle keeps the curves losslessly; the baked GLB carries transform +
   morph only. The export preflight must **name** the dropped channels, not
   just count them. Revisit `KHR_animation_pointer` only if a concrete
   external-consumer workflow needs animated color, as its own scoped work.

## Measured baseline (from `public/assets`, 2026-09-02)

Counts of _animatable_ (drivable) channels declared in `RobotData`:

| Asset                              | transform | morph | material                      | native glTF anims |
| ---------------------------------- | --------- | ----- | ----------------------------- | ----------------- |
| `Hugo_Current_Extended.glb`        | 63        | 17    | 38 (`color` 19, `opacity` 19) | 0                 |
| `Quori_Current_Extended.glb`       | 54        | 29    | 30 (`color` 15, `opacity` 15) | 0                 |
| `Toasty_Current.glb`               | 147       | 67    | 66 (`color` 33, `opacity` 33) | 0                 |
| `Quori_Latest_Blender_Export.glb`  | 0         | 0     | 0 (no `RobotData`)            | 13                |
| `Toasty_Latest_Blender_Export.glb` | 0         | 0     | 0 (no `RobotData`)            | 3                 |
| `Hugo_Latest_Blender_Export.glb`   | 0         | 0     | 0 (no `RobotData`)            | 11                |

Two observations that shaped the design:

1. Material channels are **~25-30% of declared animatable channels**, and only
   ever `color` and `opacity` — never `roughness`, `metalness`, `emissive`,
   `emissiveIntensity`, `shininess`, or `specular`, despite `import-mesh.ts`
   supporting all of them.
2. The `*_Latest_Blender_Export.glb` files are the exact target case: **zero
   `RobotData`, 3-13 native glTF animations**. They are already in the repo and
   should be the phase-2 fixtures.

## What authored clips actually contain (and why baking is harder than it looks)

Inspecting the bundle clips in those assets:

```text
Hugo_Current_Extended   clip "authoring.timeline.clip.1"  tracks=1   channel="lids_blink"
Quori_Current_Extended  clip "authoring.timeline.clip.1"  tracks=4   channel="gaze/left_right", "mouth/..."
Quori_Current_Extended  clip "authoring.timeline.main"    tracks=5   channel="poses/pose_d_concerned_d.weight"
```

**None of these are `/propsrig/...` node channels.** Real authored clips drive
_abstract rig inputs_ and _pose weights_. The path from those to a node
transform runs through the rig and pose graphs at runtime, which is consistent
with `UI_DESIGN.md` §Props Rig Visibility Contract steering authors away from
low-level rows.

glTF cannot express "this input feeds a graph that computes node transforms."
So baking is **not** a track-reformatting problem, as an earlier draft of this
plan assumed. Baking must **evaluate the rig + pose graph over time**:

```text
for t in 0 .. duration step 1/fps:
    stageInput(channel, clipValueAt(t))   for every track in the clip
    setTime(t)
    evalAll()
    record every animatable output value
then: decimate per channel, recombine to vector tracks, emit glTF
```

`@vizij/node-graph` exposes exactly the primitives needed —
`stageInput(path, value)`, `setTime(t)`, `evalAll()` — so headless
deterministic sampling is feasible without a renderer. This is real baking in
the DCC sense.

Implications:

1. The bakeable set is defined by **which animatables the graph writes**, not
   by which channels the clip contains. A one-track clip on `lids_blink` can
   bake to dozens of node channels.
2. Sample rate becomes a user-facing setting with a real fidelity/size
   tradeoff; decimation (already specified) runs after sampling.
3. Baking is only correct if graph evaluation is deterministic and free of
   time-dependent state. Nodes with memory (slew, filters, integrators) make
   the baked result depend on step size. **These must be detected and reported**
   — a slew-limited channel baked at 30 fps and replayed at 60 fps will not
   match. Treat "clip contains stateful graph nodes" as a bake warning.
4. Pose-weight and abstract-input tracks therefore _do_ reach the GLB, as node
   motion. The round-trip table below describes the **final animatable**, not
   the authored channel.

## Clip grouping: use Blender's own grouping, not ours

Decision: **material channels take option A** (accept the gap) — confirmed
2026-09-02. Grouping, below, is the remaining design question.

### What the sample files actually contain

`asset.generator` is `Khronos glTF Blender I/O v4.5.49` (Quori, Hugo) and
`v4.2.69` (Toasty). Every one of these files was exported in Blender's
**default per-Action animation mode**, and the evidence is unambiguous:

1. Animation names follow Blender's auto-action pattern
   `<datablockName>Action<.NNN>` — `Face_Tran_CAction`, `LTLid_CAction.002`,
   `L_Highlight_Scale_C.001Action.005`. Morph actions are named after the
   _shape-key datablock_, not the object, which is why `Key.001Action.001`
   targets `LBLid` and `Key.001Action.002` targets `RBLid`.
2. Channels per animation are 1-2, i.e. one object's worth.
3. **Time ranges are disjoint sub-ranges of one shared timeline**, not clips
   that each start at zero:

```text
Quori_Latest_Blender_Export.glb  (13 animations, shared 0..5s timeline)
  Face_Tran_CAction                    0.000 .. 0.708
  L_Highlight_Scale_C.001Action.001    0.000 .. 1.667
  L_Highlight_Scale_CAction.005        0.000 .. 1.667
  Key.001Action.001                    0.708 .. 1.667
  LBLid_CAction                        0.708 .. 1.667
  Key.001Action.002                    0.708 .. 5.000
  LBLid_CAction.001                    0.708 .. 5.000
  Key.002Action.001                    1.542 .. 5.000
  LTLid_CAction.001                    1.542 .. 5.000
  Key.002Action.002                    1.542 .. 5.000
  LTLid_CAction.002                    1.542 .. 5.000
  R_Eye_GeoAction                      1.667 .. 5.000
  L_Eye_GeoAction.002                  2.375 .. 5.000

Toasty_Latest_Blender_Export.glb (3 animations, shared ~22s timeline)
  Key.003Action                       21.542 .. 21.958
  Key.001Action                       21.542 .. 21.958
  Key.011Action                       10.542 .. 12.833
```

These are **one choreographed performance fragmented per object**, not 13
clips. Importing them as 13 Vizij clips would be actively wrong.

Also verified: `asset.extras` is null, no animation carries `extras`, zero
nodes carry `extras`, and `extensionsUsed` is empty. Note this is _not_
evidence about whether Blender preserves `extras` — the source `RobotData`
lived in `extensions`, which Blender drops, so these files never had node
`extras` to preserve. The provenance-survival assumption still needs the real
round-trip fixture called for in Testing.

### Blender's grouping primitive is the NLA track

Blender's glTF exporter has an **Animation Mode** setting, and it is the
authoritative grouping signal. Rather than inventing heuristics, adopt its
output directly:

| Blender Animation Mode    | glTF result                                                             | Vizij mapping                             |
| ------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| **Actions** (default)     | one animation per action, per object; semantic grouping **discarded**   | reassemble onto a shared timeline (below) |
| **Active actions merged** | one animation containing all objects' active actions                    | 1 animation = 1 clip                      |
| **NLA Tracks**            | one animation per NLA track; tracks sharing a name across objects merge | **1 track = 1 clip** — the clean case     |
| **Scene**                 | one animation for the whole scene timeline                              | 1 animation = 1 clip                      |

So the rule is: **1 glTF animation = 1 Vizij clip**, which is correct and
lossless for three of the four modes. Only the default mode needs special
handling, because in that mode Blender has already thrown the grouping away
before we ever see the file.

### Handling the default (per-Action) mode without inventing semantics

Merge all animations into **one** Vizij clip, placing each animation's channels
at the times they already carry. No invention: the fragments already encode
their positions on a shared timeline, and reassembly reproduces exactly what
the Blender timeline looked like.

This corrects a rule carried over from the deferred FBX plan: **do not
time-shift each animation's start to zero.** Doing so here would collapse all
13 fragments onto t=0 and destroy the choreography. Time-shifting is a
per-clip-group operation, applied once to the merged result if it starts late
(as Toasty's 10.5s offset would warrant), never per source animation.

### Detection and what the UI says

Detect the mode from file evidence and tell the author what to do in Blender —
this is the surface the grouping question was really about:

| Signal                                                                                                | Inferred mode               | UI message                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| many animations, 1-2 channels each, names matching `/Action(\.\d+)?$/`, disjoint non-zero time ranges | Actions (default)           | "This GLB was exported with Blender's default per-Action mode, so its 13 animations are fragments of one 5s timeline rather than 13 clips. Importing as a single clip. To keep your own grouping, re-export with **Animation Mode = NLA Tracks**." |
| few animations, many channels each, names without the `Action` suffix                                 | NLA Tracks / Active actions | "Found 3 animations; importing one clip each."                                                                                                                                                                                                     |
| exactly one animation                                                                                 | Scene                       | "Found one scene animation; importing as one clip."                                                                                                                                                                                                |

Both messages are informational, not blocking, and the author can override the
grouping in the import review (merge all / one clip each / pick subsets).
Confidence in the inference is stated rather than implied, and the Actions-mode
copy names the concrete fix.

### Reference corpus: the three existing Blender exports

Decision (2026-09-02): **the three `*_Latest_Blender_Export.glb` files already
in `public/assets` are the reference corpus.** No new fixture generation. They
are all per-Action mode, which is Blender's default and therefore what authors
will actually produce, so designing against them is designing against the
common case rather than the convenient one.

Consequence: **per-Action mode is the primary supported path**, not a fallback.
The other three modes still map cleanly (1 animation = 1 clip) and cost nothing
to support, but they are unverified against real bytes and should be treated as
best-effort until a file in one of those modes turns up.

### Name-mode resolution is validated at 100% on the corpus

Simulating the resolver — glTF node name -> `normalizeStandardRigGroup` ->
propsrig path, and `weights` index -> `meshes[].extras.targetNames` ->
`sanitizeMorphKey` -> feature key — against the `RobotData` element/feature set
of the matching `*_Current.glb`:

| Face   | Vizij propsrig paths | Blender scalar channels | resolved | unresolved |
| ------ | -------------------- | ----------------------- | -------- | ---------- |
| Quori  | 251                  | 37                      | **37**   | **0**      |
| Hugo   | 282                  | 31                      | **31**   | **0**      |
| Toasty | 640                  | 8                       | **8**    | **0**      |

Every animated node name in the Blender exports matches a Vizij element name
exactly, and every morph name resolves through the existing
`sanitizeMorphKey()` rule. Examples:

```text
Face_Tran_Rot_C  translation  ->  /propsrig/face_tran_rot_c/translation/{x,y,z}
L_TLid           weights      ->  /propsrig/l_tlid/{lid_updn,curveup,curvedn}/value
LBLid            weights      ->  /propsrig/lblid/lidcurve/value
```

This is the single most important validation in the plan: **the Blender round
trip preserves exactly the identity the resolver depends on**, so name mode is
not a heuristic fallback here — on this corpus it is exact. The tiered fuzzy
matching inherited from the deferred FBX plan is therefore **not needed for
phase 2** and should not be built until a file actually requires it.

Also measured on the same corpus, closing out two flagged risks:

| Check                                                     | Result                                       | Effect on plan                                                                                                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| element names colliding after `normalizeStandardRigGroup` | 0 across all three faces (18/21/49 elements) | the `ensureUniquePath` `_2`-suffix migration risk does not fire on any real asset. Downgrade from "design around" to "detect and warn" — it can still appear if someone duplicates a mesh in Blender |
| morph-key collisions within an element                    | 0                                            | `sanitizeMorphKey` dedupe counter is not currently load-bearing                                                                                                                                      |
| duplicate glTF node names                                 | 0                                            | satisfies `PropertyBinding.findNode` uniqueness, which baking depends on (exporter constraint 5)                                                                                                     |

### Export guidance for authors (advice, not a dependency)

Worth surfacing in the UI and docs, because it costs the author nothing and
makes their intent survive:

1. **Animation Mode = NLA Tracks** preserves grouping: one track becomes one
   Vizij clip. Per-Action mode (the default) discards it, and we reassemble.
2. **Keep object names stable.** Names are the binding contract; a rename costs
   a remap. Renaming is not fatal (see orphan handling) but it is the one edit
   that reliably creates work.
3. **Keep shape-key names stable**, for the same reason.
4. Avoid duplicating a mesh into a name that normalizes onto an existing one.

None of these are required. The importer works on the corpus as-is.

## Material channel gap

After sampling, we hold a value curve for every animatable — including `color`
and `opacity`. The problem is purely that glTF has nowhere to put them.

glTF core animation targets exactly four properties per node: `translation`,
`rotation`, `scale`, `weights`. There is no material channel. So ~25-30% of the
sampled curves have no destination.

Three options:

| Option                                   | Result in Blender / viewers                                                                                                        | Result on Vizij re-import                   | Cost                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Accept the gap**                    | transform + morph motion plays; color/opacity sit at their static default                                                          | bundle is authoritative, so nothing is lost | none                                                                                                                                                                                                                                                   |
| **B. `KHR_animation_pointer`**           | ratified glTF extension that animates arbitrary properties (incl. material factors) via JSON pointer; support is version-dependent | Vizij could read it back losslessly         | **not supported by three 0.170 or three-stdlib in either direction** (verified) — requires hand-writing the extension into the glTF JSON on export and hand-parsing on import; Blender-side support needs verifying against the team's Blender version |
| **C. Custom `VIZIJ_material_animation`** | dropped by Blender and every other consumer                                                                                        | lossless self-round-trip                    | moderate, but delivers nothing the bundle does not already deliver                                                                                                                                                                                     |

Recommendation: **A**, because the bundle already carries these curves
losslessly and the baked GLB is explicitly a lossy interop projection. C spends
effort to duplicate what the bundle does. B is the only option that would make
color/opacity visible _outside_ Vizij, so it is worth revisiting if and when a
concrete external-consumer workflow needs animated color — but it should be its
own scoped piece of work, not a rider on this plan.

Whichever is chosen, the export preflight must **name the dropped channels**,
not just count them, so an author animating a color knows it will not appear in
the GLB.

## Phase 3 as built (2026-09-03)

The plan's phase-3 sketch was right that baking needs graph evaluation, and
the shape it proposed (`stageInput` / `setTime` / `evalAll`) does exist on
`@vizij/node-graph`'s `Graph`. It was not what got built, for two reasons
found while wiring it:

1. **vizij-authoring never uses `Graph` directly** — it evaluates through the
   device (`@vizij/runtime`). Sampling through `Graph` would have introduced a
   second evaluation path that must agree with the one that renders, which is
   the same class of divergence that made animation playback write real values
   to keys nothing read.
2. **Fixed stepping, not seeking.** `setTime` would be cheaper, but any node
   with memory depends on the sequence of steps it has seen, so a seeking
   sampler bakes a different animation than the one that plays.

So the sampler drives a **separate bake device** built from the exported
specs, stepping a fixed `1/fps`. Separate because driving the live device
would make the viewport jump during export and clobber the user's input
values; built from the exported specs because a second composition would let
the GLB and the bundle disagree with nothing to catch it.

Facts measured while building it, worth not rediscovering:

- **`AnimationClipIR` times are seconds.** The importer passes glTF seconds
  through unchanged and `bakeClip` hands them to three.js as seconds. An
  early draft of the sampler treated `duration` as milliseconds, which is a
  silent 1000x error in both frame count and key times.
- **A value crossing between composed sources costs exactly one tick**,
  measured against a real device. Recording without allowing for it
  time-shifts the bake by a frame per hop. Zero-dt ticks propagate without
  advancing time; stepping extra real frames would perturb dt-dependent
  nodes instead.
- **Namespacing is a registration-layer concern only.** `buildRigGraphSpec`
  emits bare paths, so a bake device built from it is self-consistent without
  any namespace handling.

Two things the plan specified that turned out to matter more than expected:

- **Constant channels must be dropped.** A channel the graph writes but never
  varies is what the rest pose already says; emitting it pins the node and
  overrides any other clip that does animate it.
- **A failing tick must abort sampling.** It stops every node, so continuing
  records a whole clip of stale values that looks like a successful bake.
