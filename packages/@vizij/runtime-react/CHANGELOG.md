# @vizij/runtime-react

## 0.4.0

### Minor Changes

- 556b721: Bake authored animation clips into the exported GLB.

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

### Patch Changes

- 64bbc65: Fix the animation transport clock and seeking.

  `getAnimationState` reported `time: 0` whenever the module's `player_states`
  feedback was unavailable, while `duration` and `playing` fell back to commanded
  values. The transport therefore showed a clip as playing, with the correct
  duration, and a playhead frozen at zero — and because the transport polls that
  state every frame, it also overwrote any seek, making the timeline scrubber
  appear inert even though the device was sampling the clip correctly.

  Three changes:
  - `ClipPlaybackState` now carries a host-side `playhead`, advanced from engine
    `dt` while playing and re-based by `seekAnimation`/`playAnimation({reset})`/
    `stopAnimation`. `getAnimationState` falls back to it instead of a hard `0`,
    so the transport has a monotonic clock even with no device telemetry.
  - The animations graph source is now reconciled against the host on every
    step: if any clip is playing, the source is composed. That source is what
    calls the module's `step`, so a clip marked playing without it has a live
    player that never advances and never writes a value — indistinguishable from
    working, from the outside. Registration was previously commanded from each
    transport call site, and any path that missed it (a play issued before the
    module finished loading, for instance) left that state permanently because
    nothing re-derived it. **This is the fix for animation playback producing no
    motion at all.**
  - `decodePlayerStates` additionally accepts the store's `ValueJSON` list/record
    encoding alongside the module ABI's `{structs: …}`, and reports an
    unrecognised shape once in development rather than degrading silently. Note
    the ABI shape is what a real device actually emits (verified against the
    wasm), so this is defensive rather than a fix.
  - New `animationPipeline.device.test.ts` boots the real Arora runtime with the
    real animation module and asserts sampled values reach the store, that the
    player-state feedback decodes, that a device rebuild keeps producing values,
    and — as a control — that nothing is written when the animations source is
    absent. Every pre-existing animation test asserted call payloads against a
    fake device, so the entire pipeline could be broken while they all passed.
  - `playAnimation` called before the animation module finished loading dropped
    the command silently — the warning claimed "playback starts once it is
    ready", but nothing re-issued it, so a play during startup was lost for good
    while the transport still reported the clip as playing. Controller
    registration, the first point where the host and its clips both exist, now
    replays transport for any clip already marked playing, and finishing the
    module load now forces a re-registration. Without that, the module only
    loads once a clip appears, so a play issued right after an import raced it:
    the command was dropped, no later registration ever ran, and the clip never
    reached the module at all. Resuming also registers the animations graph
    source and restores the active step cadence — marking a clip playing is not
    sufficient, because the module only ticks while its source is composed, so a
    resume that skipped that left the clip "playing" with a live player that
    never advanced and never wrote a value.
  - A failing graph tick is now reported. `Runtime.behaviorError` was never read
    anywhere in this package, so a graph that threw every tick stopped every node
    — rig, pose, and the animation module's step alike — while the runtime kept
    running and the last rendered frame stayed on screen. One `input` node with
    neither a staged value nor a default is enough to cause it, and nothing
    surfaced it. `stepRuntime` now reports each distinct error once via
    `pushError`.
  - New `animationComposed.device.test.ts` runs the animations source composed
    with a consumer graph — the app's real topology — and asserts the module's
    writes are readable by another source's `input` node, that the tick stays
    healthy, and that the consumed value keeps advancing. It documents the
    one-tick lag between the module writing and a consumer reading.
  - The animation bridge's signature comparison is now tolerant of millisecond
    quantization. A clip's duration round-trips through the runtime as integer
    milliseconds, so `21.958334s` came back as `21.958s` and an exact comparison
    never converged: `transportRuntimeReady` never latched, the bridge re-applied
    the bundle on every change, and playback restarted every couple of seconds.
    Clips whose duration happens to be ms-exact (a round 5s, say) were
    unaffected, which is why this only showed on some assets.
  - **Animation target keys are now namespaced.** Registration rewrites every
    graph node's `params.path` to the namespaced form, and `setInput` namespaces
    staged writes to match — but the animation module's resolved target keys were
    left bare. The module therefore wrote correct sampled values to keys nothing
    reads: the clip loaded, the player ran, the values were right, and the face
    never moved, while the Inputs surface (which does namespace) worked fine.
    This is the reason animation playback produced no motion.

## 0.3.1

### Patch Changes

- be44e99: Require `@vizij/runtime` ^2.3.0 — the releases that ship the standard-profile registry (`standardProfiles()` / `standardProfile(id, rigPrefix)`) and `composeFace()` — so one runtime version serves the preview provider, the authoring app's profile picker, and the deploy-and-verify test loop.
- Updated dependencies [b48bd8c]
- Updated dependencies [f63fde7]
- Updated dependencies [1eaa5bf]
  - @vizij/node-graph-authoring@0.2.1
  - @vizij/render@0.1.2
  - @vizij/utils@0.2.0

## 0.3.0

### Minor Changes

- Track `@vizij/runtime@2.0.0`, whose client API renamed the "device"/"Arora"
  vocabulary to "runtime" (`startDevice`→`startRuntime`, `AroraDevice`→`Runtime`,
  `DeviceModule`→`RuntimeModule`). This package's own hooks are unchanged; the
  re-exported `DeviceModule` type is now `RuntimeModule`.

## 0.2.0

### Minor Changes

- c70b674: Move to the value-unification wasm line: @vizij/animation-wasm 0.4,
  @vizij/node-graph-wasm 0.7, @vizij/orchestrator-wasm 0.4, @vizij/value-json
  0.2. The engines emit values in arora serde; every read path decodes through
  the @vizij/value-json accessors (which also accept the legacy forms), and
  values sent into the engines may stay legacy. Code that pattern-matched raw
  value JSON shapes must switch to the accessors.
- 2ffda39: Add transport controls for bundled procedural programs discovered from exported `motiongraph` bundle entries. The runtime now exposes program discovery plus `playProgram`, `pauseProgram`, `stopProgram`, and `getProgramState`, and standalone/browser consumers can surface bundled animations and procedural programs from the loaded asset.

### Patch Changes

- Updated dependencies [c70b674]
- Updated dependencies [22c1a61]
- Updated dependencies [6e7a15e]
  - @vizij/orchestrator-react@0.2.0
  - @vizij/node-graph-authoring@0.2.0
  - @vizij/render@0.1.1

## 0.1.0

### Minor Changes

- a53152b: React 19 support and dependency refresh
  - React 19 compatibility across Vizij React packages.
  - Update wasm wrapper dependencies to the latest published `@vizij/*-wasm` versions.
  - CI/release workflow updates (Node 24; npm publish via OIDC).

### Patch Changes

- Updated dependencies [a53152b]
  - @vizij/node-graph-authoring@0.1.0
  - @vizij/orchestrator-react@0.1.0
  - @vizij/render@0.1.0
  - @vizij/utils@0.1.0

## 0.0.14

### Patch Changes

- ed31344: Updated to latest vizij-rs dependencies
- Updated dependencies [ed31344]
  - @vizij/orchestrator-react@0.0.7
  - @vizij/render@0.0.7
  - @vizij/utils@0.0.3

## 0.0.13

### Patch Changes

- Updated dependencies
  - @vizij/render@0.0.6

## 0.0.12

### Patch Changes

- Updated dependencies [a9b5118]
  - @vizij/render@0.0.5

## 0.0.11

### Patch Changes

- Hard code render and utils

## 0.0.10

### Patch Changes

- Bump orchestrator dependency

## 0.0.9

### Patch Changes

- 3c8e659: Align React wrappers with the latest wasm releases and adjust tests to load the browser-safe wasm bytes directly so CI runs without fetch failures.
- Updated dependencies [3c8e659]
  - @vizij/orchestrator-react@0.0.6

## 0.0.8

### Patch Changes

- Adopt the browser-safe wasm bundles published from vizij-rs and fix the orchestrator StrictMode readiness guard so React 18 apps initialise without pending state.
- Updated dependencies
  - @vizij/orchestrator-react@0.0.5

## 0.0.7

### Patch Changes

- 3a19af3: Update dependencies

## 0.0.6

### Patch Changes

- Updated dependencies
  - @vizij/orchestrator-react@0.0.4

## 0.0.5

### Patch Changes

- a448d89: Fix asset bundle handling

## 0.0.4

### Patch Changes

- Align published dependencies for npm consumption and expose Vitest config helpers for the animation package to fix JSDOM test runs.
- Updated dependencies
  - @vizij/render@0.0.4

## 0.0.3

### Patch Changes

- Update for single glb import/export
- Updated dependencies
  - @vizij/render@0.0.3

## 0.0.2

### Patch Changes

- Update import and export process to save and consistently handle names
- Updated dependencies
  - @vizij/orchestrator-react@0.0.2
  - @vizij/render@0.0.2
  - @vizij/utils@0.0.2

## 0.0.1

### Patch Changes

- Seed initial changelog while preparing the first runtime preview release.
