# Source Animation Import Plan (GLB + FBX)

Date: 2026-09-02
Owner: TBD
Status: **deferred** — FBX is out of scope as of 2026-09-02
Scope: `apps/vizij-authoring`, `packages/@vizij/render`

> **Deferred.** Active work is
> [GLB_ANIMATION_ROUNDTRIP_PLAN_2026-09-02.md](./GLB_ANIMATION_ROUNDTRIP_PLAN_2026-09-02.md),
> which covers native glTF animation import **and** baking Vizij clips back
> into GLB. Retain this document for the `SourceMotionDocument` shape, the
> quaternion-unwrap rules, the tiered name-matching table, and the keyframe
> decimation approach — all of which carry over if FBX is revived.

## Objective

Let an author bring animation from an external source into `vizij-authoring`
and convert it into Vizij animation clips whose tracks drive the correct Vizij
values on the loaded face. Two sources are in scope:

1. **glTF/GLB-embedded animation** — native glTF `animations` channels, whether
   the GLB is a Vizij export or came from Blender/Maya/etc.
2. **FBX takes** — `.fbx` AnimationStacks.

Both funnel through one `SourceMotionDocument` contract and one retarget
engine. GLB lands first because it is strictly easier and higher-fidelity
(see "Source Matrix"), and it de-risks the shared pipeline before FBX's
lossy, ambiguous parsing is layered on.

## Non-Goals (this plan)

1. Importing FBX geometry/meshes as a new Vizij face. Vizij's renderable model
   has no skinning concept; FBX geometry import is a separate, larger track.
2. Skeletal/bone retargeting between dissimilar skeletons (IK, bone chains).
   Bone curves are only mapped when a same-named Vizij renderable exists.
3. Preserving DCC-side cubic/TCB easing exactly. `THREE.FBXLoader` bakes FBX
   curves to per-key linear samples; we approximate and say so in diagnostics.

## Source Matrix

Four distinct cases, three of which are GLB. Only case A works today.

| Case | Source                                                                   | Status today                                                                                                      | Mapping needed                                       |
| ---- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A    | GLB with Vizij **bundle** animations (`VizijBundleExtension.animations`) | **Works end to end.** Selectable target, plays, duplicable into an editable authored clip, preserved on re-export | none — channels are already rig input paths          |
| B    | GLB with native glTF animations **+ `RobotData`** node extension         | Extracted at load, then **dropped by authoring**; the runtime does consume it                                     | exact lookup, no heuristics                          |
| C    | GLB with native glTF animations, **no `RobotData`** (foreign GLB)        | **Nothing reads it**                                                                                              | name/heuristic tiers (same as FBX)                   |
| D    | `.fbx` takes                                                             | Not supported                                                                                                     | name/heuristic tiers + unit/axis/rotation conversion |

Verified detail per case:

1. **Case A** — `loadedBundle.animations` feeds `bundleAnimationTargetOptions`
   (`src/App.tsx`), so every bundle clip becomes a selectable animation target;
   `handleDuplicateAnimationTarget` → `resolveImportedAnimationClip` promotes
   one into an editable authored clip. The authored-timeline clip additionally
   re-hydrates into the timeline editor via
   `hydrateAuthoredTimelineFromBundleAnimations`. Re-export preserves the rest
   as `inheritedAnimations`. **No work required.**
2. **Case B** — `extractVizijAnimations()` already returns
   `VizijAnimationClipData[]` and `loadGLTF*` returns it on
   `LoadedVizijAsset.animations`, but `useVizijAssetLoader` destructures
   `{ world, animatables, bundle, scene }` and discards `animations`.
   `@vizij/runtime-react`'s `convertExtractedAnimations` _does_ consume it, so
   such a clip plays in `demo-vizij-player` while staying invisible in
   authoring. This is a wiring gap, not an architectural one.
3. **Case C** — `extractVizijAnimations()` returns `[]` immediately when no node
   carries `RobotData` (`if (robotNodeIndex.size === 0) return animations`).
   This is the same gap as FBX and needs the same tiered matching.
4. Vizij's own GLB export writes animation **only** into the bundle extension
   (`useVizijExport.ts`), never as native glTF animation channels. So case C
   only ever arises for foreign GLBs.

### Channel-convention divergence (fix as part of this work)

Extracted glTF clips use `componentId` / `componentId:index` as the track
channel (`convertExtractedAnimations`), while bundle clips use rig input paths.
Two conventions for the same concept. The retarget engine resolves both to
`variableId = input.id` + `channel = input.path`, making the rig-input path the
single authored convention.

### Why same-file GLB is the easy case

When the animation is embedded in the same GLB as the face, source and target
are **the same node**. The curve values sit in the identical frame as the
animatable defaults derived from that node, so:

1. no name matching — `node index → RobotData componentId → propsrig input id`
   is a lookup, not a guess;
2. no unit conversion and no axis conversion;
3. no rest-pose offset (source rest **is** target rest);
4. transforms collapse to identity, leaving only decimation.

glTF is also higher fidelity than FBX: `CUBICSPLINE` samplers carry real in/out
tangents, `AnimationKeyframeIR` already has `inTangent`/`outTangent`, and
`evaluateAnimationTrackAtTime` already implements Hermite evaluation. The
runtime's triplet-tangent handling (`hasTripletTangents`) confirms the layout.
FBX loses easing to baked linear samples; glTF does not have to.

Consequence for sequencing: case B ships first and exercises the entire
downstream pipeline (clip synthesis, multi-take commit, review UI, decimation)
with zero retargeting risk. Case C then adds the matching tiers on a proven
pipeline. Case D adds FBX parsing plus unit/axis/rotation conversion last.

## Current-State Facts (verified)

1. Authoring animation IR is scalar-per-track:
   `AnimationTrackIR { variableId, channel, interpolation, keyframes[{time,value}] }`
   (`src/types/animationClipIr.ts`). Every FBX curve must reduce to scalars.
2. Multi-clip authoring already exists: `AuthoredAnimationTarget` +
   `authoring.timeline.clip.<n>` ids + a target selector in `src/App.tsx`
   (`handleCreateAnimationTarget`, `handleDuplicateAnimationTarget`,
   `nextAuthoredAnimationClipOrdinal`). FBX takes can each become a target —
   no new clip-library substrate is required.
3. Export already merges an array of authored clips into
   `VizijBundleExtension.animations` (`src/hooks/useVizijExport.ts`).
4. Animatable targets are generated by `src/rig/autoInputs.ts` into
   `/propsrig/<shape>/<feature>/<component>` `StandardRigInput`s, each carrying
   `sourceId = component:<elementId>:<featureKey>:<animatableId>:<componentId>`
   and metadata (`elementName`, `featureKey`, `componentKey`).
5. Feature shapes to target:
   - `translation` = `vector3`, units metres (`import-mesh.ts`)
   - `rotation` = `euler`, radians
   - `scale` = `vector3`
   - morph targets = one `number` animatable per morph, feature key produced by
     `sanitizeMorphKey()` in `gltf-loading/import-geometry.ts`
6. `THREE.FBXLoader` (available via `three-stdlib` in `@vizij/render` and
   `three/examples/jsm` in the app) emits, per AnimationStack, tracks named:
   - `<modelName>.position` (Vector3, stride 3)
   - `<modelName>.quaternion` (Quaternion, stride 4; euler + pre/post rotation
     already baked, with interpolated sub-samples)
   - `<modelName>.scale` (Vector3, stride 3)
   - `<modelName>.morphTargetInfluences[<index>]` (Number, already `/100`)
7. The loader does **not** apply units or axis conversion. It exposes
   `sceneGraph.userData.unitScaleFactor` only; `UpAxis` is ignored entirely.
   Vizij sets `Object3D.DEFAULT_UP = (0,0,1)` (Z-up); FBX is typically Y-up/cm.
8. Version gates: binary FBX `< 6400` and ASCII FBX `< 7000` throw.
   Multiple animation _layers_ per stack are unsupported (loader warns, drops).
9. `@vizij/render` already has an unused-by-authoring GLTF animation extractor
   (`gltf-loading/extract-animations.ts`) that requires the `RobotData`
   extension. FBX has no such extension, so mapping must be name/heuristic
   driven. Phase 6 folds GLTF through the same retarget engine.

## Architecture

Three boundaries, so each is independently testable:

```text
.glb (native glTF animations)          .fbx bytes
  │  gltf-loading/extract-animations     │  (Three.js, worker)
  │  (already exists, needs widening)    │  fbx-loading/  (new)
  └──────────────┬────────────────────────┘
                 ▼
        SourceMotionDocument      source-neutral, no Vizij concepts
                 │  (pure TS, no three)   src/animationImport/
                 ▼
        RetargetPlan              reviewable/editable, serializable as a profile
                 │  (pure TS)
                 ▼
        AnimationClipIR[]         existing authoring animation contract
                 │
                 ▼
        AuthoredAnimationTarget[] ──► bundle animations ──► runtime
```

Case A (bundle animations) bypasses this entirely — it is already in the
authored contract and only needs the existing duplicate-to-editable path.

### Boundary contract: `SourceMotionDocument`

```ts
type SourceProperty = "position" | "rotation" | "scale" | "morph";
type SourceUnit = "cm" | "m" | "rad" | "deg" | "normalized" | "unitless";

interface SourceMotionCurve {
  id: string; // `${nodePath}|${property}|${component ?? morphName}`
  nodeName: string; // sanitized FBX model name
  nodePath: string; // full ancestor path, disambiguates duplicate names
  property: SourceProperty;
  component?: "x" | "y" | "z";
  morphName?: string; // reverse-resolved from morphTargetDictionary
  unit: SourceUnit;
  times: number[]; // seconds, monotonic
  values: number[]; // one scalar per time
  restValue: number; // node rest/bind value for this scalar
  sourceKeyCount: number; // pre-decimation, for reporting
}

interface SourceMotionClip {
  id: string;
  name: string;
  startTime: number;
  duration: number;
  fps?: number;
  curves: SourceMotionCurve[];
}

interface SourceMotionDocument {
  sourceFormat: "fbx";
  fileName: string;
  unitScaleFactor: number; // from GlobalSettings, cm default
  upAxis: "y" | "z" | "unknown";
  nodes: Array<{ name: string; path: string; morphNames: string[] }>;
  clips: SourceMotionClip[];
  diagnostics: ImportDiagnostic[];
}
```

This is the extraction seam: the glTF adapter, the FBX adapter, and later BVH
or `.anim` adapters all produce it without touching the retarget engine.

For the glTF adapter, `sourceFormat: "gltf"`, `unitScaleFactor: 1`, and
`upAxis: "y"`; because source and target nodes coincide for same-file imports,
`restValue` is read from the node's own TRS and the transform stage collapses to
identity. glTF channel paths map as `translation → position`,
`rotation → rotation` (quaternion, same decomposition as FBX),
`scale → scale`, `weights → morph` — the same table
`extract-animations.ts` already declares in
`CHANNEL_PATH_TO_TRACK_PROPERTY`.

The glTF adapter must additionally:

1. **preserve `CUBICSPLINE` tangents** rather than flattening to linear —
   emit `interpolation: "cubic"` with `inTangent`/`outTangent`, reusing the
   triplet-stride layout the runtime's `hasTripletTangents` path already
   handles;
2. **not require `RobotData`** — drop the
   `if (robotNodeIndex.size === 0) return animations` early exit and fall back
   to node-name identity so foreign GLBs (case C) still yield curves;
3. **key on node index when `RobotData` is present** (case B) so mapping is an
   exact lookup, and only fall back to name matching when it is absent.

### Curve decomposition rules (the correctness core)

1. `.position` / `.scale`: split stride-3 buffer into x/y/z scalar curves.
2. `.quaternion` → euler:
   - walk keys and negate `q` when `dot(q_prev, q) < 0` (shortest-path
     continuity) **before** conversion;
   - `Euler.setFromQuaternion(q, "XYZ")` to match `AnimatableEuler` semantics;
   - **unwrap** each channel so consecutive keys differ by `< π` (add `±2π`),
     otherwise the timeline shows a 360° snap where the DCC showed none;
   - emit x/y/z in radians.
     This is the highest-risk transform; it gets dedicated tests (see below).
3. `.morphTargetInfluences[i]`: reverse-resolve `i` through the owning mesh's
   `morphTargetDictionary` to get the morph name; values are already `0..1`.
4. Times come from the loader already in seconds. Declare
   `interpolation: "linear"` and emit an `info` diagnostic that source easing
   was baked.

## Mapping resolution

Build a `RetargetTargetCatalog` from live authoring state: managed
`/propsrig/...` inputs (with their `metadata`), abstract rig inputs, and
pose-weight inputs. Index by (normalized element name, feature, component), by
normalized morph key, by input path, and by input id — following the caching
style of `src/utils/standardInputResolutionIndex.ts`.

Resolution runs in strict tiers; the first hit wins and the tier is recorded:

| Tier | Rule                                                                                                                                                | Auto-applied             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| -1   | **Node identity** (same-file GLB): glTF node index -> `RobotData` componentId -> propsrig input. A lookup, not a match; no name comparison          | yes                      |
| 0    | Explicit saved `AnimationImportProfile` entry                                                                                                       | yes                      |
| 1    | Exact: `sanitize(nodeName) === sanitize(elementName)` + feature + component; morph via the **same** `sanitizeMorphKey` rule as `import-geometry.ts` | yes                      |
| 2    | Alias: strip DCC noise (`mixamorig:`, `ns:`, `_geo`, `Shape`, `blendShape1.`, `.001`), case/underscore/space-insensitive                            | yes                      |
| 3    | Semantic: ARKit/FACS/viseme synonym table resolved against loaded Standard Profiles (`useStandardProfiles`)                                         | yes, flagged             |
| 4    | Fuzzy: token-set Jaccard + Levenshtein tiebreak above threshold                                                                                     | **no** — suggestion only |

Output:

```ts
interface MappingDecision {
  curveId: string;
  targetInputId: string | null;
  targetPath: string | null;
  tier: -1 | 0 | 1 | 2 | 3 | 4 | null;
  confidence: number;
  transform: ValueTransform;
  alternatives: Array<{ targetInputId: string; confidence: number }>;
  diagnostics: ImportDiagnostic[];
}
interface RetargetPlan {
  decisions: MappingDecision[];
  unmappedCurves: string[];
  unusedTargets: string[];
  clipSelection: Record<string, boolean>;
  options: RetargetOptions;
}
```

Determinism and idempotence are contractual (`ARCHITECTURE.md` §Diagnostics/
Validation 5): same document + same catalog + same profile ⇒ byte-identical
plan; importing twice produces identical IR.

## Value transform

Applied per decision, in this fixed order, each step inspectable in the UI:

1. **Axis conversion** — `asIs | yUpToZUp` (default inferred from `upAxis`,
   overridable). Applied to the translation/rotation triple _before_ the
   per-component split.
2. **Unit conversion** — translation `× unitScaleFactor / 100` (cm→m);
   `deg→rad` when the source declares degrees; morph pass-through.
3. **Rest handling** — `absolute` (default; propsrig inputs are absolute) or
   `relativeToRest` (`value - source.restValue + target.defaultValue`), which
   is what makes a source with a different rest pose still read correctly.
4. **Fit to target range** — `clamp` (default) | `none` | `normalize`
   (source min/max → target `range`) | `affine` (`k·v + b`), plus `invert`.
   Clipped-sample counts become `warning` diagnostics.

## Clip synthesis

1. One `AnimationClipIR` per selected AnimationStack (take).
2. Time-shift so `startTime → 0` (FBX stacks commonly start at frame 1).
3. One `AnimationTrackIR` per mapped target: `variableId = input.id`,
   `channel = input.path`, `interpolation: "linear"`.
4. **Keyframe reduction** (mandatory in practice — baked takes are 24–60 fps ×
   hundreds of channels): Ramer–Douglas–Peucker on `(time, value)` with
   unit-aware default epsilon (separate defaults for radians, metres,
   normalized), always retaining first/last keys. Report per-track
   `sourceKeyCount → retainedKeyCount` and max induced error. Provide an
   off switch.
5. Optional resample-to-fps for irregularly sampled sources.
6. `duration = max key time`; run the result through the existing
   `compileAnimationClipIr()` so dedupe/sort/quantization stays in one place.

## UI / UX

Follows `UI_DESIGN.md` §Import/Export UX Contract (structured diagnostics,
nothing silent) and reuses the `DiscrepancyWizard` review-before-mutate shape.

1. **Entry points**: `File ▸ Import Animation (FBX)…` in `AppMenuBar`, plus an
   Import button in the Animation panel's clip-target row. `.fbx` accepted by
   the existing asset input where sensible.
2. **Precondition**: a face must be loaded. With no face, show an actionable
   message ("load a face first — animation import maps onto its inputs")
   instead of importing into nothing.
3. **Review dialog** (`FbxAnimationImportWizard`):
   - Summary: file, unit/axis detected, takes found, curves parsed, mapped vs
     unmapped, estimated keyframes after reduction.
   - Take selection (checkbox per stack, with duration/curve counts).
   - Mapping table: source curve · resolved target · tier badge · confidence ·
     transform summary · target picker (searchable) · force-unmap · alternatives.
   - Global options: axis, rest mode, range fit, decimation tolerance, resample.
   - Diagnostics list with severity + remediation.
   - Live preview: scrub the first selected take against the current mapping
     before committing (drives the existing transport bridge).
4. **Commit**: create one `AuthoredAnimationTarget` per selected take, select
   the first, mark export dirty. No mutation happens before commit.
5. **Profile persistence**: save the resolved mapping as an
   `AnimationImportProfile` (download JSON + carry in bundle metadata under
   `metadata.animationImport`) so re-importing an updated FBX is one click and
   deterministic.

## Performance

1. Parse in a Vite Web Worker (`?worker`) with a main-thread fallback for
   tests/node; FBX takes are routinely tens of MB.
2. Dynamic-import `FBXLoader` (`await import(...)`) so its ~150–200 KB plus
   `fflate` never lands in the main chunk.
3. Keep raw `SourceMotionDocument` in a session ref/cache keyed by import id —
   never in zustand. Only decimated `AnimationClipIR` reaches the store.
4. Decimate before commit, not after.

## Testing

Unit (vitest, in-app + `@vizij/render`):

1. Quaternion→euler: sign-flip continuity, ±180° flips, gimbal near ±90°,
   wrap unwrapping. Assert reconstructed quaternion matches source within
   tolerance at every key.
2. Unit and axis transforms, including `unitScaleFactor` ≠ 1.
3. RDP decimation: error bound never exceeds epsilon; endpoints preserved;
   monotonic key times.
4. Name matching tiers against fixtures for Mixamo, ARKit/Character Creator,
   Blender, and Maya namespace conventions; assert tier 4 never auto-applies.
5. Determinism/idempotence: same inputs ⇒ identical plan and identical IR;
   double import produces no drift.
6. Profile round-trip (save → reload → identical plan).

Fixtures, glTF: small purpose-built GLBs (or `.gltf` + JSON, which is
diff-friendly and preferable) covering a `RobotData`-tagged animated face
(case B), the same file with `RobotData` stripped (case C), a `CUBICSPLINE`
sampler, a `weights`/morph channel, and a multi-animation file. The existing
`public/assets/*.glb` presets are the realistic end-to-end targets but are too
large and too incidental to assert against — keep them for Playwright only.

Fixtures, FBX: minimal **ASCII** FBX files committed as text (a few KB each,
diff-friendly) covering transform-only, morph-only, multi-take, cm+degrees,
nonzero start time, and a quaternion-flip case. Avoid binary blobs in git.

Integration: `SourceMotionDocument → AnimationClipIR → clipIrToBundleAnimationEntry`
against a fixture standard-input catalog, then back through
`bundleAnimationEntryToClipIr` for round-trip parity.

Playwright (`workflow` project): load the Quori preset, import the fixture FBX,
assert the clip target appears with expected track count, transport plays, and
export contains the clip.

Perf guard: synthetic 60 fps × 60 s × 100-channel document converts within
budget and decimates to a target key count.

## Risks

| Risk                                                                                                                                                                         | Mitigation                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Quaternion→euler artifacts (the top defect source)                                                                                                                           | continuity + unwrap, dedicated tests, preview before commit                                               |
| Case B regressions: extracted clips currently only reach the runtime, so wiring them into authoring could double-apply a clip (runtime + authored track on the same channel) | assert single ownership per channel; treat an imported clip as inert until promoted to an authored target |
| Bone curves unmappable onto Vizij renderables                                                                                                                                | scope to animation-only; report unmapped bones explicitly rather than failing                             |
| Old/exotic FBX versions rejected by the loader                                                                                                                               | detect and report the version with remediation ("re-export as FBX 2013+ binary or ASCII 7.x")             |
| Multi-layer stacks silently dropped by the loader                                                                                                                            | capture the loader warning and surface it as a `warning` diagnostic                                       |
| Bundle-size regression                                                                                                                                                       | dynamic import + size check                                                                               |
| Huge takes freezing the UI                                                                                                                                                   | worker parse, decimate pre-commit, raw curves out of the store                                            |

## Phasing

GLB first — it de-risks the shared pipeline before FBX's ambiguity is added.

| Phase | Deliverable                                                                                                                                              | Case  | Notes                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| 0     | Spike: dump channel names, paths, interpolation, counts and units from real GLBs **and** FBX files                                                       | B/C/D | throwaway script; grounds heuristics in real exports rather than assumed DCC conventions |
| 1     | Stop discarding `LoadedVizijAsset.animations`; glTF adapter -> `SourceMotionDocument` incl. `CUBICSPLINE` tangents and the `RobotData`-optional fallback | B     | smallest real win: one destructure plus widening an extractor that already exists        |
| 2     | Retarget engine: catalog, tiers (`-1` identity first), transforms, decimation                                                                            | B     | pure TS, fully unit-tested; the identity path needs no heuristics                        |
| 3     | `AnimationClipIR` synthesis + multi-clip commit into existing targets                                                                                    | B     | reuses `AuthoredAnimationTarget` machinery; **first end-to-end import**                  |
| 4     | Import wizard UI + diagnostics + preview                                                                                                                 | B     | `UI_DESIGN.md` update lands here                                                         |
| 5     | Name-matching tiers 1-4 + unit/axis/rest transforms; foreign-GLB import                                                                                  | C     | proves retargeting on a pipeline that already works                                      |
| 6     | FBX adapter + worker + quaternion unwrap + version/layer diagnostics                                                                                     | D     | the lossy, ambiguous source, added last                                                  |
| 7     | Profile persistence, re-import, export metadata, e2e, docs; unify the `componentId` vs rig-path channel convention                                       | all   |                                                                                          |
| 8     | Optional: BVH / `.anim` adapters                                                                                                                         | -     | near-free once the contract holds                                                        |

Phases 1-4 are worth shipping on their own: they turn an already-extracted,
already-dropped payload into editable clips with no retargeting risk.

## Docs and Process

1. Backlog items in `docs/plans/BACKLOG.md`; roadmap stage entry in
   `docs/plans/ROADMAP.md`; evidence in `docs/plans/TRACKER.md`.
2. `docs/UI_DESIGN.md`: extend §Import/Export UX Contract with the animation
   import review contract.
3. `docs/ARCHITECTURE.md`: add a "Source Motion Import" section defining
   `SourceMotionDocument` as a boundary contract.
4. README note for the new FBX fixture; changeset for `@vizij/render` when the
   FBX loader export ships.
5. `pnpm run prep` (lint + typecheck + test) evidence recorded per phase.
