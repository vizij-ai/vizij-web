# Vizij Front-End Redesign

A design study for reorganizing the Vizij face-authoring experience and breaking
the code into reusable chunks that other sites can use to **define, control,
animate, and deploy** Vizij faces — while preserving the **arora** runtime
backend.

This is a set of design documents, not code. It retains every capability in
[`apps/vizij-authoring/docs/FEATURE_INVENTORY.md`](../../apps/vizij-authoring/docs/FEATURE_INVENTORY.md)
and proposes better ways to organize it.

## How to read this set

1. Start with **[`00-FOUNDATION.md`](./00-FOUNDATION.md)** — the shared basis all
   proposals build on: personas, the DEFINE→CONTROL→ANIMATE→DEPLOY lifecycle, the
   feature-parity checklist, the terminology glossary, the **arora runtime
   contract** (a hard constraint), and the **L0–L4 reusable-package** target.
2. Read the **four proposals** (each is standalone: thesis → SRD → feature-coverage
   matrix → self-review → architecture → development plan with migration path).
3. Finish with **[`05-SYNTHESIS.md`](./05-SYNTHESIS.md)** — the comparison and the
   single recommended hybrid.

If you only read two files: **`00-FOUNDATION.md`** and **`05-SYNTHESIS.md`**.

## The four proposals

| # | Proposal | One-line thesis |
|---|---|---|
| A | [Lifecycle Studio](./01-lifecycle-studio.md) | The whole app is organized as four top-level modes — **Define → Control → Animate → Deploy** — with a persistent live face and a "borrow" overlay for cross-stage tasks. |
| B | [Role-based Workspaces](./02-role-workspaces.md) | Three role-tuned workspaces — **Rig / Motion / Deploy Studio** — over one shared project and runtime, with first-class hand-offs. |
| C | [Headless + Component Kit](./03-headless-component-kit.md) | **Invert priorities:** the product is the layered package suite (headless core → React kit → framework-agnostic `<vizij-face>` embed → editor packages); the app is a thin assembly. Deepest on API design. |
| D | [Progressive-Disclosure Canvas](./04-progressive-canvas.md) | One always-present 3D canvas; a single **contextual inspector** driven by what you select; complexity revealed on demand, with a command palette and Expert Mode for power users. |

## The recommendation (in brief)

The synthesis does **not** pick one winner — the proposals' strengths sit on
different layers and compose cleanly:

> **A progressive-disclosure canvas app (D), built on a headless package suite (C),
> guided by the lifecycle as wayfinding (A), and presettable by role (B).**

- **Substrate = C.** All four proposals independently chose the L0–L4 suite and
  made extracting **`@vizij/face-core`** their first step. That is the foundation
  and the answer to the reuse mandate — including the framework-agnostic
  `<vizij-face>` embed that does not exist today.
- **App shell = D.** Lowest floor, best accessibility, lowest-risk migration
  (today's app already has the viewport + selection-driven inspector it builds on).
- **Guidance spine = A**, demoted from hard modes to a lifecycle progress/wayfinding
  bar — which removes A's cross-stage friction.
- **Entry presets = B**, as saved canvas arrangements per persona rather than
  separate apps — which removes B's hand-off friction and shell duplication.

See [`05-SYNTHESIS.md`](./05-SYNTHESIS.md) for the comparison matrix, canonical
terminology, final package boundaries, and the phased development plan. That plan
is **user-facing value first**: Track 1 ships the visible wins (undo/redo,
Save≠Publish, plain-language terminology, a unified Checkup, command palette,
lifecycle wayfinding, the canvas reorganization) in the existing app, and Track 2
does the repackaging and the `<vizij-face>` embed last — refactoring the
already-improved app onto the package suite ("wrap, don't rewrite").

## Invariants every proposal respects

- **Arora is preserved.** One composed graph and one device per face, unprefixed
  `params.path` as the cross-graph contract, `ValueJSON` step/drain loop, and
  `setGraphBundle` hot updates — the UI always speaks Face Packages and paths,
  never the device directly.
- **Every feature is retained.** All 19 inventory areas are mapped in each
  proposal's coverage matrix (merged/renamed/deferred is allowed; dropped is not).
- **Known gaps are fixed, not carried:** real undo/redo, a real **Save** distinct
  from **Publish**, and **Standard-Controls export**.

## Files

- [`00-FOUNDATION.md`](./00-FOUNDATION.md) — shared basis
- [`01-lifecycle-studio.md`](./01-lifecycle-studio.md) — Proposal A
- [`02-role-workspaces.md`](./02-role-workspaces.md) — Proposal B
- [`03-headless-component-kit.md`](./03-headless-component-kit.md) — Proposal C
- [`04-progressive-canvas.md`](./04-progressive-canvas.md) — Proposal D
- [`05-SYNTHESIS.md`](./05-SYNTHESIS.md) — comparison + recommendation
