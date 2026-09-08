# The Blender round trip, as measured

Run end to end against **Blender 5.2.1** on 2026-09-08: saved a GLB from Vizij
(`quori:latest`), imported it into Blender, moved one morph keyframe
(`ltsneer` on `Mouth`, frame 29.6) from `0.0` to `0.85`, exported from Blender,
and brought it back.

The diagram is `animation-blender-round-trip.d2`, rendered alongside as
`.svg`.

**It works, but not down the path the design assumed.** The headline finding:

|                                               | the .glb Vizij writes     | the .glb Blender writes |
| --------------------------------------------- | ------------------------- | ----------------------- |
| `extensionsUsed`                              | `RobotData, VIZIJ_bundle` | **(none)**              |
| baked glTF animations                         | 2                         | 2                       |
| `VIZIJ_bundle.animations` (lossless)          | present                   | **gone**                |
| `VIZIJ_bundle.bakedAnimations` (fingerprints) | 2 records                 | **gone**                |
| `RobotData` (rig + baked rootBounds)          | present                   | **gone**                |

Blender's glTF exporter drops unknown extensions. Confirmed on a straight
passthrough export with **no edits at all**, so it is the exporter and not
anything the edit did.

## What that means for the three dispositions

- `skip-duplicate` and `keep-both-edited` both need the `bakedAnimations`
  records to still be in the file. Only a file Vizij itself wrote has them.
- **`keep-both-edited` is unreachable through a real Blender re-export.** With
  no records, provenance cannot match anything and every animation reads as
  `import-new`. The disposition logic is not wrong; the file no longer carries
  what it needs.
- Reopening a Blender-written GLB **as a face** would lose the whole bundle —
  graphs, poses, profiles, skills — and `RobotData` with it, which is what
  carries the baked `rootBounds`.

## The path that does work

Import the animations only, through `app-import-glb-animations-input` (File
menu, the glTF-animations entry) rather than reloading the face. Measured: a
session with 2 clips became **4** — the originals kept alongside the two
Blender versions. That is the outcome `keep-both-edited` exists to produce,
arrived at as `import-new` instead.

The edit survives. Decoded back through `readGltfAnimationDocument`, the
edited value reads **0.8429** against the 0.85 that was set. That is not loss:
Blender resamples fcurves onto whole frames when exporting glTF and the
keyframe sat at frame 29.6, so the nearest exported sample lands just off the
peak. A zero became a ~0.84, recovered out of a channel where Blender had
merged every morph target of the mesh into a single `weights` array.

Pinned by `src/animationImport/__tests__/blenderEditSurvives.device.test.ts`,
which skips when the fixture is absent because producing one needs Blender and
a person; its header records how.

## Can Blender be made to keep the bundle?

Not with a setting — there is no built-in passthrough for unknown extensions.
Checked in Blender 5.2.1's `io_scene_gltf2`: `passthrough_extension_data`
exists but is a hook _for add-ons_ to mark payloads that `__fix_json` must not
mangle, not a preservation feature.

It does take a companion add-on, and the hooks for it are there:

| hook                                                       | where                         | use                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `gather_import_gltf_before_hook(gltf)`                     | `blender/imp/blender_gltf.py` | fires before import with the parsed glTF; read `extensions.VIZIJ_bundle` and `RobotData` and stash them (e.g. a Scene custom property) |
| `gather_gltf_extensions_hook(export_settings, gltf)`       | `blender/exp/export.py`       | fires with the root glTF object being written; put the stashed extensions back onto it                                                 |
| `passthrough_extension_data(export_settings, names, gltf)` | same                          | name those extensions so `__fix_json` leaves their payloads alone                                                                      |

An add-on registers these as `glTF2ImportUserExtension` /
`glTF2ExportUserExtension`. Note the stashed bundle would be **stale** with
respect to anything the animator did in Blender — it is the bundle as it was
imported — so it preserves the graphs, poses and `rootBounds` but the clips
inside it would still disagree with the edited channels. Which is exactly the
case `keep-both-edited` was written for, and would make it reachable.

Two cheaper alternatives, in case the add-on is not worth it:

- **Re-inject after the fact.** `patchVizijBundleMetadata` in
  `@vizij/render` already rewrites a GLB's JSON chunk. A script could take
  Blender's output and re-attach the original bundle. Safe only while node
  indices still line up — that is, animation-only edits, not geometry changes.
- **Do not round-trip the file at all.** Keep the Vizij-written GLB as the
  asset of record and bring Blender edits back through the animation-only
  import, which is the measured working path above.
