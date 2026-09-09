# Animations in and out of Vizij, and why the Blender trip is one way

**Decision (2026-09-08): the baked export is one way.** Vizij bakes clips into
glTF animation channels so Blender and any other glTF tool can _play_ the
motion. Editing that motion elsewhere and bringing it back is not a route
Vizij supports, and we are not building Blender-specific tooling to make it
one.

This is the reasoning and the measurements behind that, so it does not get
relitigated from first principles.

```mermaid
flowchart TB
  subgraph blender["Blender, and any other glTF tool"]
    authored["Animation authored<br/>in Blender"]
    views["Opens the .glb and<br/>plays the baked motion"]
  end

  subgraph glb["The .glb Vizij writes"]
    channels["glTF animation channels<br/>baked, so any tool can play it"]
    bundle["VIZIJ_bundle.animations<br/>lossless clips, the source of truth"]
    records["VIZIJ_bundle.bakedAnimations<br/>clipId + fingerprint"]
    robot["RobotData<br/>rig + baked rootBounds"]
    channels -->|"hash what was written"| records
  end

  subgraph vizij["Vizij"]
    timeline["Timeline editor"]
    compare{"Reopening a Vizij-written .glb:<br/>is there a fingerprint record?"}
    skip["match → skip-duplicate<br/>the bundle clip loads once,<br/>the baked copy is dropped"]
    fresh["no record → import-new<br/>import as a new clip alongside<br/>whatever is already open"]
    both["mismatch → keep-both-edited<br/>reachable only if the bundle<br/>survived the edit"]
    compare --> skip
    compare --> fresh
    compare --> both
  end

  authored -->|"import a .glb, or import<br/>its animations on their own"| timeline
  timeline -->|"save"| bundle
  timeline -->|"save (bake)"| channels
  channels -->|"one way: to be seen, not brought back"| views
  records --> compare
  bundle -->|"load lossless"| timeline

  back["Editing the baked animation in Blender and re-exporting<br/>is NOT a supported route. Blender's exporter drops every<br/>extension, so its output has no bundle, no records and<br/>no RobotData. Preserving them would need a<br/>Blender-specific add-on, which we have chosen not to build."]
  views -.-> back

  classDef primary fill:#50C4B6,stroke:#2AA499,color:#FFFFFF,stroke-width:2px
  classDef secondary fill:#F56B29,stroke:#EC4D00,color:#FFFFFF,stroke-width:2px
  classDef highlight fill:#FF9E00,stroke:#F78600,color:#333333,stroke-width:2px
  classDef neutral fill:#F7F8F8,stroke:#888888,color:#333333,stroke-width:2px
  classDef emphasis fill:#48E2CE,stroke:#2AA499,color:#111111,stroke-width:2px
  classDef declined fill:#FFFFFF,stroke:#EC4D00,color:#EC4D00,stroke-width:2px,stroke-dasharray:4 4
  class authored,views secondary
  class channels neutral
  class bundle,robot emphasis
  class records highlight
  class timeline,skip primary
  class compare highlight
  class fresh neutral
  class both,back declined
```

A save writes each clip twice: losslessly into `VIZIJ_bundle`, which is the
source of truth, and baked into glTF channels so other tools can play the
motion. The bake is one way by design. The animation-only import still works
for any glTF animation from any tool — it lands as `import-new`, a new clip
beside the existing ones — it just is not a round trip Vizij designs for.
Measured against Blender 5.2.1.

## What a save writes

Each clip goes into the `.glb` twice:

- `VIZIJ_bundle.animations` — the lossless clip. **This is the source of
  truth.**
- glTF animation channels — a baked copy at 30fps, so other tools can play it.
- `VIZIJ_bundle.bakedAnimations` — a `clipId` and a fingerprint per baked
  animation, taken by reading back the GLB just written rather than predicted
  from the inputs.
- `RobotData` — the rig, including the baked `rootBounds`.

## Why the return trip is not supported

Measured against **Blender 5.2.1**: saved a GLB from Vizij (`quori:latest`),
imported it into Blender, moved one morph keyframe (`ltsneer` on `Mouth`,
frame 29.6) from `0.0` to `0.85`, exported from Blender.

|                                               | the .glb Vizij writes     | the .glb Blender writes |
| --------------------------------------------- | ------------------------- | ----------------------- |
| `extensionsUsed`                              | `RobotData, VIZIJ_bundle` | **(none)**              |
| baked glTF animations                         | 2                         | 2                       |
| `VIZIJ_bundle.animations` (lossless)          | present                   | **gone**                |
| `VIZIJ_bundle.bakedAnimations` (fingerprints) | 2 records                 | **gone**                |
| `RobotData` (rig + baked rootBounds)          | present                   | **gone**                |

Blender's glTF exporter drops unknown extensions. Confirmed on a passthrough
export with **no edits at all**, so it is the exporter, not the edit.

Preserving them is possible but only with a companion Blender add-on:
`gather_import_gltf_before_hook` to stash the extensions on import, then
`gather_gltf_extensions_hook` and `passthrough_extension_data` to write them
back on export, registered as `glTF2Import`/`ExportUserExtension`. There is no
setting that does it — `passthrough_extension_data` exists in
`io_scene_gltf2` but is a hook _for add-ons_ to protect payloads from
`__fix_json`, not a preservation feature.

**We have chosen not to build that.** It is one tool's plugin API, it would
carry a stale copy of the bundle (the one that was imported, not the one the
animator's edits imply), and the value does not justify owning Blender-version
compatibility.

## What still works, and is not Blender-specific

Importing glTF animations on their own — `app-import-glb-animations-input`,
not the face import. That works for animations from **any** glTF tool: they
land as `import-new`, a new clip beside whatever is already open. Measured
with the Blender-edited file: a session with 2 clips became 4, originals kept.

The edit itself survives that path. Decoded through
`readGltfAnimationDocument`, the edited value reads **0.8429** against the
0.85 that was set — Blender resamples fcurves onto whole frames when it
exports glTF, and the keyframe sat at frame 29.6, so the nearest exported
sample lands just off the peak. A zero became a ~0.84, recovered out of a
channel where Blender had merged every morph target of the mesh into one
`weights` array.

Pinned by `src/animationImport/__tests__/blenderEditSurvives.device.test.ts`,
which skips when the fixture is absent because producing one needs Blender and
a person; its header records how.

## Consequence worth deciding separately

`keep-both-edited` — the disposition that keeps a lossless clip _and_ an
edited baked copy — needs the `bakedAnimations` records to have survived
whatever edited the channels. With the decision above, nothing in a supported
workflow does that: reopening a Vizij-written file gives `skip-duplicate`, and
anything from another tool gives `import-new`.

So that branch is now unreachable in practice. It is thoroughly unit-tested
(`src/animationImport/__tests__/bakedAnimationProvenance.test.ts`) and costs
nothing to keep, but it is dead code against the current design, and the
fingerprint recording exists solely to feed it. Whether to keep both as
insurance against a future tool that does preserve extensions, or to remove
them and simplify export, is a separate call — not made here.
