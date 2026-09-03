---
"@vizij/runtime-react": patch
---

Fix the animation transport clock and seeking.

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
