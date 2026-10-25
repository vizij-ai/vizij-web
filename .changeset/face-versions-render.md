---
"@vizij/render": minor
---

`VizijBundleMetadata` types the bundle's `metadata` (`VizijBundleExtension.metadata`): open-ended as before, with `faceId`, `hardwareVersion` and `softwareVersion` typed. `hardwareVersion` is the version of the face itself — its shapes, what can move in them, and the layout giving those movements their meaning — such as `quori-1.3`; `softwareVersion` the version of what the face runs — its profiles, exposed inputs, programs, extra rigs and animations — such as `1.2`. A device showing a face that states no hardware version reports its `faceId` instead.
