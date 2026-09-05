# Animation clip state: before and after

Companion to `ANIMATION_SELECTION_STATE_2026-09-03.md`, which traces the bugs.
This shows the shape that produced them and the shape replacing it, and — since
it is the question that matters most — where clips end up when you save.

## Before: two stores, reconciled by an effect

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart TB
  subgraph live["Live — zustand animationStore"]
    tracks["tracks / duration<br/>the clip being edited"]:::primary
  end

  subgraph saved["Saved — App useState"]
    authored["authoredAnimationTargets"]:::secondary
    ov["bundleAnimationClipOverrides<br/>+ name + duration overrides"]:::secondary
    sel["selectedAnimationTargetId"]:::highlight
  end

  subgraph movers["Three writers of the selection"]
    click["handleSelectAnimationTarget<br/>saves outgoing first"]:::neutral
    lifecycle["useManagedTargetLifecycle<br/>falls back to targetOptions[0]"]:::neutral
    pending["pendingAnimationTargetSwitchId<br/>deferred switch"]:::neutral
  end

  click --> sel
  lifecycle --> sel
  pending --> sel
  click --> tracks
  lifecycle --> tracks

  tracks -- "autosave effect<br/>copies live to saved" --> authored
  tracks -- "autosave effect" --> ov
  sel -. "destination of the copy<br/>moves independently" .-> authored

  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
```

The dotted edge is the defect. The autosave copies **live to saved**, but the
_destination_ of that copy is read from the selection — which three different
code paths move, on their own schedules. Any moment where selection and live
contents disagree writes the wrong clip:

| Disagreement                                        | Symptom                                      |
| --------------------------------------------------- | -------------------------------------------- |
| selection moved before the load                     | new clip receives the previous clip's tracks |
| store emptied before selection caught up            | every clip drops to 0 tracks                 |
| destination resolved to a clip you were not editing | "nothing saves"                              |

## After: one store, no copy

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart TB
  subgraph store["animationClipsStore — single owner"]
    entries["entries: clipId → AnimationClipEntry<br/>the only instance of each clip"]:::primary
    selected["selectedClipId"]:::highlight
  end

  ui["Timeline / Inspector / list"]:::neutral

  ui -- "updateSelectedClip(updater)" --> entries
  ui -- "selectClip(id)" --> selected
  selected -- "addresses" --> entries

  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef highlight fill:#FF9E00,stroke:#F78600,stroke-width:2px,color:#333333,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
```

There is no copy to misroute. Edits address `selectedClipId` from inside the
store and selection changes are one `set()`, so no render can observe selection
and data referring to different clips. The autosave effect, the hydration
marker, save-before-switch and the deferred-switch dance all become unnecessary
rather than needing to be made correct.

## Where clips go when you save

Unchanged by the refactor — this is the contract the port has to keep.

```mermaid
%%{init: {"theme":"base","themeVariables":{"fontFamily":"Questrial, Gilroy, sans-serif","primaryColor":"#50C4B6","primaryBorderColor":"#2AA499","primaryTextColor":"#FFFFFF","lineColor":"#555555","textColor":"#333333","background":"#FFFFFF","clusterBkg":"#F7F8F8","clusterBorder":"#50C4B6"}}}%%
flowchart LR
  entries["animationClipsStore<br/>entries"]:::primary

  subgraph glb["Exported .glb"]
    bundle["VIZIJ_bundle.animations<br/>AnimationClipIR — lossless"]:::emphasis
    gltf["glTF animations<br/>baked node + morph channels"]:::secondary
  end

  entries -- "clipIrToBundleAnimationEntry" --> bundle
  entries -- "sample graph, decimate,<br/>recombine to glTF tracks" --> gltf
  bundle --> runtime["Runtime / Arora<br/>plays the clip"]:::neutral
  gltf --> blender["Blender, three.js,<br/>any glTF viewer"]:::neutral

  classDef primary fill:#50C4B6,stroke:#2AA499,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef secondary fill:#F56B29,stroke:#EC4D00,stroke-width:2px,color:#FFFFFF,rx:8,ry:8;
  classDef emphasis fill:#48E2CE,stroke:#2AA499,stroke-width:2px,color:#111111,rx:8,ry:8;
  classDef neutral fill:#F7F8F8,stroke:#888888,stroke-width:2px,color:#333333,rx:8,ry:8;
```

Clips are written **twice, deliberately**, and the two are not redundant:

- **`VIZIJ_bundle.animations`** — the authored `AnimationClipIR`, lossless, with
  per-key interpolation and tangents intact. This is what the runtime loads and
  what round-trips back into this app. Confirmed present in a shipped asset:
  `Quori_Current_Extended.glb` carries
  `animations: [authoring.timeline.clip.1, authoring.timeline.main]`.
- **glTF `animations`** — baked node and morph channels, so Blender or any glTF
  viewer sees the motion. Lossy by nature: material channels have no glTF
  equivalent, and clips driving abstract rig inputs must be evaluated through
  the rig graph to become node motion.

Path in code: `authoredAnimationClips` → `clipIrToBundleAnimationEntry` →
merged with inherited imported entries → `bundle.animations` →
`applyVizijBundle` → the `VIZIJ_bundle` extension; and separately
`bakeAuthoredClips` → `exportScene({ animations })`.

### Two things the port must preserve

1. **Feed the export from `entries`.** `authoredAnimationClips` currently comes
   from a memo that includes imported clips only when they carry edits, with
   the rest inherited separately. With provenance on the entry, that becomes
   "emit every entry", and `source` decides whether an unedited import is
   inherited or re-emitted.
2. **Empty clips are dropped on export today** — `authoredAnimationEntries`
   filters `tracks.length > 0`. So a clip created and never keyed does not
   survive a save/reload. Defensible, but it should be a decision rather than a
   side effect of a filter; worth surfacing in the export preflight.
