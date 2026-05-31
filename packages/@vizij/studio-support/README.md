# @vizij/studio-support

Studio-canonical asset preparation helpers shared by Vizij runtime and authoring surfaces.

This package owns data preparation for Studio-compatible animation clips, bundle extraction, graph registration planning, and migration support that should not live inside the React runtime host.

## Boundary

This package is the Studio-support layer, not the runtime executor. It currently references Vizij render and orchestrator contracts for shared asset and registration types, but it does not own React lifecycle, renderer mutation, frame scheduling, or controller side effects.

`prepareRuntimeAssetView()` is the first runtime-facing seam: it turns an incoming asset bundle plus extracted GLB metadata into the prepared bundle and program list the runtime host should consume. `prepareRuntimeRegistrationPlan()` then turns that prepared bundle into graph configs, animation configs, output-path tracking, rig input maps, pose-control bridge metadata, and structured diagnostics. The React runtime host consumes those support outputs and performs the actual orchestrator calls.

Animation bridge helpers such as `sampleAnimationClipOutputValues()` and
`diffAnimationAggregateValues()` also live here so editor tooling and runtime
hosts share the same Studio-shaped sampling and output-diff behavior.

Animation transport helpers such as `buildAnimationControllerPlayInputs()` and
`prepareAnimationRegistrationForTransport()` live here for the same reason:
authoring tools and runtime hosts should use the same controller command paths
and Arora-owned playback registration behavior without importing React.

Pose path and pose runtime helpers live here for the same reason: authoring
surfaces and runtime hosts should agree on pose semantic classification, rig
path resolution, and pose-control fallback behavior without importing React.

Face-control discovery helpers also live here so authoring and runtime surfaces
use the same metadata-based gaze, blink, and normalized-control mapping rules.

Runtime input catalog helpers also live here so authoring UI surfaces can turn
runtime-extracted constraints and graph input paths into standard controls
without maintaining app-local copies of the mapping rules.
