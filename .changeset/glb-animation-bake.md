---
"vizij-authoring": minor
"@vizij/runtime-react": minor
---

Bake authored animation clips into the exported GLB.

Authored clips drive abstract rig inputs and pose weights, not node channels,
so baking evaluates the exported graph over time and records what it writes —
a one-track clip on `lids_blink` can become dozens of node channels. Sampled
at 30fps, decimated with Ramer-Douglas-Peucker, recombined into glTF vector
and morph tracks, and validated against the export root before `GLTFExporter`
gets a chance to discard a whole clip over one bad binding.

Baking is on by default and covers every authored clip. The graphs it samples
through are read out of the bundle being exported, so the baked motion comes
from the same graph the bundle ships.

Material channels still have no glTF equivalent and are reported by name in
the export preflight rather than dropped silently.

`@vizij/runtime-react` now exports `composeGraphSpecs`, so a host can compose
the way the provider does instead of maintaining a second implementation that
is free to drift from the one that plays.
