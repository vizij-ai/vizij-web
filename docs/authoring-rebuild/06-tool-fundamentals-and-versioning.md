# Authoring Rebuild — Tool Fundamentals & Versioning

> Deep-dive on the elevated **tool fundamentals** focus (`01` §4.8, `04` §F) — "we need to
> get that part right" — and the **versioning standardization** that folds into it. These
> shape the shared shell and the artifact/state model from step 1, so they must be decided
> early, not retrofitted (the current `App.tsx` session-lifecycle complexity is the warning).

## Part 1 — Tool fundamentals

The fundamentals are the substrate every interface sits on. Getting them right *once* in
the shared shell is what lets the five interfaces stay simple.

### 1.1 State model, undo/redo, and recovery

- **Single, small, serializable state model per document**, backed by `@vizij/*`, not a
  5,000-line view component. This is the prerequisite for everything below.
- **Undo/redo** as a first-class, app-wide capability. Decide the mechanism early:
  - *Command/transaction log* (each edit is a named, invertible command) — gives readable
    history, partial undo, and a foundation for collaboration later; or
  - *Immutable snapshots* (structural sharing) — simpler to implement, coarser history.
  - **Recommendation:** command/transaction log scoped per document; it composes with
    autosave and versioning below.
- **Autosave + recoverable sessions.** Periodic + on-significant-edit autosave to local
  storage; crash/refresh recovery; explicit dirty-state indication. The current tool's
  fragile session lifecycle is a direct argument for designing this in.
- **Explicit save/load of artifacts** (the five types) distinct from autosave drafts.

### 1.2 Interaction consistency (shared shell)

One implementation, reused by all interfaces — selection, multi-select, copy/paste/
duplicate, naming/rename, search/filter, keyboard shortcuts, context menus, drag-and-drop,
empty states, and toasts/alerts. Today these are re-solved per panel; the rebuild
standardizes them in the shell + the `components/ui/*` library (the Figma seed, `02`).

### 1.3 Onboarding, templates & examples

- **Templates** for each artifact (start from a preset face/rig/animation/behavior, not a
  blank canvas) — leverages existing preset assets.
- **Guided first-run** for non-experts (Maya's brand team, Priya the CX designer).
- **In-context help** tied to the pipeline (`01` §2) so users learn the `d→f→c→t→behavior`
  model as they go.

### 1.4 Error handling & feedback

Consistent validation, non-destructive failure, and clear messaging (the import
discrepancy/orientation flows are existing examples to fold into a single pattern).

## Part 2 — Versioning standardization

**Context:** we're pre-1.0 / experimental, working toward a first version. The goal is to
**define the versioning scheme now** so v1 ships stable, rather than retrofitting it (the
existing `rig/legacyMigration.ts` and `ANIMATION_CLIP_IR_SCHEMA_VERSION` show migration is
already happening ad-hoc).

### 2.1 Two axes of versioning (keep them separate)

1. **Schema / format version** — the *shape* of the serialized data. Bumped when the file
   format changes; drives **migration on load**. (Today: per-IR `schemaVersion` constants.)
2. **Content / artifact version** — the *semver* of a particular artifact's content (this
   gaze rig is `v2.1.0`). Drives **dependency pinning and sharing**, not parsing.

Conflating these is a common trap; the model below keeps them distinct.

### 2.2 What gets versioned

Each of the five artifacts (Face, Rig, Standard, Animation, Behavior) and the **Vizij
bundle** carries metadata:

```jsonc
{
  "schemaVersion": "3",            // format; integer, migration-driving
  "artifact": {
    "id": "semio.gaze",
    "version": "2.1.0",            // content semver
    "kind": "standard"             // face | rig | standard | animation | behavior
  },
  "dependencies": {
    "standard": { "id": "semio.gaze", "range": ">=2.0.0 <3.0.0" }  // version pinning
  }
}
```

- A **Rig** pins which **Standard** version(s) it targets (a compatibility range).
- A **Face** records the rig versions it was authored against.
- The **bundle** records the schema version it was written with.

### 2.3 Compatibility & migration

- **Forward migration on load:** a registry of `schemaVersion N → N+1` migrators runs
  automatically (formalize the `legacyMigration` precedent into one pipeline).
- **Dependency compatibility check** on import: warn when a rig's pinned standard range
  isn't satisfied by the available standard; offer to upgrade/pin.
- **Deprecation path** for standards/rigs (mark deprecated, suggest successor) — UI later,
  but reserve the metadata field now.

### 2.4 Pre-1.0 discipline (so v1 is clean)

- **Define the metadata fields now** even while content churns — cheap to add, expensive to
  retrofit. Pre-1.0 we allow breaking schema changes but **always bump `schemaVersion` +
  ship a migrator**, so no artifact is ever unreadable.
- **Reuse the existing changesets workflow** (the repo already uses `@changesets/cli` for
  package releases) as the precedent/model for *artifact* changelogs — keep code versioning
  (packages) and content versioning (artifacts) as parallel, separate tracks.
- **One source of truth** for the current schema version and the migrator registry, in the
  engine layer, consumed by the shell.

### 2.5 Where it surfaces in the UI

- Artifact version shown in the library and on export (tool fundamentals §1.1 save/load).
- Import-time compatibility warnings (folds into the existing discrepancy flow).
- Rich diff/visual migration tooling is **later** (`04` A2) — v1 only needs correct,
  automatic, non-lossy loading + visible versions + dependency pinning.

## Open questions → Workstream 4 / architecture (Workstream 7)

- Undo mechanism: command log vs. snapshots — confirm before the shared state model is built.
- Do artifacts get content semver in v1, or only schema version + a hash? (Recommendation:
  both — schema version for parsing, semver for sharing/pinning.)
- Where does the migrator registry live — `@vizij/utils`, a new package, or per-artifact?
- How much dependency-compatibility UI ships in v1 vs. just the metadata + a warning?
