# Adopting `@semio/animation` for the Timeline

Decided 2026-09-03: **adopt `AnimationSheet` wholesale** rather than build our
own timeline, on the basis that the `@semio/ui` port is already planned — so the
design-system cost is being paid regardless.

This supersedes the build-it-ourselves phasing in
`TIMELINE_POLISH_PLAN_2026-09-03.md`. That document stays as the record of what
our current timeline does and does not do; its rubric references remain the
parity checklist here.

## What we are adopting

`@semio/animation@0.2.1` (MIT, from the private `semio-ai/semio_studio`, which
is actively developed). Per its README: a **canvas-based timeline editor
rendered with react-three-fiber**, themed with `@semio/ui`, driven by the player
and values stores in `@semio/utils`. `AnimationSheet` takes almost no props — it
owns its data model and store.

It already covers most of what our audit found absent: box select, clipboard,
`animationKeybindings`, keyframe skipping, per-track mute/lock/visibility,
hierarchical `TrackGroup`, viewport zoom/pan/edge-scroll, per-key cubic-bezier
transitions with ease presets, and `clampMonotonicCubicSegment` (the
handle-monotonicity guarantee, rubric 3.7). It also goes beyond our rubric with
`computeTrackViolations` and position/velocity/acceleration trajectory types —
joint-limit checking we have never scoped.

## Why the data mapping is tractable

Its runtime model is our _runtime's_ model, not our authoring model:

```ts
Track    { id, name, points, animatableId, settings{ color, muted } }
Keypoint { id, stamp /* ms */, value, transitions }
```

That is the stored clip shape `@vizij/animation-module` consumes. Two further
alignments:

- Their **format v1 is normalized `[0,1]` stamps with a duration** — exactly
  what our bundle clips use today. v2 moved to absolute milliseconds and
  `migrateAnimationData` already exists.
- `@semio/utils` exports `getLookup`, `getId`, `getNamespace`,
  `AnimatableValue`, `RawValue` — the same helpers `vizij-authoring` imports
  from `@vizij/utils`. They are sibling forks, so value semantics already agree.

Versions line up too: react 19, three 0.170, zustand 5, Tailwind 4.

The odd one out is our **authoring** IR (`AnimationClipIR`: `channel`, seconds,
per-key `interpolation` + `inTangent`/`outTangent`). Phase 2 is about that seam.

---

## Phase 0 — stop losing authored clips

Carry over A0 from the polish plan unchanged: the autosave effect
(`App.tsx:1647`) cannot distinguish an edit from a reset, so any of the five
`useAnimationStore.getState().reset()` sites that leaves a target selected
persists an empty clip over saved work.

Do it even though our store is scheduled for retirement. The migration will take
weeks, and shipping a known data-loss path for that long is not acceptable. Fix
is small: record which target the store was hydrated from and refuse to persist
when it disagrees with the selection.

## Phase 1 — spike behind a flag

Prove it mounts in _our_ build before designing around it.

- Add `@semio/animation`, `@semio/ui`, `@semio/utils` — **pinned to exact
  versions.** They declare `@semio/ui: "*"` and `@semio/utils: "*"`, which must
  not reach our lockfile as floating ranges.
- **Verify `three` resolves to a single instance.** `@vizij/render` and
  `@semio/animation` both use three, and two copies break every `instanceof`
  across the boundary. This is the most likely way the spike fails.
- Render `AnimationSheet` in a dev-only panel with `createAnimationStore` seeded
  from a fixture clip. Confirm its CSS (`styles.css`, `theme.css`) does not
  collide with ours, and that a canvas-in-panel layout behaves.

Exit criterion: the sheet renders and a keyframe can be dragged. Nothing wired
to the runtime yet.

### Phase 1 findings (2026-09-03)

Spike lives at `src/components/animation/spike/SemioAnimationSheetSpike.tsx`,
reachable at `?semioSpike=1`, which renders it _instead of_ the app — no face
load, no runtime, no shared store.

**Resolved — the risk that would have killed adoption.** `three` resolves to a
single `0.170.0` and `react` to a single `19.2.3`, with `@react-three/fiber`
9.5.0 and `drei` 10.7.7 both bound to them. `three` is now pinned in
`pnpm.overrides` alongside `@semio/ui` and `@semio/utils`, which the package
declares as `"*"` and which must never reach the lockfile as floating ranges.

**It mounts and runs.** `AnimationSheet` renders with `createAnimationStore()`,
producing three canvases and real chrome — "Key View", "No tracks", "Normal
Playback (1x)" — with no crash and no console errors. Vertical layout is
correct: for a 360px sheet the canvases measure 144 / 356 / 144.

**Its published CSS does not resolve.** A real upstream packaging bug:

- `./styles.css` and `./theme.css` map to `./src/*.css`, and `src` is not in
  the published tarball;
- `./dist/styles.css` is exported and exists, but contains _unbuilt_ Tailwind
  (`@import "tailwindcss"; @source "../src"`) pointing at that missing source;
- `./dist/theme.css` exists on disk but is absent from `exports`, so Vite
  rejects the bare specifier outright.

Worked around in `spike/spike.css` by importing the theme via relative path
(bypassing `exports`) and pointing Tailwind's `@source` at their compiled
`dist` so it emits the utilities their class names use. Verified: their
`grid w-full` computes as `display: grid`, so scanning works. Deliberately
**not** in the app's global stylesheet — their `theme.css` is an `@theme` block
defining `--color-primary` and friends, which would override our tokens
app-wide.

Adoption needs this fixed upstream or a committed `pnpm patch`. Given we have
influence over the repo, upstream is preferable.

**Open.** Horizontal layout collapses in the bare spike harness (`#root` has no
intrinsic size outside the app shell, and the sheet's host measures 0 wide).
Heights propagate correctly, so this reads as a container concern rather than a
mount failure, but it is unverified — the hidden browser pane throttles timers
to ~8s and freezes `requestAnimationFrame`, which R3F needs to size and draw,
so this is best confirmed in a real browser.

## Phase 2 — model adapter

A bidirectional adapter between `AnimationClipIR` and their `Track`/`Keypoint`,
built as a pure function pair with round-trip tests — the same shape as
`animationImport/convertGltfAnimations.ts`, which exists precisely because this
kind of conversion needs to be testable without a device.

Seams to resolve, each with an explicit lossless/lossy verdict recorded:

| Seam             | Ours                                               | Theirs                                                                    |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------- |
| Time             | seconds                                            | milliseconds (v2)                                                         |
| Channel identity | `channel` path + `variableId`                      | `animatableId`                                                            |
| Easing           | per-key `interpolation` + `inTangent`/`outTangent` | `transitions` as in/out cubic-bezier control points _around_ the keypoint |
| Grouping         | flat                                               | `TrackGroup` hierarchy                                                    |

The channel-identity seam is already solved elsewhere: `animationBake/bakeChannelIndex.ts`
maps animatable ids to canonical propsrig channels off `world`/`animatables`.
Reuse it rather than deriving a third mapping — deriving path mappings twice is
what produced both major defects in the export work.

Their transition model is richer than ours, so IR → theirs is lossless and
theirs → IR is lossy. Decide deliberately whether the authoring model _becomes_
theirs (preferred, removes the seam) or whether we keep the IR as the persisted
form and treat theirs as a view model.

## Phase 3 — player bridge

Their `usePlayerStore` is a host-side player (`playPlayer`, `pausePlayer`,
`resetPlayer`, `updateSpeed`, `updateDirection`, `updateLooping`,
`updateBounce`, `updatePlayerBounds`). Ours is **device-authoritative**: clip
playback ticks inside wasm and the playhead comes from `getAnimationState`.

The bridge must have one source of truth, and it is the device. Their player is
a mirror: transport actions route to `playAnimation`/`pauseAnimation`/
`seekAnimation`, and the device's playhead drives their player state.

Treat this as the highest-risk phase. Five playback defects earlier in this
branch all lived at exactly this boundary — two stores that must agree, with
nothing asserting they do. Requirements:

- Real-device tests, in the manner of
  `packages/@vizij/runtime-react/src/__tests__/animationComposed.device.test.ts`.
  No fake-device assertions on call payloads: those are what let all five
  defects coexist with a green suite.
- An explicit invariant that the mirror never writes back a value it derived
  from the device.
- Their `direction`/`bounce` have no device equivalent yet — either implement or
  disable in the UI, not silently ignore.

## Phase 4 — values bridge

`AnimationSheet` reads live values from `@semio/utils`' `useValuesStore`. Our
values live in the device store. Bridge one way (device → values store) and
verify key agreement: both sides descend from the same `getLookup`, but confirm
rather than assume, and note that namespacing bit us once already.

## Phase 5 — parity and cutover

Run both timelines behind a flag. Parity is measured against the rubric in the
polish plan, and against the features that are _ours_, which must not be lost:

- **Auto-key from the Inputs panel** (`VariablesPanel.tsx:5742`) and
  key-a-whole-pose (`:5826`). Genuinely uncommon; verify their
  `AnimatableControl` covers it or keep ours.
- **`detached` track semantics** — retained-but-not-played tracks that survive a
  rename. Their `setSourcesReadonly`/`setAnimationReadonly` may map; confirm.
- **Deterministic per-track colours** from a hash of `variableId`. They have
  `settings.color`; keep the derivation.
- **Import dedupe** by content signature, and the bake channel mapping.

Then delete `TimelineEditor.tsx`, `TrackRow.tsx`, `AnimationPanel.tsx`,
`animationStore.ts`, and whatever of `useAnimationTransport.ts` the bridge
replaces.

## Risks

1. **Two copies of `three`.** Breaks instanceof silently. Check in Phase 1.
2. **Floating `@semio/*` ranges.** Pin, and add a check that they stay pinned.
3. **Private, single-consumer upstream** (26 downloads/month). Mitigated by the
   `@semio/ui` port being planned and by influence over the repo, but API
   stability is still not contractual.
4. **Canvas a11y.** The rubric's §8 items become unreachable rather than
   pending. Accepted as part of adopting; worth stating plainly rather than
   quietly dropping from the checklist.
5. **Store duplication during migration.** Two animation stores coexist behind
   the flag. Keep the flag short-lived.
