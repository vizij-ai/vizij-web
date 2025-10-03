# Rig Graph Construction Guide

This note explains how the _demo-render-no-rig_ app turns a low-level rig definition and the animatables exposed by the Vizij renderer into a node graph that can be inspected and edited. The target reader already understands the graph editor UI and node concepts, but wants to see how a rig channel becomes a collection of graph nodes wired to a renderer animatable.

## Source Data

The generator operates in `apps/demo-render-no-rig/src/rig/rigGraphGenerator.ts` and consumes three inputs:

- **Face identifier** – the `id` from `FaceConfig` (see `apps/demo-render-no-rig/src/data/faces.ts`) so paths can be namespaced per face.
- **Low-level rig definition** – a `LowLevelRigDefinition` from `@vizij/config` (`packages/@vizij/config/src/rigs.ts`). It describes channels, the tracks they expose (`pos`, `rot`, `scale`, `morph`, etc.), optional axis restrictions, and optional `mapFunc` helpers.
- **Renderer animatables** – the grouped list returned by `useAnimatableList`. Each `AnimatableListItem` carries an `id`, a user-facing `name`, its `type`, and the renderer-provided `default` value.

The generator’s job is to align rig tracks with renderer animatables and then author a minimal set of graph nodes that apply rig inputs to those animatables.

## Step 1: Matching Rig Tracks to Animatables

`buildRigGraph` flattens the animatable groups into a single lookup keyed by `item.name`. For every `(channelName, trackName)` pair in the rig definition it builds a **search key**:

```
shapeKey + " " + track suffix
```

The suffix depends on the track kind (`pos` → `translation`, `rot` → `rotation`, `scale` → `scale`, `morph` → `Key N`, custom names fall back to the literal track name). For example, the Quori `mouth.pos` track produces `"Plane translation"`, which matches the renderer animatable of the same name. If a match is found, node generation proceeds; otherwise the track is skipped silently.

## Step 2: Node Scaffolding Per Track

All nodes are shaped as `GraphNodeState` objects with sanitized IDs (non-alphanumeric characters replaced by `_`). Each track follows one of two pipelines.

### Morph Tracks (scalar curves)

1. **Rig Input node** – `type: "input"`, category `Rig`, path `rig/<face>/<channel>/morph`. Default input values come from `TRACK_DEFAULT_INPUT` (`0` for morph). This node represents external controller input.
2. **Base constant** – `type: "constant"`, category `Rig`, holding the renderer’s default morph weight (usually `0`).
3. **Add node** – `type: "add"`, category `Math`, sums the rig input and the base. The output keeps a scalar value.
4. **Rig Output node** – `type: "output"`, category `Rig`, path set to the renderer animatable `id` (e.g. `Vec3MorphBlend.X`). The graph records this node’s `id` in `outputNodeToAnimId` so downstream tools know which animatable each output drives.

The result is a simple additive offset: incoming morph deltas are added to whatever the face author baked into the model.

### Pos / Rot / Scale Tracks (vector curves)

1. **Axis inputs** – For each requested axis (`track.axis` or `[x,y,z]` by default) we create an `input` node routed to `rig/<face>/<channel>/<track>/<axis>`. Missing axes receive a `constant` fallback (`0` for pos/rot, `1` for scale) so joins always receive three values.
2. **Join node** – `type: "join"`, category `Vectors`, combines the axis scalars into a vector. This matches the renderer’s expected value kind (`vec3`, `vector`, etc.).
3. **Scale compensation** – If the rig track ships a `mapFunc` that performs static scaling, `parseScaleVector` reads the function source and extracts `x`, `y`, `z` factors. When any factor differs from `1`, a `vectorconstant` is introduced and a `vectormultiply` node applies the scale to the joined vector.
4. **Base vector** – Another `vectorconstant` captures the renderer’s default pose (`anim.default`). For scale defaults we coerce missing components to `1`; everything else defaults to `0`.
5. **Base combination** –
   - `scale` tracks multiply the incoming vector by the base (since scale defaults tend to be multiplicative)
   - `pos` and `rot` tracks add the base vector to the incoming offset
6. **Rig Output node** – Same as the morph case, but with `outputValueKind` set by `toValueKind` so the graph editor displays the right widget.

The pattern yields a predictable mini-graph per track: inputs → optional scale multiply → base combine → output.

## Step 3: Graph Metadata

After processing all tracks, `buildRigGraph` assembles:

- `nodes` – the full list of node definitions.
- `inputs` – a deduplicated string array of every `rig/...` path touched by `input` nodes. This drives the orchestrator bridge UI so users can see which rig inputs exist.
- `outputs` – a deduplicated array of the renderer animatable IDs we ultimately touch.
- `outputNodeToAnimId` – a lookup used in `App.tsx` to seed the orchestrator bridge (`setRigOutputMap`). It maps the output node IDs to their corresponding renderer animatable IDs.

If no tracks map successfully, the function returns `null`, leaving the app in manual mode.

## Worked Example: Quori Mouth Position

Take the `mouth.pos` track in `QuoriLowLevelRig`:

```ts
mouth: {
  shapeKey: "Plane",
  tracks: {
    pos: { axis: ["x", "y"] },
    // ...
  },
},
```

1. **Match** – `shapeKey` = `Plane`, track kind = `pos`, so search key `"Plane translation"` matches the renderer animatable with default `{ x: 0, y: 0, z: 0 }`.
2. **Inputs** – The rig only lists `x` and `y`. The generator creates input nodes for `rig/quori/mouth/pos/x` and `rig/quori/mouth/pos/y`, plus a fallback constant `1` for `scale` or `0` for `pos` (in this case `0`) on the missing `z` axis.
3. **Join** – A `join` node merges `[x, y, zFallback]`.
4. **Scale** – No `mapFunc` is present, so no additional multiply is added.
5. **Base** – The renderer default `{ x: 0, y: 0, z: 0 }` becomes a `vectorconstant`.
6. **Combine** – Since this is a `pos` track, we create a `vectoradd` node that adds the base to the joined vector.
7. **Output** – Finally, a rig output node targets the renderer animatable ID (e.g. `Plane.translation`).

The resulting graph section has a clean “inputs → join → add → output” flow that offsets the default translation by whatever the rig input provides.

## Scale Map Function Example: Hugo Eyelid Position

For `HugoLowLevelRig.left_eye_top_eyelid.pos`, the rig authors provided a custom map function that calls `rig.scaleV3fTrackValue(..., { x: 1, y: 10, z: 1 })`. The generator detects the `{ x: 1, y: 10, z: 1 }` literal, inserts a `vectorconstant` with `[1, 10, 1]`, and multiplies the joined inputs by this vector before adding the base pose. This mirrors the behaviour of the runtime rig (`mapFunc` would have applied the same scaling) so the generated graph faithfully matches the authored behaviour.

## Common Patterns and Extensions

- **Path convention** – All rig inputs use `rig/<faceId>/<channel>/<track>/<axis?>` paths. Orchestrator tools can rely on this for routing values back into the graph.
- **Defaults and bases** – Scalar defaults are `0` (except scale = `1`); vector defaults come from the renderer’s animatable `default`. This ensures the graph reproduces the authored neutral pose when rig inputs are `0`.
- **Missing matches** – If a rig track cannot find a renderer animatable (naming mismatch, missing export), it is skipped. Update either the `shapeKey` or the renderer naming to restore the link.
- **Custom track kinds** – Unknown track names still produce inputs and outputs, but the generator falls back to treating them as scalars with literal names (`shapeKey <trackName>`). Add new cases to `resolveTrackKind` if you need richer handling.
- **Map function parsing** – Only literal `{ x: ..., y: ..., z: ... }` patterns are extracted today. If you rely on dynamic logic in `mapFunc`, mirror that logic explicitly in the graph or extend `parseScaleVector`.

## Where the Graph Is Used

In `apps/demo-render-no-rig/src/App.tsx`, the generated graph seeds both the on-screen graph editor and the orchestrator bridge:

- `setGraphState(structuredClone(rigGraph.graph))` populates the node editor so users can inspect or tweak the auto-generated rig section.
- `setRigOutputMap(rigGraph.outputNodeToAnimId)` lets the orchestrator UI keep its node-to-animatable routing aligned.

If a face lacks a rig, the app falls back to an empty graph and manual animatable control.

## Next Steps for Contributors

When authoring a new rig or face:

1. Follow the naming conventions (`shapeKey translation`, `shapeKey Key 1`, etc.) so the generator can find matching animatables.
2. Provide `axis` arrays to limit inputs when a track only needs specific components.
3. If you add new transformation logic to `mapFunc`, update the generator so the graph mirrors it.
4. Rebuild and reload the app; the graph should regenerate automatically once the renderer exposes the new animatables.

Use this guide as a reference when validating that the generated graph matches the intended rig behaviour.
