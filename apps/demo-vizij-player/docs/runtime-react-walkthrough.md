# `demo-vizij-player` Runtime Walkthrough

`demo-vizij-player` loads one face GLB at a time and drives what its bundle
carries — rig inputs, poses, animations, programs — from panels built out of
what the GLB declares. It is the reference consumer of
[`@vizij/runtime-react`](../../../packages/@vizij/runtime-react/README.md)
and [`@vizij/render`](../../../packages/@vizij/render/README.md): every panel
calls the face's `Runtime` from `@vizij/runtime` directly.

## 1. The model

- **One canvas per page.** `<VizijCanvas>` renders the page's canvas, on which
  `@vizij/runtime`'s Bevy view draws every face. The slot
  `<VizijRuntimeFace>` marks where this face draws.
- **One face, one device.** `VizijRuntimeProvider` loads the GLB with
  `loadVizij`: the face is an Arora device composing its bundle's graphs,
  with the animation, rest and viseme modules linked in. The provider hands
  out the device's `Runtime` and `describe(glb)`.
- **Everything else is a call on the `Runtime`.** Rig inputs and pose weights
  are store writes (`setValue`, `writeValues`), the reset and the animation
  transport are methods called by name (`invoke`), programs are runs of the
  device's interpreter (`run_behavior`, `halt`).

## 2. Loading a face

[`src/data/samples.ts`](../src/data/samples.ts) turns a source into the GLB
the provider takes: the curated sample's URL, or an uploaded `File`.

```tsx
<VizijRuntimeProvider
  key={source.id}
  glb={glb}
  vizijId="player"
  options={{ graphs: ["rig", "pose-driver", "pose"], program: "none" }}
>
```

- `key={source.id}` gives each source a provider of its own.
- `graphs` composes the face's own rig, pose driver and poses — not its
  standard adaptation, which writes the pose weights every step and would
  take them over from the Poses panel.
- `program: "none"` starts no program at load: the Programs panel starts
  them.

## 3. The face's description

`useVizijRuntime()` returns `status` (`loading`, `ready`, `error`), `error`,
`runtime` and `description`, what `describe(glb)` read from the GLB:

| Field                     | Used by                                          |
| ------------------------- | ------------------------------------------------ |
| `graphs` (`{ id, kind }`) | the overview and the diagnostics' graph list     |
| `rigInputs`               | Face controls: sliders with ranges and defaults  |
| `poses`, `poseGroups`     | Poses: the buckets and each pose's weight        |
| `animations`              | Animations: each one's name, duration and tracks |
| `programs`                | Programs: each one's id, label and graph         |
| `faceId`, `metadata`      | the overview                                     |

[`src/lib/bundleSummary.ts`](../src/lib/bundleSummary.ts) folds it into the
overview's counts and labels.

## 4. Face controls

[`FaceControlsPanel`](../src/components/FaceControlsPanel.tsx) builds its
sliders from `description.rigInputs`: the blink and eight featured scalars.
Each slider writes its input under the face's prefix:

```ts
runtime.setValue(runtime.path(input.path), value);
```

The eye positions and the idle-motion tuning stay with the face: its gaze
follows the eye positions, and the panel offers no slider for them.

## 5. Poses

[`PosePanel`](../src/components/PosePanel.tsx) groups `description.poses` by
`poseGroups` and drives each pose through its weight,
`runtime.path("poses/<id>.weight")`:

- a pulse writes 1, then 0 after 450 ms;
- a hold writes 1 to one pose and 0 to every other;
- the reset is the rest module's `invoke("reset")`: every key the face's
  graphs read back to its rest.

## 6. Animations

The face's animations load with it, each on a player named after its id,
its instance at weight 0 and stopped. The animation source writes every
player's state to `ANIMATION_PLAYERS_PATH` each step;
[`AnimationPanel`](../src/components/AnimationPanel.tsx) reads it with
`useVizijValues` and `decodePlayerStates`, and calls the module's transport
by name:

```ts
const id = { player: { u32: player.player } };
await runtime.invoke("seek", { ...id, time_ns: { u64: 0 } });
await runtime.invoke("set_weight", {
  ...id,
  instance: { u32: instance },
  weight: { f32: 1 },
});
await runtime.invoke("play", id);
```

Stop is `stop`, weight 0, and `reset_keys` of the animation's track keys: a
stopped player still writes its first frame at its weight.

## 7. Programs

A program runs beside the face's graph as a run of the device's
interpreter. [`ProgramsPanel`](../src/components/ProgramsPanel.tsx):

- **play** starts a run: `invoke("run_behavior", { name, behavior })`, with
  `behaviorValue(program.graph)`; it resolves to the run's `RunHandle`, whose
  `status` key `useVizijValues` follows;
- **pause** halts the run (`halt(run.run)`), its outputs holding their last
  values; playing again starts a new run;
- **stop** halts it and returns its outputs to rest:
  `invoke("reset_keys", { keys: { strs: await outputKeys(program.graph) } })`.

## 8. Diagnostics

[`DiagnosticsPanel`](../src/components/DiagnosticsPanel.tsx) shows what the
device lists of itself, through Arora's ListKeys: the runs under
`BEHAVIOR_RUNS`, and the keys under the face's prefix with the shape its
store declares. It also shows the bundle's graphs and metadata, the load
error and the device's standing behavior error.

## 9. Evidence

`e2e/tests/demo-vizij-player-load-sample.spec.ts` loads the sample, waits for
the slot's `data-vizij-ready`, checks the canvas is not uniform, moves the
blink slider against the face's idle change, and plays an animation until its
player reads `playing`.
