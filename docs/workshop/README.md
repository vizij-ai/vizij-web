# Vizij Mental-Models Workshop Pack

_Prepared 2026-07-30 for a workshop on mental models and workflows for Vizij._

Built from three sources: the **Linear Vizij (VIZ) board**, the **redesign work on
[PR #65](https://github.com/vizij-ai/vizij-web/pull/65)** (plus its Track 2 companion
[PR #86](https://github.com/vizij-ai/vizij-web/pull/86)), and **verification against
`main` @ `418d7f2f`**. Where the older analysis has gone stale, it is marked.

---

## The premise

> The Vizij **runtime** was rebuilt over the last two months. The orchestrator is gone,
> arora runs it natively and in the browser and headless, graph edits patch in place, a
> face **standard** shipped with a built-in ROS4HRI profile, and CI publishes releases.
>
> In the same window the **authoring experience** did not change. `App.tsx` is still
> 4,632 lines. Undo still does nothing. Save still means Export. The two plans that
> would have fixed that are open, unmerged drafts.

That gap — a rebuilt engine under an unchanged experience — is what this pack is about.

---

## Read in this order

| #      | Doc                                        | What it gives you                                                                                                                                                                     | Read if                                    |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **00** | [STATUS](./00-STATUS.md)                   | What changed, what's in progress, and a line-by-line check of which PR #65 claims still hold                                                                                          | You need to catch up                       |
| **01** | [MENTAL MODELS](./01-MENTAL-MODELS.md)     | **The centerpiece.** Seven models (objects, addressing, time, layers, lifecycle, truth, navigation), each as _what the system does_ vs. _what people assume_ vs. _where they diverge_ | You read one document                      |
| **02** | [FEATURES](./02-FEATURES.md)               | The full inventory, re-organized by lifecycle stage, with maturity ratings and the current gap list                                                                                   | You need to know what exists               |
| **03** | [PERSONAS & ROLES](./03-PERSONAS-ROLES.md) | 3 proposed personas + 4 the current state reveals; a 7-role map; jobs-to-be-done                                                                                                      | You're running the role exercise           |
| **04** | [INTERFACES](./04-INTERFACES.md)           | Every surface: 11 apps, 2 CLIs, 13 packages, 4 bridges, 6 file formats, 8 path namespaces, 9 deleted-but-still-documented packages                                                    | You need the surface area                  |
| **05** | [WORKFLOWS](./05-WORKFLOWS.md)             | Eight end-to-end journeys (W1–W8) with friction marked per step                                                                                                                       | You're running the workflow exercise       |
| **06** | [GLOSSARY](./06-GLOSSARY.md)               | Decoder ring for the codebase + the proposed user-facing vocabulary + three new naming questions                                                                                      | Words are the argument                     |
| **07** | [FACILITATION](./07-FACILITATION.md)       | A runnable 90-minute agenda with five exercises, plus optional extensions                                                                                                             | You're facilitating                        |
| **08** | [DECISIONS](./08-DECISIONS.md)             | 12 open decisions with options and recommendations, plus a parking lot                                                                                                                | You want the workshop to produce something |

**If you have ten minutes before the session:** [`01`](./01-MENTAL-MODELS.md) §0 (the one
sentence) and §9 (the one diagram), then [`00`](./00-STATUS.md) §5 (three numbers).

**If you're facilitating:** [`07`](./07-FACILITATION.md), and skim
[`05`](./05-WORKFLOWS.md) — Exercise D is built on it.

---

## The one sentence

> **A Vizij face is a 3D model plus a graph that turns named intentions into mesh
> motion. Everything else is a way of authoring, driving, packaging, or hosting that
> pair.**

## The one diagram

```text
                    ┌─────────────────────────────────────────────────┐
   AUTHORING        │              THE FACE PACKAGE                   │       DEPLOY
                    │   scene + controls + expressions + clips        │
  Blender ──GLB──►  │   + behavior + speech cfg + [profiles]          │  ──►  browser app
  vizij-authoring ► │                                                 │  ──►  native vizij
  vizij-bundle ───► └─────────────────────────────────────────────────┘  ──►  headless CI
                                         │                               ──►  robot (ROS 2)
                                         │ compose: base → profiles → program
                                         ▼
                            ┌────────────────────────┐
                            │  ONE COMPOSED GRAPH    │
                            │  ONE arora DEVICE      │ ◄── bridges write here
                            │  ONE STORE (path→val)  │     WS / ROS 2 / Studio-Zenoh
                            └────────────────────────┘
                                         │ changed keys only
                                         ▼
                                   the rendered face
```

## The three numbers

- **4,632** — lines in `App.tsx`. Unchanged through the entire arora migration.
- **674** — nodes in the built-in `ros4hri` profile graph. Interop is now large,
  data-defined, and versioned.
- **26 / 0** — commits landed on `main` vs. commits landed from the redesign PRs, in the
  same window.

## The five divergences to resolve

| #   | Divergence                                 | Symptom                                                              |
| --- | ------------------------------------------ | -------------------------------------------------------------------- |
| 1   | "Rig" means six different things           | Nobody can state the object model in a sentence (VIZ-80)             |
| 2   | Path collisions have no defined precedence | "It depends on composition order" (VIZ-76, VIZ-58)                   |
| 3   | Save ≠ durable                             | Lost work; until PR #100, silent stale-bundle shadowing on re-export |
| 4   | "Runtime-truthful" now has three asterisks | Preview omits embedded profiles; dual store; speech mid-migration    |
| 5   | Four independent notions of "where am I"   | 13 panels × 6 focus modes × 4 workbench tabs × 6 surfaces            |

---

## What this pack is not

- **Not a UI design.** Four written proposals already exist (PR #65 docs
  `01`–`04`); the synthesis recommends a hybrid. This pack summarizes and re-checks
  them, it doesn't replace them.
- **Not a roadmap.** [`08`](./08-DECISIONS.md) lists decisions and recommends where
  defensible, but sequencing is the team's call.
- **Not validated research.** The personas are inferred from code and READMEs. `VIZ-1
Stakeholder Map` is still unstarted — producing the validated version is a workshop
  _output_, not an input.

---

## Provenance

| Source                                                              | Where                                                                                                    |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Feature inventory (2026-07-15)                                      | `apps/vizij-authoring/docs/FEATURE_INVENTORY.md` on `sbeleidy/vizij-authoring-features-inventory-4d4be1` |
| Foundation: personas, lifecycle, terminology, arora contract, L0–L4 | `docs/redesign/00-FOUNDATION.md`, same branch                                                            |
| Four proposals (Lifecycle / Roles / Headless+Kit / Canvas)          | `docs/redesign/01`–`04`, same branch                                                                     |
| Synthesis + two-track plan                                          | `docs/redesign/05-SYNTHESIS.md`, same branch                                                             |
| Track 2 implementation sketches                                     | `docs/redesign/06-track-2-implementation.md` on `claude/pr-65-track-2-planning-4swlj0`                   |
| Current state                                                       | `main` @ `418d7f2f`, verified 2026-07-30                                                                 |
| Status, ownership, in-flight work                                   | Linear team **Vizij (VIZ)**                                                                              |

The PR #65 branch is still available — nothing in it has merged. To read the originals:

```bash
git show origin/sbeleidy/vizij-authoring-features-inventory-4d4be1:docs/redesign/05-SYNTHESIS.md
```
