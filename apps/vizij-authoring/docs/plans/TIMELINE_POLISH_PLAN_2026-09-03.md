# Timeline Editor Polish

Scope decided 2026-09-03: **the timeline editor only.** No curve editor. No
app-wide undo/redo — that is a separate, larger piece of work and is
deliberately out of scope here.

Priorities, in the order they were asked for: make the scrubber seamless, then
polish and properly expose the capabilities that already exist.

Acceptance criteria reference the audit rubric item numbers
(`TIMELINE_UI_RUBRIC`, 58 items across 8 categories, 27 of them table stakes).

## Why the surface is small but the data model is not

The whole authoring experience is ~930 lines of UI (`TimelineEditor` 285,
`TrackRow` 168, `AnimationPanel` 478) over ~1500 lines of logic
(`useAnimationTransport` 648, `animationStore` 850). Several capabilities are
fully supported by the IR, the store, and the evaluator and have **no UI at
all**:

- per-keyframe `interpolation` — accepted, normalized, compiled, honoured over
  the track default, and even _displayed_ in the Inspector, but no control sets
  it. `addKeyframe` hardcodes `interpolation: undefined`.
- `inTangent` / `outTangent` — round-trip through the compiler into a correct
  cubic Hermite evaluator. Nothing reads or writes them in the UI.
- `detached` — carries a careful doc comment about surviving renames, is
  excluded from the runtime bundle and from baking, and is **invisible in the
  timeline**. A track that will silently never play looks identical to a
  working one.

So a good deal of this plan is exposure, not construction.

## The undo problem, and what we do instead

There is no undo anywhere in the app (`AppMenuBar` renders Undo/Redo menu items
with no `onSelect` — inert but enabled-looking). Since app-wide undo is out of
scope, destructive timeline edits must be made **non-destructive by
construction** rather than recoverable. Two are live today:

1. `normalizeKeyframesForTrack` de-dupes on exact time through a `Map`, last
   write wins. Dragging a key onto an occupied time silently destroys one.
2. `setDuration` re-clamps every keyframe to the new end, so shortening a clip
   collapses all keys past it into one.

Phase C treats these as correctness bugs, not ergonomics.

---

## Phase A — the scrubber (the explicit ask)

| #   | Change                                                                                                                                                                                                                  | Rubric   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| A1  | Seek consistently from anywhere in the time area, including over track rows. Today `TrackRow`'s click handler calls `stopPropagation`, so clicking a track does not move the playhead while clicking 2px below it does. | 1.2      |
| A2  | Resume playback after a scrub if it was playing when the scrub began. Today scrubbing auto-pauses at ≥2px of movement (good) and never resumes (not good).                                                              | 1.2      |
| A3  | Add a drag threshold (~3px) before a scrub or a keyframe drag commits, so a plain click does not nudge time or a key.                                                                                                   | 7.7      |
| A4  | Widen the playhead grab band to ≥16px and give the playhead its own cursor affordance, distinct from the ruler's.                                                                                                       | 1.3, 7.7 |
| A5  | Quantize the playhead to frames while scrubbing in Frames mode; hold a modifier for continuous. Today scrubbing is always sub-frame even when the readout says frames.                                                  | 1.9, 5.7 |
| A6  | Live time readout while scrubbing, at the pointer or in the transport clock.                                                                                                                                            | 7.4      |
| A7  | Make the current-time display an editable field. It is a `<span>` today, so there is no way back to an exact frame.                                                                                                     | 1.7      |
| A8  | Jump to start / end (`Home` / `End`).                                                                                                                                                                                   | 1.6      |

Two transport bugs fixed alongside, both pre-existing:

- **A9** — session-start Play calls `playAnimation(..., { reset: true, speed: 1 })`,
  which rewinds and ignores the speed dropdown, contradicting
  `UI_DESIGN.md:153-154` ("Play starts playback from the current playhead").
- **A10** — Step advances `1/30` s while the ruler's frame unit is 32fps, so
  "step" never moves exactly one displayed frame. Also add step-backward; the
  control is forward-only today. (1.4)

Existing behaviour worth **keeping**: runtime-authoritative clock, pointer
capture on the scrub with window-level listeners and correct teardown, and the
scrub auto-pause. A1–A6 build on that rather than replacing it.

## Phase B — keyboard basics

The surface has **zero** keyboard handlers today: no `onKeyDown`, no
`tabIndex`, no ARIA anywhere in the three animation files.

| #   | Change                                                                                                 | Rubric   |
| --- | ------------------------------------------------------------------------------------------------------ | -------- |
| B1  | `Space` play/pause, pausing in place.                                                                  | 1.1, 6.1 |
| B2  | `←`/`→` step one frame, `Shift` for a larger stride; `,`/`.` as aliases.                               | 1.4, 6.2 |
| B3  | `Delete` **and** `Backspace` delete the selected keyframe(s). Deletion is Inspector-button-only today. | 2.8, 6.4 |
| B4  | Timeline is a single tab stop with roving focus; arrows move focus within, `Tab` leaves.               | 8.3      |
| B5  | A visible focus ring, styled distinctly from selection.                                                | 8.4      |
| B6  | No shortcut fires while a text or numeric input holds focus.                                           | 6.7      |

B6 is cheap now and expensive later; it is the most common web-timeline bug and
we are adding the first shortcuts, so the guard goes in with them.

## Phase C — selection and safe edits

`selectedKeyframeId: string | null` in the store makes every batch operation
structurally impossible, so this phase starts there.

| #   | Change                                                                                                                                                        | Rubric    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| C1  | `selectedKeyframeIds: Set` in the store; `Shift+click` extends and toggles.                                                                                   | 2.1       |
| C2  | Box/marquee select across tracks and time; `Shift`+drag adds.                                                                                                 | 2.2       |
| C3  | Dragging any selected key moves the whole selection rigidly, preserving spacing.                                                                              | 2.3       |
| C4  | Snap dragged keys to frame boundaries by default; `Ctrl/Cmd` suspends. Today only 1e-6 s microsecond rounding exists — not frame snapping.                    | 2.4       |
| C5  | **Collision safety**: dropping a key on an occupied time must not silently destroy one. Clamp the drag, or replace explicitly — never merge by map-overwrite. | 2.13      |
| C6  | **Duration safety**: shortening a clip must not collapse every later key into one. Warn with a count, or clamp the duration to the last key.                  | 2.13, 7.6 |
| C7  | Keyboard nudge of the selection, ±1 frame and ±a larger stride.                                                                                               | 2.5       |
| C8  | Selection count reported somewhere.                                                                                                                           | 7.1       |
| C9  | Snap indicator during a drag.                                                                                                                                 | 7.5       |

C5 and C6 are the substitutes for undo. They are the reason this phase should
land before Phase D, even though zoom is more visible.

## Phase D — zoom, pan, fit

Today the visible window is always exactly `[0, duration]` and time→pixel is
percentage-based (`left: (kf.time/duration)*100%`), so **temporal resolution is
whatever the panel width happens to be** — roughly 15 ms/px for a 60 s clip in
a 900px panel, with no way to magnify. This is the hard cap on precision.

| #   | Change                                                                                                                                                                                                                                                                                  | Rubric   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D1  | A `pixelsPerSecond` + `scrollLeft` model replacing percentage mapping.                                                                                                                                                                                                                  | 5.1      |
| D2  | Pointer-anchored zoom (wheel / `+`/`-`).                                                                                                                                                                                                                                                | 5.1      |
| D3  | Pan without moving the playhead.                                                                                                                                                                                                                                                        | 5.2      |
| D4  | Fit-to-content on one key; zoom-to-selection.                                                                                                                                                                                                                                           | 5.3, 5.4 |
| D5  | Adaptive ruler tick density. Seconds mode emits one tick per second and frames mode one per 16 frames, so a 120 s clip renders 121 overlapping labels.                                                                                                                                  | 5.6      |
| D6  | Auto-scroll to keep the playhead visible during playback.                                                                                                                                                                                                                               | 5.8      |
| D7  | Clamp zoom and pan so content cannot be lost off-screen.                                                                                                                                                                                                                                | 5.9      |
| D8  | Consolidate the track-header width, currently encoded three times — a `TRACK_HEADER_WIDTH` constant, a bare literal `192` in `TrackRow`, and Tailwind `w-48`/`left-48` — coupled by an assumption that the root font size is 16px. Backlog G7.6 check 2 claims this is done; it is not. | —        |

## Phase E — expose what already exists

| #   | Change                                                                                                                                                                                                           | Rubric   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| E1  | Render `detached` tracks distinctly, with why and a path to re-attach.                                                                                                                                           | 7.9      |
| E2  | A per-keyframe interpolation control (linear / step / cubic). This is a `<select>` per key, **not** a curve editor — the data, store, compiler, and evaluator already support it.                                | 3.1, 3.2 |
| E3  | Distinguish the keyframe glyph by interpolation type, so easing is legible without selecting.                                                                                                                    | 3.3, 8.6 |
| E4  | Filter/search over the track list. Search exists only in the add-track modal.                                                                                                                                    | 4.6      |
| E5  | Surface playback state and failures. `transportRuntimeReady` is a gate that is never displayed, and playback failures go only to `console.error`, which `ANIMATION_PLAYBACK_SPEC.md:76` explicitly prohibits.    | 7.9      |
| E6  | Hit targets to ≥24px. Keyframe diamonds are 10×10 rotated 45° — about 7px effective — and are the primary manipulation target.                                                                                   | 8.7      |
| E7  | ARIA labels and states. Play/Pause is icon-only with no `title` or `aria-label`; the seconds/frames toggle marks the _active_ option `disabled`, so a screen reader announces the current mode as "unavailable". | 8.5, 8.6 |
| E8  | Honour `prefers-reduced-motion` for UI chrome only, never for authored animation. Nothing in the app handles it today.                                                                                           | 8.8      |
| E9  | Remove dead code and dead controls: the unlabeled gear button in `AnimationPanel` with no handler, `animationStore.tick()` and `evaluateTrack` with no non-test callers.                                         | 7.9      |

## Sequencing

A → B → C → D → E, with two deliberate deviations from "most visible first":

- **B before C** because the shortcut/focus guard (B6) is much cheaper to add
  alongside the first shortcuts than retrofit.
- **C before D** because C5/C6 stop silent data loss, and without undo that
  outranks precision.

Phase E items are independent and can be picked off at any point; E1 and E5 are
the two that change what a user can _understand_, so they are worth pulling
early if the phase slips.

## Explicitly not in scope

- A curve/graph editor (rubric 3.5). The biggest ceiling-raiser and the biggest
  build; the data model is already waiting for it.
- Undo/redo at any granularity, app-wide or timeline-local.
- Copy/paste/duplicate of keyframes (2.6, 2.7) — natural follow-ons to C1/C2,
  but they want a clipboard model and the inert Edit menu addressed first.
- Track grouping/hierarchy, solo/mute/lock, reordering (4.1, 4.2, 4.8).
- Time-scale/retime of a selection (2.12).
