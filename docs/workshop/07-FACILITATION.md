# Facilitation Guide

_A runnable agenda for a workshop on mental models and workflows for Vizij. Built to
be cut down: the **core 90 minutes** stands alone, and each extension is optional._

---

## Framing — what this workshop is for

Say this at the top, more or less verbatim:

> In the last two months the Vizij **runtime** was rebuilt — the orchestrator is gone,
> arora runs it natively and in the browser, and we now ship a face _standard_ with a
> ROS4HRI profile built in. In the same window the **authoring experience** did not
> change at all: `App.tsx` is still 4,632 lines, undo still does nothing, and Save
> still means Export. Two plans that would have fixed that are open, unmerged drafts.
>
> We're not here to write a roadmap. We're here to agree on **what Vizij is** —
> the nouns, who they're for, and how work flows through them — well enough that the
> next plan doesn't go stale in eight weeks.

**Three explicit non-goals**, stated up front so people stop steering there:

1. Not picking a UI design.
2. Not estimating or sequencing engineering work.
3. Not resolving the arora/runtime architecture — that part is working.

---

## Pre-read (send 30 min before, or read the first 10 min in the room)

- [`00-STATUS.md`](./00-STATUS.md) §1 and §5 — the paragraph and the three numbers
- [`01-MENTAL-MODELS.md`](./01-MENTAL-MODELS.md) §0 and §9 — the one sentence and the
  one diagram

Everything else is reference material for during the session.

---

## Materials

| Item                                                   | Why                          |
| ------------------------------------------------------ | ---------------------------- |
| The 10 nouns on index cards (from `01` §1.1)           | Exercise A                   |
| The path namespace tree drawn on a wall (from `04` §5) | Exercise B                   |
| W1–W8 as swim lanes on butcher paper (from `05`)       | Exercise D — **the big one** |
| The 7 roles on cards (from `03` §3)                    | Exercise C                   |
| Part 2 of `06-GLOSSARY.md` printed, one per person     | Extension X1                 |
| Red / orange / yellow dot stickers                     | Exercise D                   |
| A visible parking lot                                  | Everything                   |

---

## Core agenda — 90 minutes

### 0:00 — Framing (5 min)

The three paragraphs above. Then read the one-sentence definition and ask for
objections:

> _A Vizij face is a 3D model plus a graph that turns named intentions into mesh
> motion. Everything else is a way of authoring, driving, packaging, or hosting that
> pair._

If someone objects, capture the objection — that's a mental-model divergence and it's
the most valuable thing you'll get in the first five minutes.

---

### 0:05 — Exercise A: The nouns (15 min)

**Setup:** 10 cards — Scene, Controls, Expressions, Animations, Behavior, Composed
Graph, Device, Store, Profiles, Bridges.

**Task:** In pairs, sort them into three piles: _things I author_ · _things the system
computes_ · _things that come from outside_. Then name each pile in one word.

**Debrief (7 min):** Collect the pile names on the wall. Where pairs disagree on a
card's pile, that card is a concept we haven't explained. Expect disagreement on
**Profiles** (authored? computed? external?) and **Store** (internal? interface?).

**Output:** the disagreement list.

---

### 0:20 — Exercise B: Who writes here? (15 min)

**Setup:** the path namespace tree on the wall (`04` §5).

**Task:** For each branch, write who is allowed to write to it. Then, wherever two
authors can write the same leaf, write the precedence rule — **or write "UNDEFINED" in
red.**

**Debrief:** Count the UNDEFINEDs. Point out that exactly one precedence rule is
currently written down anywhere: _profiles compose between base graphs and program, so
a playing program out-writes the profile._ That rule lives in a Linear issue.

**Output:** a precedence table with named gaps → these become VIZ-76 / VIZ-58 scope.

> This exercise is the highest-value 15 minutes in the workshop. It converts an
> architectural vagueness into a finite list of decisions.

---

### 0:35 — Exercise C: Roles, and which are one person (15 min)

**Setup:** the 7 role cards — 3D Artist, Rig Author, Motion Designer, Interaction
Designer, Web Integrator, Robot Integrator, Operator (+ Maintainer as an aside).

**Task, three rounds of 4 min:**

1. **Name a real person** for each role. Roles with no name are aspirational or
   somebody's second hat.
2. **Merge test:** for each adjacent pair, _if these were one person, what would we
   build differently?_
3. **Underserved audit:** for each role, count surfaces designed _for_ them vs.
   surfaces they _cope with_.

**Debrief:** The claim to test is in `03` §4 — that the real seams are
**Author / Embed / Run / Supply**, not PR #65's Rig / Motion / Deploy.

**Output:** the stakeholder map. **Attach it to VIZ-1 and close it.**

---

### 0:50 — Exercise D: Walk the workflows (30 min) — the centerpiece

**Setup:** W1–W8 from [`05-WORKFLOWS.md`](./05-WORKFLOWS.md) as swim lanes on the wall,
**with the friction column removed.**

**Round 1 (10 min):** Everyone places red/orange/yellow dots from memory. Where does it
hurt?

**Round 2 (5 min):** Reveal the friction column. Compare.

**Round 3 (15 min):** Discuss only the mismatches:

- Where the room dotted red and the doc says smooth → _we're carrying folklore about
  something that got fixed_ (most likely candidates: the orchestrator migration,
  recompose reloads).
- Where the doc says blocker and nobody dotted → _we've normalized a blocker_
  (most likely: no save, no undo, undefined collisions).

**Output:** the ranked friction list, and a list of "fixed but everyone still believes
it's broken" items — which is a **communication** backlog, not an engineering one.

---

### 1:20 — Close (10 min)

Read back:

1. The one-sentence definition, as amended.
2. The disagreement list from A.
3. The UNDEFINED count from B.
4. The role map from C.
5. The top three frictions from D.

Then assign an owner to each of the decisions in
[`08-DECISIONS.md`](./08-DECISIONS.md) that the room actually touched. Do **not** try to
resolve them all in the room.

---

## Optional extensions

### X1 — Terminology ratification (30 min)

Run `06-GLOSSARY.md` Part 4. Best used as a **separate session** — it's detailed work
and it competes with Exercise D for energy. If you do run it here, cut Exercise A.

The highest-value 5 minutes of it: **E1, the decode-off.** Ask six people to privately
define "rig" and reveal simultaneously.

### X2 — Model-divergence deep dive (20 min)

Take the five divergences from `01` §8 one at a time. For each: _is this a naming
problem, a documentation problem, a UI problem, or a semantics problem?_ The answers
route the work to different people.

### X3 — Redraw the layer diagram (25 min)

`01` §4 argues the L0–L4 model needs redrawing because the standard moved into L0 and
L4's Standard-Controls editor mostly evaporated. Give the room the old diagram and a
marker. Only worth doing if the packaging track (PR #86) is about to be revived.

### X4 — "Runtime-truthful, with asterisks" (15 min)

`01` §6. Three deliberate divergences between preview and deploy. For each: **(a)
correct, needs an indicator** / **(b) correct, needs a toggle** / **(c) a bug we've been
living with**. Vote. This one has a hard deadline — PR #100 is ready to merge and ships
divergence #1.

---

## Facilitation notes

**The failure mode to guard against.** This room will want to design the UI. Every
exercise above will produce someone saying "so what if we had a panel that…". Park it
visibly and immediately. The workshop's value is entirely in the _shared model_; the
design work is downstream and there are already four written proposals for it (PR #65).

**The second failure mode.** Re-litigating arora. It's done, it works, it's the one
part of the system that isn't the problem. If it comes up: "the runtime is the part
that went right — that's why we're looking at everything else."

**The person who isn't in the room.** The 3D Artist. Nobody in the session will
represent them, and they're the least-served role in the system. Put an empty chair for
them if that's not too cute.

**Bring the receipts.** The most persuasive artifacts are the specific ones:
`AppMenuBar.tsx:180-181` (two dead menu items), 4,632, 674, 13×6×4×6. Concrete numbers
end arguments that abstractions extend.

**If you only have 30 minutes.** Run Exercise B (paths and precedence) and Exercise D
Round 1+2 (dot-vote and reveal). Those two produce actionable output on their own.

---

## What "success" looks like

By the end you should be able to hand someone:

- **one sentence** defining Vizij that nobody in the room objects to
- **a precedence table** for the path namespace, with the gaps named
- **a role map** with real names against roles, closing VIZ-1
- **a ranked friction list** across the eight workflows
- **a list of things that are fixed but still believed broken**

None of those are designs. All of them are prerequisites for the next design being
worth writing.
