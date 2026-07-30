# Open Decisions

_Everything the workshop could usefully decide, plus what PR #65 already decided that
may need re-deciding. Each entry: the question, why it's open now, the options, and a
recommendation where one is defensible._

Recommendations are one person's read of the evidence, not consensus. Argue with them.

---

## Part 1 — Decisions the new work forces (these have deadlines)

### D1 — What do we do with PR #65 and PR #86?

**The question.** Two stale drafts contain the only written analysis of the authoring
UX: PR #65 (inventory + 4 proposals + synthesis + Track 1 implementation) and PR #86
(Track 2 R0/R1, `@vizij/face-core` scaffold). `main` has moved 26 commits under them.
The arora sections are half-obsolete; the UX analysis is fully valid.

**Why it's open now.** Both have been sitting since 2026-07-22. Left alone they rot
further, and the analysis in them is genuinely good work.

**Options.**

|     | Option                                                                  | Cost                                       | Risk                                                                       |
| --- | ----------------------------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| a   | Rebase both, refresh the stale sections, merge the docs, merge Track 1  | Real rebase work on a 4,632-line `App.tsx` | Track 1 conflicts with PR #59 and PR #100                                  |
| b   | **Split: merge the docs now (rebased and corrected), re-plan the code** | Low for docs; re-planning is honest work   | The Track 1 code (undo/redo, Checkup, autosave) sits unused a while longer |
| c   | Close both, start over                                                  | Discards good analysis                     | Wastes it                                                                  |
| d   | Leave them                                                              | Zero                                       | They rot; nobody reads a stale draft                                       |

**Recommendation: (b).** Land the analysis as documentation so it stops being a PR and
starts being a reference. Re-plan the implementation against today's substrate, because
the sequencing assumption ("Track 1 ships entirely before Track 2 starts") already
failed once by assuming a static runtime.

**Note:** the undo/redo, unified Checkup, and autosave implementations in PR #65 are the
most valuable code in either PR and address three of the top frictions in
[`05-WORKFLOWS.md`](./05-WORKFLOWS.md). Whatever happens to the plan, don't lose those.

---

### D2 — Does the preview show the profile? (ships in PR #100)

**The question.** PR #100 embeds a standard profile into the open GLB but **the
authoring runtime composes no profile** — deliberately, because the imported copy is
part of the _asset_, not the preview. So the user checks a box and sees nothing change,
and the deployed face behaves differently from what they authored against.

**Why it's open now.** PR #100 is marked ready. This ships today or tomorrow.

**Options.**

|     | Option                                                                                 | Note                                                                                                      |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| a   | Ship as-is                                                                             | Silent divergence. The "runtime-truthful" claim quietly acquires an asterisk with no UI acknowledgement   |
| b   | **Ship with an indicator** — a chip or note saying the preview omits embedded profiles | Cheap; preserves the trust story                                                                          |
| c   | Ship with a preview toggle — compose the profile into the authoring device on demand   | More work; the honest end state                                                                           |
| d   | Always compose embedded profiles in the preview                                        | Changes what "authoring" means; a profile driving `standard/*` while you're editing `rig/*` may fight you |

**Recommendation: (b) now, (c) as a follow-up.** The divergence is defensible; being
silent about it is not. This is the cheapest possible defence of the product's best
property.

---

### D3 — Lifecycle or pipeline as the primary narrative?

**The question.** Two competing framings, both valid:

- **Lifecycle** (PR #65): DEFINE → CONTROL → ANIMATE → DEPLOY. Organizes _the tool_;
  reads as one person's journey.
- **Pipeline** ([`01`](./01-MENTAL-MODELS.md) §5.1): 3D model → rigged → expressive →
  behaving → deployed, with a different role at each arrow. Organizes _the team_;
  makes hand-offs visible.

**Why it's open now.** Two things broke the lifecycle framing's primacy: (a) with
built-in profiles, DEPLOY can precede DEFINE — the Quori golden test drives a face with
no authoring session at all; (b) DEFINE is often done in Blender by someone who never
opens Vizij.

**Options.** (a) Lifecycle primary, pipeline as internal planning language.
(b) Pipeline primary, lifecycle as in-app wayfinding. (c) Both, explicitly, for
different audiences.

**Recommendation: (c), stated explicitly.** Lifecycle for the _product UI_ (it's a
better wayfinding spine and PR #65's guided-first-run idea is good); pipeline for
_roadmap and org conversations_ (it makes the unserved 3D-Artist seam visible, which
the lifecycle framing hides inside "Import").

---

### D4 — Standard Feature Spaces vs. Standard Profiles

**The question.** Two overlapping interop features:

- **Standard Feature Spaces** — the authoring-side mapping editor
  (`/standard/{ns}/{channel}/{track}/{attr}`), with a coverage panel, Setup/Channels/
  Mapping tabs, and an **export that has never shipped**.
- **Standard Profiles** — the runtime's registry of adapter graphs (`ros4hri`, 674
  nodes), embeddable via `vizij-bundle add-standard` or (PR #100) the File menu.

**Why it's open now.** The runtime solved the interop problem from below. SFS is a
half-finished solution to a problem that partly moved.

**Options.**

|     | Option                                                                                                          | Note                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| a   | Keep both; SFS maps a face's controls to standard paths, profiles adapt standard paths to external vocabularies | Coherent, but two concepts to teach                                                        |
| b   | **Retire SFS's editor; keep the coverage view; make profiles the interop surface**                              | Deletes a feature whose export never shipped. Needs VIZ-93 (profile edition) to land first |
| c   | Reimplement SFS as a profile author (a face-specific profile is exactly what SFS produces)                      | The elegant answer; the most work                                                          |

**Recommendation: (c) as the target, (b) as the step.** A face-specific mapping _is_ a
profile — that's what the Quori adaptation is. Converging them removes a concept
instead of adding one. But nothing should be deleted before VIZ-93 gives profiles an
authoring surface.

**Related:** the third gap PR #65 promised to fix by design was "Standard-Controls
export." If (b) or (c) wins, that gap is closed by deletion rather than by shipping.
Say so out loud, or it stays on gap lists forever.

---

### D5 — Path collision precedence

**The question.** Two publishers on the same path is _invalid_ (VIZ-76) but unprevented;
composition has no combiner node and ignores `mergeStrategy` (VIZ-58). The de-facto
answer is "depends on composition order."

**Why it's open now.** It has always been open. It's listed here because it is the
question a new behavior author asks first and it appears in three of the eight
workflows.

**Options.** (a) Detect and reject at compose time (loud, safe, blocks legitimate
layering). (b) Define precedence by source kind, extending the existing
base→profiles→program rule. (c) Ship a combiner node and honour `mergeStrategy` (most
expressive, most work). (d) Warn in the Checkup and let last-write-wins stand.

**Recommendation: (b) then (c).** There is already one written precedence rule
(profiles lose to programs) and it works. Extend it into a full table, publish it, then
add the combiner node for cases the table can't express. (a) alone will block real
layering; (d) alone leaves the model undefined.

**This is Exercise B's output.** Don't decide it before the workshop — decide it _with_
the precedence table the room produces.

---

### D6 — Who owns profile edition, and where does it live?

**The question.** VIZ-93 (Profile edition) is Todo with no design. Today, adapting a
profile means editing `profiles/ros4hri.json` (674 nodes) or writing graph-builder Rust.

**Options.** (a) A dedicated profile editor in `vizij-authoring`. (b) Reuse the existing
motion-graph editor — a profile _is_ a node graph. (c) Keep it CLI/JSON-only; profiles
are a maintainer artifact. (d) Converge with SFS per D4(c).

**Recommendation: (b), leading to (d).** The behavior editor already edits node graphs.
A profile is a node graph. Building a second graph editor for it would be a mistake, and
the convergence with SFS falls out naturally.

---

## Part 2 — PR #65 decisions to re-ratify

The synthesis made these. None were formally accepted; all are still live.

### D7 — Is the flagship shell the progressive-disclosure canvas (D)?

PR #65 recommended **D** (one always-present face + a contextual inspector driven by
selection + a command palette + disclosure levels), with **A**'s lifecycle demoted to a
wayfinding bar and **B**'s roles as layout presets.

**Still holds?** The reasoning (lowest floor, best accessibility, cheapest migration
because the app already has the viewport + `selectionStore`) is unaffected by anything
that has happened since. **Recommendation: ratify.**

### D8 — Which role presets, if any?

PR #65 proposed three (Rig Author / Motion Designer / Integrator).
[`03`](./03-PERSONAS-ROLES.md) §4 argues the real seams are **Author / Embed / Run /
Supply**, since Rig Author and Motion Designer are the same person on this team today
and Web vs. Robot Integrator are genuinely different people with no shared surface.

**Recommendation: defer to Exercise C.** This is exactly what the role exercise is for.

### D9 — Embed delivery: direct or iframe by default?

PR #65 recommended auto-detect with **iframe as the documented default**, because
COOP/COEP is required for WASM and most host sites can't set those headers.

**Still holds?** Yes, and it matters more now: it is the blocker in W4, the workflow
with a named external customer (Peerbots). **Recommendation: ratify.**

### D10 — How far to push "Behavior" representation?

PR #65 asked whether to ship the node-graph editor as-is or invest in a keyboard-first
rule-list alternative view (an accessibility win).

**Still holds?** Yes, and D6 adds weight to it: if the behavior editor also becomes the
profile editor, its accessibility ceiling matters more. **Recommendation: keep open;
decide after D6.**

### D11 — API stability bar for `face-core` 1.0

PR #65 proposed tiering: a small `@stable` core (`init`, `step`, `writeInput`,
`readValue`, `listInputs`, `setGraphBundle`, `onValuesChanged`) plus `@experimental`
transport/driver helpers.

**Needs updating.** The surface has changed: `apply(GraphDiff)` is now part of the
recompose story, and `standardProfiles()` / `standardProfile(id, rigPrefix)` are new.
`runtime-react`'s README still says _"Status: experimental. Public API is still
moving."_ **Recommendation: re-derive against `@vizij/runtime` 2.2.0 before any publish.**

### D12 — Does "Track 1 before Track 2" survive?

PR #65 was explicit: user-facing value first, repackaging last, Track 1 ships entirely
before Track 2 starts.

**It already failed.** Both tracks stalled together because the substrate moved under
them for eight weeks while the plan assumed it wouldn't. The plan's own escape hatch —
"R1 + R4 can be pulled forward as a parallel spike if a specific external consumer
needs the embed sooner" — now describes reality: Peerbots is that consumer.

**Recommendation: invert partially.** Pull the embed work (L1 `face-core` + L3
`face-embed`) forward as a parallel track, because it has a named customer and is
non-breaking. Keep the Track 1 gap fixes (undo, save, unified Checkup) as their own
independently-shippable stream. Drop the strict ordering — it bought nothing and cost
eight weeks.

---

## Part 3 — Decision summary

| #   | Decision                         | Urgency                          | Recommendation                                               |
| --- | -------------------------------- | -------------------------------- | ------------------------------------------------------------ |
| D1  | Fate of PR #65 / #86             | **This week**                    | Merge docs rebased; re-plan the code                         |
| D2  | Profile preview divergence       | **Blocks PR #100 merge quality** | Ship with an indicator; toggle later                         |
| D3  | Lifecycle vs. pipeline narrative | Workshop                         | Both, for different audiences                                |
| D4  | SFS vs. Standard Profiles        | Soon (VIZ-93 depends)            | Converge SFS into profiles; step via retiring the SFS editor |
| D5  | Path collision precedence        | Workshop → then design           | Extend the precedence rule into a table; combiner node after |
| D6  | Profile edition surface          | Next (VIZ-93)                    | Reuse the behavior editor                                    |
| D7  | Canvas as flagship shell         | Workshop                         | Ratify                                                       |
| D8  | Which role presets               | Workshop                         | Defer to Exercise C                                          |
| D9  | Embed: iframe default            | When embed work starts           | Ratify                                                       |
| D10 | Behavior representation          | After D6                         | Keep open                                                    |
| D11 | `face-core` stability tiers      | Before any publish               | Re-derive against runtime 2.2.0                              |
| D12 | Track ordering                   | **This week**                    | Drop the strict ordering; pull the embed forward             |

---

## Part 4 — Parking lot (real, but not this workshop)

- **VIZ-49** — designing 17 face combinations. An asset-scale problem the tooling
  doesn't address.
- **VIZ-77** — porting Studio's Vizij improvements. Blocked on a genuine architectural
  fork: vizij-web keeps runtime values _inside_ the `@vizij/render` store; Studio moved
  them _out_ to a separate `useValuesStore`. Both are valid single-sources-of-truth in
  opposite locations, so a verbatim port would reintroduce the dual-store drift Studio
  fixed. Port the writer _seams_, re-implemented against vizij-web's store.
- **VIZ-74** — `vizij-standalone`'s dual store. Dissolves when the native app takes
  over; not worth fixing in the Tauri shell.
- **App count** — 11 apps in this repo. Which are products, which are tests, which are
  dead?
- **The 3D Artist's toolchain** — no Vizij surface exists. Blender export conventions,
  validation-before-import, a linter. Nobody owns this.
- **Documentation drift** — `ui-component-inventory.md` is stale (2025-11-20); the
  repo README advertises packages that don't exist on `main`; PR #65's inventory cites
  five renamed packages. There's no mechanism keeping docs honest.
