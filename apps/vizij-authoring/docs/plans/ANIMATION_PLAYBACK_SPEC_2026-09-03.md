# Animation Playback: Expected Behavior

Date: 2026-09-03
Status: draft — written to be compared against actual behavior
Audience: engineers debugging or changing animation playback

Animation playback is currently broken on `main`: a clip reports as playing,
the transport advances, and nothing moves. Diagnosis has been slow because
there is no written statement of what the system is supposed to do, so every
observation had to be re-derived from code.

This document states the intended contract first. It is deliberately written
without reference to the current implementation, so the two can be compared
rather than conflated.

## Scope

One authored or imported clip, played from the Animation panel, driving a
loaded face. Out of scope: pose blending, procedural graphs, speech-driven
motion.

## Vocabulary

| Term      | Meaning                                                              |
| --------- | -------------------------------------------------------------------- |
| Clip      | An `AnimationClipIR`: scalar tracks, each bound to a channel path    |
| Channel   | A rig input path a track drives, e.g. `propsrig/l_eye/scale/x`       |
| Transport | The user-facing play/pause/stop/seek surface and its clock           |
| Session   | The activation of one clip as the runtime's current animation source |
| Player    | The module-side object that advances one clip's playhead             |

## A. What the user should observe

1. **Play** — the face begins moving within one frame; the clock advances from
   the current playhead; the scrubber tracks it.
2. **Pause** — motion stops; the face holds its current pose; the clock holds.
3. **Stop** — motion stops; the playhead returns to 0; the face shows the
   clip's t=0 pose; `Play` resumes from the start.
4. **Seek** — the face jumps to the sought time whether or not the clip is
   playing; the clock reflects the sought time and does not snap back.
5. **Loop on** — playback wraps at the clip's duration without a visible
   discontinuity.
6. **Switching clips** — the previous clip stops contributing; the new clip
   plays from its own playhead.
7. **A clip that drives nothing** (all-constant tracks) is reported as such,
   not silently indistinguishable from a broken pipeline.

## B. Invariants

These are the properties worth asserting in tests, because each one, when
violated, produces "reports playing, nothing moves".

1. **Play implies ticking.** If the transport reports a clip as playing, the
   device must be advancing that clip's playhead. There must be no state where
   `playing == true` and the clip is not being sampled.
2. **Ticking implies writing.** If a clip is being sampled, its tracks' target
   paths must receive values every tick.
3. **Writing implies rendering.** A value written to a channel must reach the
   corresponding animatable and the renderer within one frame.
4. **The clock reflects the device.** The transport clock must be derived from
   the device's actual playhead, and must never report a placeholder (such as 0) when telemetry is unavailable — that is indistinguishable from "parked at
   the start".
5. **One owner per channel.** While a clip drives a channel, nothing else may
   write it. Manual input staging and animation output must not fight.
6. **Activation is idempotent and recoverable.** Pressing Play twice, or
   pressing Play before the runtime is ready, must converge on playing — a
   dropped command must be retried, not lost.
7. **Teardown is explicit.** Only switching clips and session reset (new face)
   may tear down the session. Pause, stop, seek, and re-registration must not.
8. **Silent failure is prohibited.** Any break in 1–5 must surface a
   diagnostic naming the stage that failed.

## C. The required sequence

For a clip to move the face, every step must complete. Any one failing gives
the observed symptom.

```text
 1. clip exists in authoring state                    (authoring)
 2. clip is selected                                  (authoring)
 3. session activated for that clip                   (authoring)
 4. clip published to the runtime, unmuted            (authoring bridge)
 5. runtime registers the clip as an asset            (runtime)
 6. animation module loaded                           (runtime)
 7. module host exists                                (runtime)
 8. clip handed to the host                           (runtime)
 9. clip loaded into the module; player + instance    (module host)
10. player commanded to play                          (module host)
11. animation graph source composed into the device   (runtime)   <-- easy to miss
12. device step loop running at active cadence        (runtime)
13. module steps, sampling the clip                   (device)
14. outputs written to each track's target path       (device)
15. rig graph reads those paths as inputs             (device)
16. rig graph writes the animatable outputs           (device)
17. changes drained to the render store               (runtime)
18. renderer applies them                             (render)
```

Steps 11 and 12 are the ones with no user-visible proxy: everything upstream
can look correct while the module never ticks.

## D. Failure taxonomy

Each row is a distinct fault with the same symptom. A diagnostic should be able
to name which one is active.

| Fault                         | Broken step | Distinguishing evidence                   |
| ----------------------------- | ----------- | ----------------------------------------- |
| Clip never published (muted)  | 4           | published clip has zero tracks            |
| Clip not registered           | 5           | runtime reports zero animations           |
| Module never loaded           | 6–7         | no host; play command dropped             |
| Clip not handed to host       | 8           | host does not know the clip               |
| Clip never loaded into module | 9           | no player id                              |
| Play never commanded          | 10          | player exists, state not playing          |
| **Source not composed**       | **11**      | player exists, target path never written  |
| Step loop suspended or idle   | 12          | wall-clock gap warnings; `dt = 0`         |
| Wrong target path             | 14–15       | path written, but no graph input reads it |
| Value clamped flat            | 16          | input range does not admit the curve      |
| Changes not drained           | 17          | store has values, render store does not   |

## E. Diagnostic requirement

Given how many stages share one symptom, the pipeline must expose a single
readable statement of where it stopped. A probe that reports source
composition, host knowledge of the clip, player id, and the current value at a
target path distinguishes most of the table above in one line.

This is not optional tooling: without it, each stage costs a round of
guess-and-check, which is exactly how this bug survived.

## F. What to compare against

Open questions to answer against the implementation, then record the answers
here:

1. Which steps in C are currently unverified by any test?
2. Which invariants in B have no test at all?
3. Is there a step whose failure produces no diagnostic?
4. Did playback ever work end to end after clip sampling moved into the device
   module, and is there a test proving it?

## G. Answers (resolved 2026-09-03)

Playback was fixed; the answers to F, recorded as found.

**1. Which steps in C were unverified?** Steps 12-18 — everything after the
module produces a sample. Every animation test asserted _call payloads_ against
a `FakeDevice`, so no test observed a value arriving anywhere. The defects below
all live in that unverified tail, which is why the suite stayed green through
all of them.

**2. Which invariants had no test?** The four that require a real device:
values reach the store, the graph consumes them, the playhead advances from
device feedback, and a rebuild keeps producing. All four now have tests in
`animationPipeline.device.test.ts` and `animationComposed.device.test.ts`, which
boot the real wasm.

**3. A step whose failure produced no diagnostic?** Yes, two. A graph tick that
raises `behaviorError` stopped everything silently — nothing read the field.
And a target-key mismatch (below) is _invisible by construction_: every stage
reports success because every stage did succeed.

**4. Did it ever work end to end after sampling moved into the device?** No, and
no test proved it either way. The root cause predates this work and reproduces
on `main`.

### Root cause

Registration rewrites every graph node's `params.path` to a namespaced form,
and `setInput` namespaces staged writes to match. The animation module's
resolved target keys were left **bare**, so the module wrote correct sampled
values to keys nothing read.

This is why the symptom was "nothing moves from the animation but it moves from
the inputs": the Inputs surface namespaces, so it lands on the key the graph
reads; the animation did not. Both paths call `device.setValue`, so the only
difference was the key — which is what made that one observation decisive.

### The other four, all pre-existing

| Defect                                                          | Symptom                                             |
| --------------------------------------------------------------- | --------------------------------------------------- |
| Animations source never composed when play preceded module load | live player that never ticks, sticky until teardown |
| `behaviorError` never read                                      | one failing tick silently stops everything          |
| Clip signature compared exactly across ms quantization          | clip restarts every ~2s                             |
| `getAnimationState` returned `time: 0` with no fallback         | transport clock frozen while audio/motion runs      |

### What keeps this fixed

`animationComposed.device.test.ts` asserts the mismatch directly: with bare
target keys the namespaced graph output stays exactly `0`; with namespaced keys
it rises above `0`. That test fails against every one of the five defects above,
which is the property the old fake-device tests lacked.
