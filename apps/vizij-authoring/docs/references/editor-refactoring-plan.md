# Editor refactoring plan — rows, grids, molecules, and editor tools

Forward-looking companion to [component-consolidation-plan.md](component-consolidation-plan.md).
That document inventoried what exists and proposed merges. This one proposes the
**shape to build toward**, and is organised around the four things that actually
carry the editor's UI: rows, grids, molecules, and whole editor tools.

Every count and file reference here was taken from the tree, not from memory.
The import graphs in [component-graph.md](component-graph.md) are the structural
check for anything proposed below.

---

## 0. Where we are

The `@semio/ui` port is done: `@base-ui/react` is gone, 27 `ui/` primitives sit on
semio or radix, all have stories, and the visual suite is green in both themes.
What the port deliberately did **not** touch is the thing that now matters most:

| File                             | Lines      |
| -------------------------------- | ---------- |
| `panels/VariablesPanel.tsx`      | 8,753      |
| `inspector/InspectorContent.tsx` | 5,547      |
| `inspector/InspectorPanel.tsx`   | 2,360      |
| **total**                        | **16,660** |

Roughly 40% of all component call sites live in three files. Never editing them
was correct for a 602-call-site substrate swap — it is what made the migration
one-file-at-a-time — but it is a bad steady state, and every proposal below is
ultimately about draining those three files into named, testable, reusable parts.

The `editor/` layer exists and works, but is only five files:

```text
editor/atoms/ChannelLockButton.tsx
editor/atoms/ChannelLockStrip.tsx
editor/hooks/useRowLock.ts
editor/molecules/InspectorSection.tsx
editor/molecules/WorkbenchPanel.tsx
```

It has a documented token contract ([THEMING.md](../../src/components/editor/THEMING.md))
and a layering rule (no app imports, no app-global CSS). It is the right
destination for most of what follows.

---

## 1. The core diagnosis: "Row" names three unrelated things

This is why previous consolidation attempts stalled. There are **15 declared
`*Row` components** and they belong to three families that should never be merged
with each other:

### Family A — layout primitives (pure, no domain)

`TreeRow`, `ListRow`, `FieldRow`, `CollapsibleRow`, `RowSlider`.

Props in, JSX out. These are already in `ui/` and are basically fine. The work
here is small: give `ListRow` a `selected` state, split `RowSlider` back out of
`CollapsibleRow`, and cut their dependency on two app-global CSS classes
(`.inspector-row-hit-target`, `.inspector-numeric-control`) that do not exist
outside this app — 15 usages across 7 files.

### Family B — property-editing chassis (structure + interaction, no store)

`RiggingPropertyRow` and its siblings `ScrubbableLabel`, `CommitOnBlurNumberInput`,
`useScrub`.

This is the most valuable code in the inspector and it is misfiled. The chassis
is domain-free — chevron, accent dot for `hasDifferentDefault`, label (scrubbable
or static), main-input slot, reset, row-action slot, expanded Def/Min/Max/Editable
sub-rows — with everything domain-specific arriving through `renderX()` render
props. It belongs in `editor/molecules/`.

**It must not be merged into `NumberField`.** The consolidation plan is explicit
about this and it is right: a property row is a _disclosure and override_
affordance that happens to contain a numeric input. Folding them together would
put default/min/max/editable semantics inside a text field.

### Family C — domain components bound to a store

`RiggingScalarRow` ×2, `RiggingColorRow`, `RiggingVectorRow`, `TreeRowWrapper`,
`FeatureBindingRow`, `FlatInputControlRow`, `TrackRow`, the two motiongraph
`TreeRow`s.

These read `useBindingAuthoring` / `useAnimationStore` / `useEditorStore`
directly. They are **not** reusable and should not be pushed into a shared layer.
The goal for family C is the opposite: shrink them by extracting their A and B
parts, leaving a thin store-to-props adapter.

> **The rule to apply going forward:** a component may know about layout, or it
> may know about the store, but not both. `useRowLock` already had to be split
> this way — the hook takes `{isTargetLocked, setTargetLocked}` callbacks and the
> app-specific adapter (`inspector/useInspectorTargetLock.ts`) stays in the
> feature layer. That split should be the template, not a one-off.

---

## 2. The missing abstraction is column alignment, not rows

This is the finding I would most want acted on, and it is not in the earlier plan.

Rows in the inspector do not align with each other, because **every row declares
its own grid template inline**. Actual counts:

| Template                                     | Occurrences |
| -------------------------------------------- | ----------- |
| `grid-cols-[58px_72px]`                      | 4           |
| `grid-cols-[72px_minmax(0,1fr)]`             | 3           |
| `grid-cols-[minmax(0,1fr)_auto]`             | 2           |
| `grid-cols-[minmax(0,1fr)_90px]`             | 2           |
| `grid-cols-[minmax(0,1fr)_90px_auto]`        | 1           |
| `grid-cols-[minmax(0,1fr)_120px]`            | 1           |
| `grid-cols-[minmax(0,1fr)_auto_auto]`        | 1           |
| `grid-cols-[96px_minmax(0,1fr)_auto]`        | 1           |
| `grid-cols-[58px_minmax(0,1fr)_72px]`        | 1           |
| `grid-cols-[104px_minmax(0,1fr)_94px_138px]` | 1           |
| `grid-cols-[auto_1fr]`                       | 1           |

Eleven distinct templates, concentrated in `VariablePipelineStages.tsx` (8) and
`InspectorPanel.tsx` (4). The label column is 58px, 72px, 96px or 104px depending
on which row you are looking at, and the numeric column is 72px, 90px, 94px or
120px. Nothing enforces agreement, so adjacent sections visibly misalign and any
change to one row silently desynchronises it from its neighbours.

### Proposal: an `editor/` column context

```tsx
// editor/molecules/PropertyGrid.tsx
<PropertyGrid columns="label value actions">
  <PropertyGrid.Row>
    <PropertyGrid.Label>Weight</PropertyGrid.Label>
    <PropertyGrid.Value><NumberField … /></PropertyGrid.Value>
    <PropertyGrid.Actions><ChannelLockButton … /></PropertyGrid.Actions>
  </PropertyGrid.Row>
</PropertyGrid>
```

The grid owns the template; rows are `display: contents` so every cell in every
row participates in **one** grid and columns align by construction. Widths come
from tokens, not literals:

```css
--editor-col-label: 72px;
--editor-col-value: 90px;
--editor-col-actions: auto;
```

This is a genuinely new capability rather than a tidy-up: it makes cross-section
alignment possible for the first time, it removes the 11 templates, and it gives
a consuming application one place to re-proportion the inspector. It also
subsumes the two hand-rolled `<table>` elements in `FeatureList.tsx:424,463`,
which are tables only because there was no grid to use.

**Sizing note:** use `display: contents` on the row rather than nesting grids.
Nested grids cannot align across siblings, which is the entire problem. The
tradeoff is that a row cannot then carry its own background — so hover and
selection styling must go on the cells (`[&>*]:group-hover:bg-…`) or on a
full-width pseudo-element. Worth prototyping on one section before committing.

---

## 3. Rows — concrete plan

Ordered by value-for-risk. Steps 1–4 are mechanical; 5–6 need a design call.

### R1. Merge the two `RiggingScalarRow`s — _highest value, lowest risk_

`RiggingMaterialSection.tsx:238` and `RiggingMorphTargetsSection.tsx:177` are the
same component twice, and the morph copy has lost type safety (`feature: any`).
The lock machinery has already been extracted from both, so what remains is the
scalar write path. Merge behind the existing props; keep the material call site's
`substring(0, 1)` label truncation at the _call site_ rather than in the shared
component, so behaviour stays byte-identical.

### R2. Extract `FlatInputControlRow` → `editor/molecules/ControlRow`

`VariablesPanel.tsx:2832-2963`. Almost domain-free already: it coerces
`row.value` to finite, unwraps radix's `number[]`, and calls
`onValueChange(inputId, value)`. Its only coupling is the `InputCatalogRow` type,
which becomes a generic parameter. 130 lines out of the 8,753-line file, and the
first real proof that draining that file is possible.

### R3. Promote the `RiggingPropertyRow` chassis → `editor/molecules/PropertyRow`

Move the shell plus `ScrubbableLabel`, `CommitOnBlurNumberInput` and `useScrub`.
Four feature files consume them today. This retires the "parallel numeric stack"
the port left behind — not by deleting it, but by giving it a home and a story.

Tokenise while moving: the scrub interaction should read `--editor-accent`, and
the `hasDifferentDefault` dot should read a new `--editor-modified` token.

### R4. Deduplicate the two motiongraph `TreeRow`s

`motiongraph/components/InputSetsPanel.tsx:81` and `OutputSetsPanel.tsx:91`.
Identical apart from a remove button and sky-vs-emerald. The consolidation plan
flags a **real bug** in the divergence, so this is a fix, not just tidying. Merge
the pair first; adopting `ui/TreeRow` is a separate follow-up.

### R5. Give `ListRow` a `selected` state, adopt in `AuthoringTargetList`

Small, but it removes a hand-rolled selection row.

### R6. Collapse `RowSlider` into `Slider` — _needs design sign-off_

Blocked, not forgotten: the merge turns the amber default-marker thumb white.
That is a visible change to a control used throughout the inspector and needs a
decision before code.

---

## 4. Molecules worth extracting

Each of these is inline JSX repeated 2–12 times with no component at all. They
are invisible to any inventory that counts files, which is why they have
survived. Ordered by number of sites collapsed.

| Molecule                                                 | Sites | Where                                                  | Note                                                                                                                                |
| -------------------------------------------------------- | ----- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Section card** (uppercase title + mono count)          | 10    | `VariablesPanel.tsx`                                   | Differs only in padding and border opacity. `InspectorSection` already covers this shape — adopt it rather than build a second one. |
| **`MergeValueField`** (label + number + "Use current X") | 4     | `VariablesPanel.tsx:8107, 8344, 8663`                  | Differs in field name and button copy only.                                                                                         |
| **`BulkSelectCheckbox`**                                 | 4     | `VariablesPanel.tsx:2465, 2547, 2640, 2722`            | Verbatim except label and handler.                                                                                                  |
| **"Both Faces" value callout**                           | 4     | `InspectorContent.tsx:2150, 2371, 2961, 4806`          | Rig-pair vs pose-pair differ only in range source and display round-trip.                                                           |
| **Rigging section shell**                                | 4     | 3 × `Rigging*Section.tsx`, `InspectorContent.tsx:5448` | `RiggingMorphTargetsSection` is the one still untokenised (`bg-zinc-900/40`). Fixing that is reason enough.                         |
| **`SegmentedControl` / scope tab strip**                 | 2     | `InspectorContent.tsx:2052, 2077`                      | Byte-identical apart from the state pair.                                                                                           |
| **"Neutral direct value" row**                           | 2     | `InspectorPanel.tsx:1888, 2314`                        | One setter differs.                                                                                                                 |
| **"Composition channel" row**                            | 2     | `InspectorPanel.tsx:1974, 2394`                        | One field and two strings differ.                                                                                                   |
| **`EmptyState` + Clear Search**                          | 2     | `VariablesPanel.tsx:7482, 7839`                        | Copy only.                                                                                                                          |
| **`WizardModal`**                                        | —     | `VariablesPanel.tsx` copy modals                       | Not a stepper; see consolidation plan §5.2.                                                                                         |
| **`GroupedInputTree`**                                   | 2     | `VariablesPanel.tsx:6632, 6737`                        | ~100 identical lines; differs in expansion-state set and actions fragment.                                                          |

**Rule of thumb for which layer:** if it would make sense in a different editor
application (a section card, a segmented control, a merge field), it goes in
`editor/molecules/`. If it names a Vizij concept ("Both Faces", "Neutral direct
value", "Composition channel"), it stays in the feature layer as a _named
component_ — extracting it is still worth it for readability and testability,
just not for reuse.

---

## 5. Editor tools — the level above molecules

Four distinct tools live in this app. They need different treatment, and
conflating them is how the giant files got giant.

### 5.1 Property inspector — _the best-understood, highest-leverage target_

Rows + `PropertyGrid` + `InspectorSection` + `PropertyRow` composed into an
inspector that takes a schema-ish description rather than 5,547 lines of JSX.
This is where sections 2–4 land, and it is the only tool where the target shape
is already clear enough to build incrementally without a design phase.

### 5.2 Hierarchy / tree navigator

`ui/TreeRow` is the best-shaped primitive we have (27 references, zero domain
logic). What is missing above it is a **tree controller**: selection model,
multi-select, expand/collapse state, keyboard navigation, and filtering. Today
each consumer re-implements these — `TreeRowWrapper` (665 lines), the two
motiongraph panels, `HierarchyPanel`.

Deliberate constraint: **do not adopt `@semio/ui`'s `TreeGrid`.** It renders
every row with no windowing, and `VariablesPanel` has thousands of rows plus a
performance guard. The à-la-carte primitives are the only viable path; this is
filed upstream as STUDIO-124 so the limitation is on record.

### 5.3 Timeline editor — _largest untouched opportunity_

`animation/TimelineEditor.tsx` + `TrackRow.tsx` have **zero `ui/` imports**. They
were scoped out of the port and remain the biggest gap between what the app does
and what its component layer supports.

`TrackRow` is not a row in the family-A sense at all — it is a timeline lane with
a hardcoded `headerWidth = 192` and window-level pointer math converting `clientX`
to track time. It should be renamed and treated as the first member of a
`editor/timeline/` group.

What semio already provides that would help: `ScrollArea` with
`motionScrollY`/`onScrollSync`/`useRubberScrollSync` (lane-to-ruler sync),
`TimeInput`/`stampToVisualTime`, and the `IconKey`/`IconVectorBezier*`/easing/
`MovePlayhead` icon families. What is missing everywhere: track lane, keyframe
strip, ruler, playhead. **This is a build, not a port** — worth its own design
pass rather than being folded into the row work.

### 5.4 Node graph (motiongraph)

Isolated on reactflow, 14 files, and correctly left alone. The only work here is
R4 (the duplicated `TreeRow`s) and eventually routing its panels through
`WorkbenchPanel`.

---

## 6. Sequencing

Each step is independently mergeable and must keep `validate` + the visual suite
green. Steps within a phase are order-independent.

### Phase 1 — prove the pattern (low risk, high signal)

1. R1 merge `RiggingScalarRow`s
2. R2 extract `ControlRow`
3. Adopt `InspectorSection` for the 10 `VariablesPanel` section cards
4. Extract `BulkSelectCheckbox` and `MergeValueField`

### Phase 2 — the grid

1. Prototype `PropertyGrid` on **one** section (`VariablePipelineStages`, which
   holds 8 of the 11 templates) and settle the `display: contents`
   hover/selection question before spreading it
2. Migrate the remaining templates; delete `.inspector-row-hit-target` and
   `.inspector-numeric-control` from app CSS in favour of tokens

### Phase 3 — the chassis

1. R3 promote `PropertyRow` + the numeric stack to `editor/molecules/`
2. R4 motiongraph `TreeRow` dedup (bug fix)
3. R5 `ListRow` selection

### Phase 4 — needs a decision first

1. R6 `RowSlider` → `Slider` (design sign-off on the thumb)
2. Tree controller (5.2)
3. Timeline (5.3) — own design pass

**Guardrails to add before Phase 1**, because they are what stop regression:

- An eslint `no-restricted-imports` boundary: `editor/**` may not import
  `src/state/**` or `src/components/{panels,inspector,app}/**`; `ui/**` may not
  import feature code. The import graph proves this holds _today_; the lint rule
  is what keeps it true.
- A story for every new `editor/` component, including an `OverriddenTokens`
  story. The existing five all have one; that convention is worth enforcing.

---

## 7. Explicitly not doing

| Subject                                             | Why                                                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Merging `PropertyRow` into `NumberField`            | Different concerns; would put default/min/max/editable semantics inside a text field.                                                               |
| Adopting semio `TreeGrid`/`ListGrid`                | No virtualization; `VariablesPanel` has thousands of rows and a perf guard.                                                                         |
| Rewriting the three giant files in one pass         | The whole point is incremental extraction with a green suite at every step.                                                                         |
| Touching `TrackRow`'s drag math during the row work | It is a timeline lane, not a row. Renaming it is in scope; rewriting it is not.                                                                     |
| A generic "Row" base component                      | The three families (§1) have nothing in common but a name. A shared base would force them together, which is the mistake this plan exists to avoid. |

---

## 8. Open questions

1. **`display: contents` vs nested grids for `PropertyGrid`.** Contents gives
   real cross-row alignment but complicates row-level backgrounds. Needs a
   prototype, not an opinion.
2. **How far does `editor/` go before it becomes a package?** It is five files
   with one consumer, so its portability claim is untested. Extracting it and
   consuming it from a second app is the only real proof — worth deciding before
   it grows to thirty files and the contract calcifies untested.
3. **Do the Vizij-named molecules ("Both Faces", "Composition channel") deserve
   extraction at all**, given they will never be reused? My view is yes, for
   testability and for shrinking the giant files, but they should be named
   feature components rather than `editor/` molecules.
