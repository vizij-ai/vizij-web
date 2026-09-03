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
semio or radix, and all have stories.
What the port deliberately did **not** touch is the thing that now matters most:

| File                             | At plan time | Now        | Δ          |
| -------------------------------- | ------------ | ---------- | ---------- |
| `panels/VariablesPanel.tsx`      | 8,753        | 7,524      | −1,229     |
| `inspector/InspectorContent.tsx` | 5,547        | 5,426      | −121       |
| `inspector/InspectorPanel.tsx`   | 2,360        | 2,373      | +13        |
| **total**                        | **16,660**   | **15,323** | **−1,337** |

Roughly 40% of all component call sites live in three files. Never editing them
was correct for a 602-call-site substrate swap — it is what made the migration
one-file-at-a-time — but it is a bad steady state, and every proposal below is
ultimately about draining those three files into named, testable, reusable parts.

`InspectorPanel` going **up** is worth naming rather than hiding: adopting
`PropertyGrid` and `PropertyRow` costs a few lines at each call site even as it
removes duplicated templates elsewhere. The drain is real but it is not uniform,
and any file can move the wrong way for a stretch.

The `editor/` layer has grown from five files to twelve:

```text
editor/atoms/ChannelLockButton.tsx
editor/atoms/ChannelLockStrip.tsx
editor/atoms/RowCheckbox.tsx
editor/hooks/useRowLock.ts
editor/molecules/ControlRow.tsx
editor/molecules/GroupedInputTree.tsx
editor/molecules/InspectorSection.tsx
editor/molecules/MergeValueField.tsx
editor/molecules/ModalFormGroup.tsx
editor/molecules/PropertyGrid.tsx
editor/molecules/PropertyRow.tsx
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

**18 occurrences of 11 distinct templates**, concentrated in
`VariablePipelineStages.tsx` (8) and
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

**Correction — there are three semantic column sets, not two, and they do not
split along the widths.** An audit of all 18 occurrences found the widths actively
misleading: `72px` is the _numeric_ column in `VariablePipelineStages` and the
_label_ column in `InspectorPanel`, and `minmax(0,1fr)` variously holds a slider, a
text input, or a stacked label+field group. The four label widths simply track the
longest label string in each block — 58px for `Scale`/`Offset`, 72px for `Interp`,
96px for `Min (0.000)`, 104px for `Control Target` — which is exactly the failure a
shared token fixes. The real split is:

| Set                      | Count    | Shape                                                                                   |
| ------------------------ | -------- | --------------------------------------------------------------------------------------- |
| Property row             | 12 of 18 | `label? \| control? \| value \| actions?` — the `PropertyGrid` target                   |
| Modal form row           | 4 of 18  | `label+source \| input \| apply-button-or-fallback-text`, labels stacked _above_ fields |
| Field + commit toolbar   | 1 of 18  | `input \| Apply \| Reset`                                                               |
| Read-only key/value list | 1 of 18  | `VizijBundleSummaryPanel`'s `<dl>` — already one grid, needs no migration               |

The modal form rows belong to the deferred `ModalFormGroup` work, not here.

**None of the 18 grid rows carries its own background, border, hover or selected
state** — every card surface lives on an ancestor. So the hover/selection question
is not blocking for Phase 2. It becomes real only at `RiggingPropertyRow`, which is
a flex chassis that _does_ carry `bg-bg-panel/30`, hover and an expanded state —
i.e. R3 in Phase 3.

**Settled by measurement: use `subgrid`, not `display: contents`.** The row gets
`grid-template-columns: subgrid` and `grid-column: 1 / -1`, which inherits the
parent's tracks. Both approaches align cells identically — verified, same x
positions to the pixel — but `display: contents` deletes the row box, so:

- a selected row has to be painted cell by cell, leaving the column gaps bare; it
  renders as stripes rather than one bar, and rounded ends need
  `:first-child`/`:last-child` hacks;
- row-level `min-height` stops applying (in use at `InspectorContent:418` via
  `.inspector-row-hit-target`);
- `space-y-*` on a parent stops applying (in use at `VariablesPanel`'s modal
  sections);
- a row `title` tooltip stops working (in use at `VariablePipelineStages:1010`).

Subgrid keeps a real box, so all four just work. Cost: Chrome 117+ / Safari 16+ /
Firefox 71+, and this app declares no browserslist — so `PropertyGridRow` declares
the explicit template first and overrides it with `subgrid` under `@supports`.
Because the named templates size label and value from fixed tokens, the fallback
aligns identically; only a content-sized track can drift.

**Reserved empty tracks are the actual mechanism.** The audit's key finding: rows
that should align use different templates because one lacks a label and another
lacks a slider. `[58px_72px]` puts its number in column 2 flush left;
`[58px_minmax(0,1fr)_72px]` puts it in column 3 flush right — same card, numbers at
opposite ends. So a row renders one cell per slot _including empty ones_, and the
row API is slot props (`label`, `control`, `value`, `actions`) rather than
positional children — positional children reproduce the original bug the moment a
row omits a cell.

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

### R3. Promote the `RiggingPropertyRow` chassis → `editor/molecules/PropertyRow` — **done**

Moved with `ScrubbableLabel`, `CommitOnBlurNumberInput`, `useScrub` and its test.
Renamed: nothing about the chassis is rigging-specific. Four feature files updated.

It turned out to be a move-plus-tokenise, not a rewrite — it already imported only
react, lucide, `ui/Button` and `cn`, with no app state at all. The proof that it is
now portable is that it passes the `editor/` eslint boundary, which forbids app
state and feature imports.

Tokenised: 14 spots, including three hardcoded colours the plan had not listed —
`text-zinc-500` on the icon slot, and `bg-black/20` / `border-white/5` on the
expanded sub-panel. Those last two became `--editor-row-expanded-bg` /
`--editor-row-expanded-border` with **literal** fallbacks, because neither maps onto
an app token: they are a darkening overlay and a lightening hairline. They are also
the clearest case in the layer of a default that assumes a dark canvas, so a
light-themed consumer must override them — the `OverriddenTokens` story is built to
show exactly that.

No `--editor-modified` token was needed: the `hasDifferentDefault` dot is the
selection accent, so it reads `--editor-accent`.

**One dead-styling finding.** The reset button passed
`text-accent hover:text-accent-hover` to a `ui/Button` whose ghost variant emits
`text-text-secondary!`. An `!important` declaration wins, so the icon has always
rendered secondary, never accent — while the `hover:bg-accent/10` beside it _did_
apply, which is why it looks half-intentional. The dead classes are removed rather
than forced with a second `!`, per THEMING.md's "style button surfaces from tokens
and leave their text colour to the variant". Appearance unchanged; the code no
longer claims otherwise. Same defect class as STUDIO-116.

### R4. Deduplicate the two motiongraph `TreeRow`s — **done**

Merged into `motiongraph/components/SetTreeRow.tsx`, with the accent as a prop.

**Three corrections to what this section used to claim.**

It said the consolidation plan "flags a real bug in the divergence". It does not —
the bug §3.7 names (untokenised colours, so the rows are dark-on-dark in light mode)
is **shared by both panels**, not contained in the divergence. This section misread
its own source.

It said the two were "identical apart from a remove button and sky-vs-emerald".
There was a third difference neither document mentioned — the row wrapper — and that
is where a genuine divergence bug lived: `InputSetsPanel`'s row button is `flex-1`
with no `min-w-0`, so `min-width` stayed `auto`, the label's `truncate` was inert,
and the un-shrinkable button pushed the remove `×` **124px outside a 200px panel** —
you could not delete an input without scrolling sideways. `OutputSetsPanel` was
immune only because it has no `×` to push out. Measured before and after.

A second, smaller defect: `OutputSetsPanel`'s row was a bare `<button>`, which is
`inline-block`, so every row took 1px of line-box leading — 25px pitch against
`InputSetsPanel`'s 24px, leaving hairline stripes between the row fills. One DOM
shape fixes both.

**It stays in the feature layer, not `editor/`.** It reads no store, so the
layout-or-store rule would allow promotion — but every colour in it is a raw
`neutral-*`/`sky-*`/`emerald-*` utility, which violates the layer's "tokens only"
rule, and the thing that rule exists to prevent is precisely this component's
light-mode unreadability. Promoting it as-is would export that bug to every
consumer. The `accent` prop is itself a hardcoded-palette API; a portable version
would read `--editor-accent` scoped per panel and have no accent enum at all. That
is a redesign with a visible result, so it wants its own reviewable commit.

**Both bugs are latent: neither panel is mounted anywhere in the app.** The only
references to `InputSetsPanel`/`OutputSetsPanel` outside their own files are these
plan docs. Worth deciding whether to delete them rather than carry them.

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

> **Corrected 2026-08-06 — the tree-controller item below was wrong, and the
> survey that refuted it is the reason this section now says something else.**
> The original claim was that four consumers re-implement selection, multi-select,
> expansion and keyboard nav. Measured, it resolves to:
>
> - **Expansion is already extracted.** `scene-composer/useHierarchyTreeState.ts`
>   (166 lines, its own test file) has three callers: `HierarchyPanel.tsx:285`,
>   `SceneHierarchyPanel.tsx:39`, `StdFeatureSpacesChannelsPanel.tsx:304`/`:311`.
> - **The two holdouts differ in kind, not in detail.** The hook stores the
>   _collapsed_ set and defaults to expanded (`useHierarchyTreeState.ts:144`);
>   `VariablesPanel` stores the _expanded_ set and defaults to collapsed
>   (`:2384`). Adopting the hook there flips the default state of every folder —
>   a visible behaviour change. Its keys are also accreted path strings
>   (`` `${parent.id}/${key}` ``, `:884`), which the hook's stale-id prune would
>   drop on every tree rebuild.
> - **The motiongraph panels have no tree state at all.** `SetTreeRow.tsx:6`
>   documents it: children are always visible, there is no collapse, and `:22`
>   records the deliberate decision not to build on `ui/TreeRow`.
> - **Multi-select has exactly one implementation** (`HierarchyPanel.tsx:310`,
>   cmd/ctrl only). It is a projection of `state/selectionStore`'s cross-panel
>   `selectionStack`, so pulling it into `editor/` would import the store into a
>   layer whose entire purpose is not to know about it. Shift-click range-select
>   does not exist anywhere, and no consumer flattens a tree to visible order, so
>   there is not even a definition of "range" to unify.
> - **Keyboard nav has zero implementations.** So this was never _unify_; it is
>   _add_.
>
> The one real duplicate is `VariableSelector.tsx:1074-1088`, a hand-rolled copy
> of the hook's prune loop — ~15 lines, fixed by calling the existing hook, not
> by writing a controller.
>
> **What replaces it: R7 below.** Zero keyboard access to any tree is a real
> defect, and it belongs in `ui/TreeRow` where all six render sites inherit the
> fix, not in a hook two of them would call.

#### R7 — keyboard navigation and ARIA for the tree primitive

`ui/TreeRow.tsx` renders a bare `<div onClick>` with no `role`, no `tabIndex`,
no key handler; the expander `<button>` is the only focusable thing in a row.
The whole hierarchy is unreachable without a mouse.

The split that makes this work without touching consumer state:

- **Navigation is positional, so the container owns it.** A new `ui/TreeRoot`
  carries `role="tree"` and resolves Up/Down/Home/End by querying
  `[role="treeitem"]` in DOM order at keypress time. Collapsed subtrees are
  unmounted, so the query _is_ the visible order — no registry, no ids, no
  flattener, and nothing for a consumer to keep in sync.
- **Activation is per-row, so the row owns it.** Left/Right/Enter/Space need
  `onToggle`/`onSelect`, which only `TreeRow` holds.

`role="treeitem"` goes on the outer wrapper, not the visual row, because a
treeitem's `role="group"` must be its descendant and the children container is
today a _sibling_ of the row. The focus ring is re-targeted onto the row with a
named Tailwind group so the outline does not draw around the whole subtree.

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

Each step is independently mergeable and must keep `validate` green. Steps within
a phase are order-independent.

The visual regression suite that used to be part of this gate was removed; visual
checking is Storybook's job now, and that tooling is not in place yet.

### Phase 1 — prove the pattern (low risk, high signal) — **done**

1. ~~R1 merge `RiggingScalarRow`s~~ — done. They had diverged; material semantics
   kept, morph gains constraint clamping and blocked-binding handling.
2. ~~R2 extract `ControlRow`~~ — done, as `editor/molecules/ControlRow`.
3. ~~Adopt `InspectorSection` for the section cards~~ — done for **five**, not ten
   (see the correction below).
4. ~~Extract `BulkSelectCheckbox`~~ — done, as `editor/atoms/RowCheckbox`, at five
   sites. `MergeValueField` is **deferred**; see below.

Plus a guardrail the plan asked for: the eslint import boundary, which required
making `ui/ThemeToggle` controlled first — it held the only `ui/` → `src/state/`
import in the app.

#### Two corrections from doing it

**There are nine bordered sections, not ten, and they are two species.** Five are
inspector sections (`p-2`, uppercase muted label, mono count) and converted
cleanly. The other four are **modal form groups**: `p-3`, `space-y-*` instead of
`gap`, and a `text-xs font-semibold text-text-primary` header. The plan's claim
that they "differ only in padding and border opacity" was wrong — the header
typography differs too, so converting them is a design decision, not a refactor.

**`MergeValueField` is not a mechanical extraction.** Its three sites
(`VariablesPanel.tsx` ~8012, ~8267, ~8559) each drive a _different_ draft-state
setter, over different field arrays, with different value sources. A shared
component needs a common draft shape designed first — which is the same design
work the four modal form groups above need.

So those two belong together as one follow-up: **a `ModalFormGroup` + `MergeValueField`
pair**, covering the four `p-3` sections and the three merge fields. That is a
Phase 2-sized piece of design, not a Phase 1 cleanup.

### Phase 2 — the grid — **done**

1. ~~Prototype `PropertyGrid` and settle the `display: contents` question~~ —
   done, and it went the other way: **`subgrid`**, measured against
   `display: contents` in a spike. See §2.
2. ~~Migrate the remaining templates~~ — done for every **property row**; see the
   scope table below for what was deliberately left.
3. ~~Delete `.inspector-row-hit-target` / `.inspector-numeric-control`~~ — done,
   replaced by `--editor-row-min-height` / `--editor-numeric-width`.

#### Canonical column widths

`--editor-col-label: 72px` — the widest label width any migrated site used, so no
existing label truncates. `--editor-col-value` **chains off
`--editor-numeric-width` (88px)** rather than carrying its own number, so a grid
value cell and a flex numeric cell are the same width by construction. Changing the
inspector's proportions is now one token, not eighteen call sites.

Visible deltas, all deliberate: the parent-link card's label goes 58px → 72px and
its number 72px → 88px; the stage sliders' number goes 90px → 88px.

#### Correction: the stage sliders never aligned

Phase 2 claimed the stage sliders were fixed and cited "all three numbers at
left=238, width 88". **That measurement was taken in a Storybook story, not in the
panel**, and it does not transfer. Measured in the real component
(`Editor Tools/VariablePipelineStages → StageSliders`):

| stage        | resolved template        | number offset       |
| ------------ | ------------------------ | ------------------- |
| Direct Input | `139.86px 88px 102.14px` | **164.86**          |
| Override     | `237px 88px 5px`         | **262**             |
| Poses        | `203px 88px 5px`         | 245 (also indented) |

Direct Input and Override sit in identically sized, identically placed grids, so
they are directly comparable — and their numbers are **97.14px apart**, exactly the
width of the Reset button in Direct Input's actions cell.

**Why the story misled.** `LabelLessRowsAlign` puts all three rows in _one_ grid,
where it genuinely works. The panel has **three separate `PropertyGrid` instances**,
one per collapsible. Subgrid ties a row to its own parent grid's tracks and nothing
further, so three grids resolve their content-sized `auto` actions track
independently: Override's empty actions cell collapses to ~5px and its `1fr` control
swallows the 97px that Direct Input's Reset occupies.

**The rule that actually holds** — and the one §2 should have stated:

> Within one grid, every track aligns, `auto` included. Across separate grids, only
> tracks with a **definite** width align. `--editor-col-label` and
> `--editor-col-value` do. `minmax(0,1fr)` and `auto` cannot.

That is why the parent-link card and the two `InspectorSection`s _do_ align — every
track they depend on is a fixed token — and why the stage sliders do not.

**Fixing it is a design decision, not a bug fix**, which is why it is not done here.
Three options:

1. **`--editor-col-actions` with a definite width.** Consistent with the label and
   value tokens, and the smallest change. Costs the two label-less stages ~97px of
   slider in a 346px panel — 28% — to reserve a track they never use.
2. **Move `Reset` out of the row.** It is arguably a stage-level affordance, not a
   row action; then all three stages use `control-value` and align at 262 with no
   slider lost. Cleanest result, largest change to the panel.
3. **Accept it.** The three stages are in separate collapsibles and rarely open at
   once, so the misalignment may not be worth 97px of slider.

#### What was migrated, and what was not

| Sites                                                                | Verdict                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Parent-link card — Scale / Offset / Value (`VariablePipelineStages`) | Migrated. Numbers were at opposite ends of one card; now one column.                                                                                                                                                     |
| Stage sliders — Poses / Direct Input / Override                      | Migrated to `control-value-actions`, but **they still do not align — that claim was wrong.** See the correction below.                                                                                                   |
| Child-link card (`VariablePipelineStages`)                           | **Deleted, not migrated.** It was a hand-inlined copy of `LinkControlEditor`, which already takes `context="child"`. −46 lines and two templates for free.                                                               |
| `InspectorPanel` Interp / time-field / Value                         | Migrated.                                                                                                                                                                                                                |
| `InspectorContent:418` — `[104px_minmax(0,1fr)_94px_138px]`          | **Deferred.** The only responsive one (`grid-cols-1` below `sm:`), and its column 2 is a `relative` positioning context for three absolutely-positioned slider overlays. Worth its own change with its own verification. |
| `InspectorPanel:1196`, `InspectorContent:4876`, 3 × `VariablesPanel` | **Out of scope by classification** — modal form rows and a commit toolbar, not property rows. They belong to the deferred `ModalFormGroup` work.                                                                         |
| `VizijBundleSummaryPanel:38` — `<dl>`                                | **Needs no migration.** Already one grid with no row wrappers; it is the existence proof, not a defect.                                                                                                                  |

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
