# Why a pose captured at a frame can render differently

"Save frame as pose" stores the clip's input values at the playhead. What you
see on screen is those inputs _plus_ time, graph history, and any other active
driver. When those extras are non-trivial, no pose can reproduce the frame —
which is a representational limit, not a sampler bug.

Nothing here is fixed. This records what was measured, and which candidate
explanations survive.

## Three evaluation paths, one of which skips the graph

| path                             | how it evaluates                                                 |
| -------------------------------- | ---------------------------------------------------------------- |
| Save frame as pose               | `sampleTrackAt(track, time)` — raw track value, graph never runs |
| The GLB bake (what Blender sees) | `sampleClipThroughGraph` — steps the graph frame by frame        |
| What is rendered                 | the live runtime, stepping the graph every frame                 |

The bake and the render agree with each other. Pose capture is the odd one out.

Note this is _not_ the same defect as the two divergent keyframe samplers
fixed in `e74c3b8a` — those were two implementations of one function that
disagreed. Both paths now use one sampler. This is the layer above: one path
runs the graph and one does not.

## What the graph does to those values, measured

`src/animationBake/__tests__/poseVersusRender.device.test.ts` compares "played
to frame N" against "that frame's value applied and settled", on a real device:

| graph                              | played   | posed    | gap                   |
| ---------------------------------- | -------- | -------- | --------------------- |
| stateless (input → output)         | 0.500000 | 0.500000 | agrees to 10 decimals |
| one `damp` node, `half_life: 0.25` | 0.241802 | 0.500000 | **0.258**             |

So with smoothing in the path the gap is over half the range of a 0..1 ramp: a
pose settles to the raw input while playback is still catching up to it. A pose
holds input values, so it cannot carry "the damp node is 0.258 behind".

## But that is not the explanation for the shipped face

Scanning the graphs in `Quori_Current_Extended.glb` for history-dependent node
types (`spring`, `damp`, `slew`, `oscillator`, the noises, `time`):

| graph                             | nodes | stateful                                                       |
| --------------------------------- | ----- | -------------------------------------------------------------- |
| `quori_latest` (rig)              | 2116  | 1 `time`                                                       |
| `quori_latest_pose_graph`         | 317   | none                                                           |
| `authoring.motiongraph.program.1` | 249   | 13 perlinnoise, 8 simplexnoise, 3 spring, 7 time, 1 oscillator |
| `authoring.motiongraph.main`      | 16    | 1 time, 2 perlinnoise                                          |

The animation → rig → output path carries **no smoothing**. Every stateful node
lives in the procedural programs, which compose into the render as a separate
driver. So the mechanism above is real but almost certainly not the cause of an
observed pose/render difference on this face.

## Candidates that survive, in order

1. **A program running while the pose is captured.** Its 13 perlinnoise and
   3 spring nodes mean the screen shows animation _plus_ program. A pose
   captures only the animation's input values, so re-applying it later — with
   the program at a different phase, or stopped — looks different.
   **This is the one to check first, and it needs an observation nobody has
   made yet: was a program playing when the difference was seen?**
2. **The rig graph's single `time` node.** Anything downstream of it changes
   with wall-clock regardless of inputs, so the same pose renders differently
   at different moments.
3. **Capture scope and blend mode.** The `animated` scope drops inputs sitting
   within `NEUTRAL_EPSILON` of neutral, which is lossless only if apply starts
   from neutral; and applying a pose composes with whatever else is active
   under the current blend mode (Average vs Additive).

Input-range clamping was considered and ruled out: `src/poseRig/graphBuilder.ts`
clamps pose values to their input ranges when it builds the pose graph, so that
part agrees.

## What "fixing it at the core" would mean

Unifying the sampling paths does not help, because the difference is not in
sampling — a pose is input-space, a track is input-space, and the same number
goes in. The addressable version is to make capture honest about what it can
reproduce: at capture time, check whether the captured inputs fully determine
the output (no `time` or stateful node reachable from them, no program running,
no dropped-at-neutral input) and say so when they do not. All three are
detectable from data already in hand — the graph spec and the runtime's active
sources.

Reproducing the measurement:
`npx vitest run src/animationBake/__tests__/poseVersusRender.device.test.ts`
