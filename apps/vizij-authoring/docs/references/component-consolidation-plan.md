# Component Consolidation Plan — `vizij-authoring` (2026-08-05)

Analysis only. Nothing here has been implemented.

Supersedes `docs/references/ui-component-inventory.md` (2025-11-20), which is stale: it
describes `WorkbenchNav.tsx`, `ObjectInspector.tsx`, `ObjectHeader.tsx`, `DriverPanel.tsx`,
`DriverBindingSection.tsx`, `SceneComposerWorkbench.tsx` and `poseRig/components/*` — none of
which exist any more — and predates the `@base-ui/react` → `@semio/ui` + `radix-ui` migration
and the Storybook layer. Read it for intent, not for facts.

## Why the boundary matters

`src/components/ui/**` is intended to be extracted into a consumable package (this is stated
in `.storybook/main.ts`, which is why stories are colocated). Everything below is judged
against that: _can this file be lifted out of the app without dragging app state, app CSS or
app domain types with it?_

## Method and provenance

Every claim below was read against current source. Where a starting assumption turned out to
be wrong, it is called out explicitly under **Corrections to prior assumptions**.

---

## 1. Corrections to prior assumptions

| Claim as given                                                                                               | Verdict                                                                       | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common/FilterableSelect` is dead                                                                            | **Confirmed dead**                                                            | Zero references anywhere in the repo outside its own file and its own story (`FilterableSelect.stories.tsx`). 349 lines.                                                                                                                                                                                                                                                                                                                                                                                              |
| `common/FilterableSelect` duplicates `ui/Combobox`                                                           | **True, with a caveat**                                                       | Both are hand-rolled searchable selects with click-outside, keyboard nav and highlight index. `FilterableSelect` ships **zero styles of its own** (14 `*ClassName` props) whereas `Combobox` is fully styled. So it is not a drop-in replacement — but since nothing uses it, that is irrelevant.                                                                                                                                                                                                                     |
| `SidebarSection` now reuses `CollapsibleGroup`                                                               | **Confirmed**                                                                 | `common/SidebarSection.tsx` delegates its instructions panel to `ui/CollapsibleGroup`. Its only import is `../ui/CollapsibleGroup`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `InstructionCallout` remains a separate collapsible                                                          | **Confirmed, and justifiably so**                                             | It is optionally controlled (`isOpen`/`onToggle`), has a `trigger: "self" \| "external"` mode that renders the body with **no trigger at all**, takes an `icon` slot, and puts a caller-supplied `contentId` on the panel. `CollapsibleGroup` exposes none of that. **However**: all 5 real call sites (`ExportDialog.tsx:296`, `DebugPanel.tsx:571/603/632/700`) use only `label` + `icon` + children. `trigger="external"`, `isOpen`, `onToggle`, `contentId` and `size="compact"` are **unused by any call site**. |
| `RowSlider` (native range) vs `Slider` (radix) are two sliders, and only the non-tokenised one is exported   | **Half true — correct the second half**                                       | Two sliders, yes. But _both_ are partly untokenised. `RowSlider` uses `bg-zinc-800/60`, `accent-blue-500`, `bg-blue-500` thumb; `Slider` uses `bg-zinc-800` track, `bg-white` thumb and `ring-blue-500/50`. `Slider` is tokenised only for its `fillMode="value"` fill (`bg-accent`). Neither is theme-clean. The export asymmetry is real: `RowSlider` is in `ui/index.ts`, `Slider` is not.                                                                                                                         |
| `RiggingPropertyRow`'s `CommitOnBlurNumberInput` / `ScrubbableLabel` / `useScrub` duplicate `ui/NumberField` | **Partly true — do not merge as stated**                                      | They duplicate the _numeric engine_ (parse/clamp/commit-on-blur, scrub-by-drag), but not the _component_. See §3.6 — this is the one item where the obvious merge is the wrong call.                                                                                                                                                                                                                                                                                                                                  |
| Two bespoke wizards with no shared stepper                                                                   | **Correct that they share nothing; wrong that a stepper is the shared piece** | `PoseGraphRemapWizard` **has no steps at all** — it is a single-screen modal with a filter toolbar. Only `DiscrepancyWizard` has a 3-way step nav. What they actually share is a Modal + icon-header + scroll body + Cancel/Apply footer shell. See §5.2.                                                                                                                                                                                                                                                             |
| "~9 panel scaffolds"                                                                                         | **Confirmed — 9 files**                                                       | `<Panel className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0">` appears verbatim in 8 files (9 sites), and `title="Hide panel"` close buttons appear in 11 places across 9 files.                                                                                                                                                                                                                                                                                                                     |
| Barrel exports                                                                                               | **Note**                                                                      | `ui/index.ts` omits `EmptyState`, `NumberField`, `Slider` and `ThemeToggle`. All four are imported by deep path from feature code. This is an inconsistency, not a bug.                                                                                                                                                                                                                                                                                                                                               |

---

## 2. Row inventory

`Row` is heavily overloaded in this codebase — it names presentational primitives, domain
components, and plain data records (`InputCatalogRow`, `PoseGraphRemapRow`,
`VariableCopyLinkRowDraft`, …). Only UI is listed here.

### 2a. Declared row components

| Component                     | File:lines                                      | What it renders                                                                                                                                                                       | Domain logic it carries                                                                                                                                                                                                                                                                                                                                | Verdict                                                                                                 |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `TreeRow`                     | `ui/TreeRow.tsx:22`                             | Indented row: expander chevron, icon slot, truncated label with query highlight, hover-revealed actions slot, selection accent bar, recursive children container                      | **None.** Pure props. `depth`, `hasChildren`, `isSelected`, `highlightQuery`                                                                                                                                                                                                                                                                           | **Keep as-is.** Best-shaped primitive in the file. 27 references.                                       |
| `ListRow`                     | `ui/ListRow.tsx:13`                             | Bordered card: title + description block, meta + actions on the right, optional children below                                                                                        | **None.** But no `selected` state and no whole-row `onClick` semantics beyond spread props                                                                                                                                                                                                                                                             | **Keep, extend with `selected`** — see §3.4                                                             |
| `FieldRow`                    | `ui/FieldRow.tsx:13`                            | Label(+hint) on the left, control on the right; `renderLabelInControl` clones the control to inject `label`/`hint`                                                                    | **None.** The `cloneElement` path is a smell but harmless                                                                                                                                                                                                                                                                                              | **Keep.** Only 3 real call sites (`ExportPanel` ×4, `MaterialEditor` ×1). Underused, not wrong.         |
| `CollapsibleRow`              | `ui/CollapsibleRow.tsx:49`                      | Radix Collapsible: title/subtitle, inline `RowSlider`, actions well, expandable body                                                                                                  | **None**, but it _bakes in_ `RowSlider` — a value/min/max/step/onValueChange API on a collapsible container                                                                                                                                                                                                                                            | **Split** — see §3.3                                                                                    |
| `RowSlider`                   | `ui/RowSlider.tsx:23`                           | Optional label + native `<input type=range>` + amber default marker + numeric `Input`                                                                                                 | **None.** But depends on app CSS `inspector-row-hit-target`, `inspector-numeric-control`                                                                                                                                                                                                                                                               | **Merge into `Slider`** — see §3.3                                                                      |
| `RiggingPropertyRow`          | `inspector/RiggingPropertyRow.tsx:195`          | Row chassis: chevron, `hasDifferentDefault` accent dot, label (scrubbable **or** static), main-input slot, reset button, row-action slot, expanded Def/Min/Max/Editable sub-rows      | **None in the shell.** All domain arrives via `renderX()` render props. Its siblings in the same file (`useScrub`, `ScrubbableLabel`, `CommitOnBlurNumberInput`) are also domain-free                                                                                                                                                                  | **Promote the shell to `ui/`** — see §3.6. It is misfiled, not wrong.                                   |
| `RiggingScalarRow` (material) | `RiggingMaterialSection.tsx:236-517`            | `RiggingPropertyRow` + 4 flat `bg-bg-input/50 h-5` boxes (`ScrubbableLabel` + `CommitOnBlurNumberInput`) for current/default/min/max + lock pill                                      | **Heavy.** `useBindingAuthoring` (`lockedInspectorTargetIds`, `handleSetInspectorTargetLocked`), `resolveEffectiveControllableBindingStandardInput`, `resolveFaceInspectorCurrentValue`, `scrubValuesRef` snapshots, 3-way write path (bound input / animatable / raw feature), dual constraint write (`onUpdateStandardInput` + `onConstraintChange`) | **Merge with morph twin** — §3.1                                                                        |
| `RiggingScalarRow` (morph)    | `RiggingMorphTargetsSection.tsx:215-491`        | Same                                                                                                                                                                                  | Same, minus type safety (`feature: any`)                                                                                                                                                                                                                                                                                                               | **Merge** — §3.1                                                                                        |
| `RiggingColorRow`             | `RiggingMaterialSection.tsx:518-1076`           | `RiggingPropertyRow` + radix Popover swatch (`react-colorful`) + hex readout + 3 R/G/B numeric boxes + 3 per-channel lock pills                                                       | Same domain as scalar ×3 channels, plus `rgbToHex`/`hexToRgb`, multi-target lock aggregation                                                                                                                                                                                                                                                           | **Partial merge** — §3.2                                                                                |
| `RiggingVectorRow`            | `RiggingTransformSection.tsx:181-659`           | Same as color minus swatch, plus rotation degree display                                                                                                                              | Same, plus `rotationDisplayMode`, `useDegreeDisplay`, `toRotationDisplayValue`/`from…`, object/array/scalar constraint decoding                                                                                                                                                                                                                        | **Partial merge** — §3.2                                                                                |
| `TrackRow`                    | `animation/TrackRow.tsx:17`                     | Fixed-192px header (colour dot, label, `interpolation · N keys`) + absolutely-positioned rotated-diamond keyframes on a timeline lane                                                 | **Heavy and irreducible.** `useAnimationStore` directly (`selectKeyframe`, `selectTrack`, `updateKeyframe`), window-level pointer drag converting clientX → track time against a hardcoded `headerWidth = 192`                                                                                                                                         | **Leave alone.** Not a row in the same sense — it is a timeline lane.                                   |
| `FlatInputControlRow`         | `panels/VariablesPanel.tsx:2832-2963`           | Card row: `Sliders` icon + label + `ml-auto` actions; body is `Slider` or "Derived control (read-only)"; amber locked footer. `role="button"` + Enter/Space, `marginLeft: depth * 14` | **Almost none.** Coerces `row.value` to finite, unwraps radix's `number[]`, calls `onValueChange(row.inputId, value)`. Only coupling is the `InputCatalogRow` type                                                                                                                                                                                     | **Extract to `ui/`** — §3.5. Highest value-for-risk item in the file.                                   |
| `TreeRowWrapper`              | `panels/VariablesPanel.tsx:2153-2818`           | Recursive tree node. Input nodes → `FlatInputControlRow`; everything else → `ui/TreeRow` + `OwnershipScopeIcon` + a ~300-line actions fragment                                        | **Very heavy.** Node-kind discrimination and casts to `PoseNodeData`/`RigNodeData`/`PoseGroupNodeData`, reference-face `source` semantics, bulk-selection sets, `resolveFaceOwnershipScope`, `buildRigInputPath` + motion-graph path membership, timeline lock sets                                                                                    | **Leave in the panel.** Extract only `BulkSelectCheckbox` (4 verbatim copies) and `OwnershipScopeIcon`. |
| `FeatureRow`                  | `inspector/FeatureList.tsx:372-539`             | Not a row — a mode switch. `features` mode → `CollapsibleGroup` + `Switch` + two hand-rolled `<table>`s; `bindings` mode → maps to `FeatureBindingRow`                                | Feature/animatable semantics, matrix construction                                                                                                                                                                                                                                                                                                      | **Rename, don't merge.** Misleading name.                                                               |
| `FeatureBindingRow`           | `inspector/FeatureList.tsx:567-733`             | Card + "Hidden" banner (`Chip` + `Button`) + `ui/CollapsibleRow` wrapping a `BindingEditor`                                                                                           | `hiddenDriverIds`/`hiddenMode`, `resolveSlotDriverId`, imperative `document.querySelector('[data-row-id]').scrollIntoView`, constraint range assembly                                                                                                                                                                                                  | **Leave.** Genuinely a feature component.                                                               |
| `DemoEmotionRow`              | `app/emptyStateDemo/DemoEmotionRow.tsx:28`      | Horizontal strip of emotion `Button`s                                                                                                                                                 | `useVizijRuntime`, `buildPoseWeightPathMap`, `resolvePoseSemantics`, `animateValue` with release timers                                                                                                                                                                                                                                                | **Leave.** Misleading name only; it is a button strip, not a row.                                       |
| `TreeRow` (local)             | `motiongraph/components/InputSetsPanel.tsx:81`  | Recursive tree row: checkbox square + label + remove `×`                                                                                                                              | `useEditorStore` paths, leaf/branch discrimination                                                                                                                                                                                                                                                                                                     | **Merge with its twin, then onto `ui/TreeRow`** — §3.7                                                  |
| `TreeRow` (local)             | `motiongraph/components/OutputSetsPanel.tsx:91` | Same, minus remove button, emerald instead of sky                                                                                                                                     | Same                                                                                                                                                                                                                                                                                                                                                   | **Merge** — §3.7                                                                                        |

### 2b. Row-shaped inline JSX with no component at all

These are the ones that matter most, because they are invisible to any inventory that only
counts files.

| Shape                                                                                                                    | Sites                                                                                                                                                                | Delta between copies                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `renderAnimatableRow` (per-channel lock pill strip)                                                                      | `RiggingMaterialSection.tsx:1005-1040`, `RiggingTransformSection.tsx:588-620`                                                                                        | Byte-identical except `component.label.substring(0,1)` vs `component.componentLabel`, and `label` vs `displayLabel` in titles |
| `renderRowAction` (lock/unlock pill, rose/sky, `Lock`/`LockOpen` @10px)                                                  | `RiggingMaterialSection.tsx:501-516` and `:1055-1074`, `RiggingMorphTargetsSection.tsx:472-489`, `RiggingTransformSection.tsx:632-654`                               | Title string only                                                                                                             |
| `toggleRowLock`, single-target (5 lines)                                                                                 | `RiggingMaterialSection.tsx:318-323`, `RiggingMorphTargetsSection.tsx:297-302`                                                                                       | Byte-identical                                                                                                                |
| `toggleRowLock`, multi-target (17 lines incl. `lockableTargetIds`/`lockedTargetCount`/`areAllLockableTargetsLocked`)     | `RiggingMaterialSection.tsx:632-652`, `RiggingTransformSection.tsx:335-354`                                                                                          | Byte-identical                                                                                                                |
| "Both Faces Value/Weight" callout (`border-cyan-500/35 bg-cyan-500/10`, `Slider` + `NumberField` + amber desync warning) | `InspectorContent.tsx:2150`, `:2371`, `:2961`, `:4806`                                                                                                               | Rig pair vs pose pair: range source (`input.range` vs `0..1`) and display-value round-trip                                    |
| "Neutral direct value" row                                                                                               | `InspectorPanel.tsx:1888-1934`, `:2314-2360`                                                                                                                         | `setActiveGroupNeutralDirectValue` → `setActiveStageNeutralDirectValue`                                                       |
| "Composition channel" row                                                                                                | `InspectorPanel.tsx:1974-2010`, `:2394-2430`                                                                                                                         | `channel.maxActivity` → `channel.activity`, two copy strings                                                                  |
| Scope tab strip                                                                                                          | `InspectorContent.tsx:2052-2076` (`renderRigScopeTabs`), `:2077-2101` (`renderPoseScopeTabs`)                                                                        | State pair only — byte-identical otherwise                                                                                    |
| `InspectorSection`-shaped div (`rounded border border-border-default/60 bg-bg-panel/35 px-2 py-2 flex flex-col gap-2`)   | `InspectorPanel.tsx` — component defined at `:232`, used at 4 sites, **inlined at 12 more** (1089, 1225, 1330, 1388, 1441, 1552, 1655, 1754, 1946, 2032, 2180, 2372) | None — the component already exists and is simply not used                                                                    |
| Bordered `section` card (uppercase title + mono count)                                                                   | `VariablesPanel.tsx` ×10 (7576, 7628, 7692, 7727, 7803, 7968, 8073, 8163, 8495, 8558)                                                                                | Padding `p-2`/`p-3` and border opacity                                                                                        |
| `MergeValueField` (label + number input + "Use current X" button)                                                        | `VariablesPanel.tsx:8107-8158`, `:8344-8414`, `:8663-8712` (4 instances across 3 blocks)                                                                             | Field name and button copy                                                                                                    |
| `renderProceduralAvailableGroups` / `renderAnimationAvailableGroups`                                                     | `VariablesPanel.tsx:6632-6736`, `:6737-6835`                                                                                                                         | Expansion-state set and the row-actions fragment; ~100 lines otherwise identical                                              |
| Bulk-select checkbox label                                                                                               | `VariablesPanel.tsx:2465`, `:2547`, `:2640`, `:2722`                                                                                                                 | Label text and handler                                                                                                        |
| `EmptyState` + "Clear Search" action                                                                                     | `VariablesPanel.tsx:7482-7508`, `:7839-7885`                                                                                                                         | Copy only                                                                                                                     |
| Rigging section shell (`flex flex-col gap-0.5 p-1.5 rounded-lg border` + `text-[9px] uppercase` title)                   | `RiggingMaterialSection.tsx:298`, `RiggingTransformSection.tsx:74`, `RiggingMorphTargetsSection.tsx:123`, `InspectorContent.tsx:5448`                                | Title; **`RiggingMorphTargetsSection` alone is untokenised** (`bg-zinc-900/40 border-zinc-800/50 text-zinc-500`)              |

---

## 3. Consolidation proposal, ordered by value-for-risk

### 3.1 Merge the two `RiggingScalarRow`s — **highest value, lowest risk**

Two ~280-line components with the same name in two files. I diffed them line-for-line. Only
**three** differences are semantic; the other seven are drift:

| #   | Material                                                                                                                        | Morph                                                                                   | Semantic?        |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------- |
| 1   | `export function`                                                                                                               | module-private                                                                          | no               |
| 2   | `feature: SceneObjectFeature`                                                                                                   | `feature: any`                                                                          | type safety only |
| 3   | destructure order                                                                                                               | swapped                                                                                 | no               |
| 4   | `isBound = !!(inputId && standardInput) && !blockedReason`                                                                      | splits out `hasInputMetadata`, then `isBound = hasInputMetadata && !blockedReason`      | enabling         |
| 5   | `minVal = isBound ? range.min : constraints?.min` — may be `undefined`, deliberately ("undefined means unbounded, don't clamp") | `minVal = hasInputMetadata ? range.min : (constraints?.min ?? 0)` — falls back to **0** | **yes**          |
| 6   | `hasDifferentDefault = isBound && …`                                                                                            | `= hasInputMetadata && …` — reset dot shows even when blocked                           | **yes**          |
| 7   | `CommitOnBlurNumberInput` gets `min`/`max` for current/default                                                                  | `min`/`max` **omitted** — morph values are not clamped on commit                        | **yes**          |
| 8   | `onConstraintChange?.()`                                                                                                        | `onConstraintChange()` required                                                         | no               |
| 9   | `standardInput!.defaultValue`                                                                                                   | `standardInput?.defaultValue`                                                           | no               |
| 10  | `as number` casts in scrub handlers                                                                                             | dropped (because `feature: any`)                                                        | no               |

**Proposal.** One `RiggingScalarRow` in a shared inspector module, parameterised on the three
real differences:

```ts
interface RiggingScalarRowProps {
  // … existing props, with feature: SceneObjectFeature (not any)
  /** How an unbound constraint bound is interpreted.
   *  "unbounded": undefined min/max means no clamp (material behaviour)
   *  "zero-floor": undefined min/max falls back to 0 (morph behaviour)      */
  boundsFallback?: "unbounded" | "zero-floor";
  /** Whether commit clamps to [min,max]. Material: true. Morph: false.      */
  clampOnCommit?: boolean;
  /** Whether the "differs from default" dot and range reads follow
   *  isBound (material) or hasInputMetadata (morph).                        */
  boundsSource?: "bound" | "metadata";
}
```

Defaults match the material behaviour; `RiggingMorphTargetsSection` passes the other three.

**Call sites to change:** `RiggingMaterialSection.tsx` (self, plus its re-export consumed at
`InspectorContent.tsx:5470`) and `RiggingMorphTargetsSection.tsx` (self). Two files.

**Risk:** low, but not zero — differences 5/6/7 are behaviour, so morph-target editing needs a
manual pass. `RiggingMorphTargetsSection.test.tsx` and `RiggingTransformSection.test.tsx`
exist and should catch regressions.

**Uncertain:** whether the morph fork is _intentional_ or accumulated drift. The material
version carries an explicit comment defending `undefined` as "unbounded"; the morph version
carries no comment. I would guess drift, but I cannot prove it, so the proposal preserves both
behaviours behind flags rather than picking a winner.

### 3.2 Extract the lock machinery from all four Rigging rows — **high value, low risk**

Three verbatim duplicates with zero semantic difference:

1. `useRowLock(targetIds: string[])` → `{ isLocked, toggle }`. Covers both the single-target
   (2 copies) and multi-target (2 copies) shapes — single-target is just `targetIds.length === 1`.
   Internally reads `useBindingAuthoring().lockedInspectorTargetIds` and calls
   `handleSetInspectorTargetLocked`. **Stays in the app** (touches app state).
2. `<ChannelLockButton locked title onToggle />` — the rose/sky `Lock`/`LockOpen` pill.
   Presentational; `ui/` candidate, though tiny.
3. `<ChannelLockStrip channels />` — the `renderAnimatableRow` pill row. Normalise the two
   label shapes to one field (`shortLabel`) and drop the `substring(0,1)` in the material copy.

**Call sites:** `RiggingMaterialSection.tsx` (×2 rows), `RiggingTransformSection.tsx`,
`RiggingMorphTargetsSection.tsx`. Also worth checking `RiggingMorphTargetsSection.tsx:83-118`,
which reimplements the same aggregation at section level for Lock-All/Unlock-All.

Net: roughly 120 duplicated lines removed. No API surface changes outside these four files.

### 3.3 Collapse `RowSlider` into `Slider` — **medium value, medium risk**

Current state:

- `RowSlider` (native `<input type=range>`, blue thumb, bundled numeric `Input`): used in
  exactly **2** places — inside `ui/CollapsibleRow.tsx:120`, and `StdFeatureSpacesControls.tsx:611`.
- `Slider` (radix, white thumb, no numeric field): used in **4** files —
  `InspectorContent`, `InspectorPanel`, `VariablePipelineStages`, `VariablesPanel`.
- They already share `sliderDefaultBehavior.ts` (`resolveSliderDefaultPercent`,
  `resolveSnappedSliderValue`), so the _behaviour_ is unified; only the rendering is forked.

**Proposal.** Keep one slider — `Slider` (radix), because it is the one with 4× the usage,
the one with a documented keyboard-propagation contract, and the one that does not carry a
native-range appearance hack. Give it two additive props:

```ts
interface SliderProps {
  // … existing
  /** Renders a numeric field beside the track (RowSlider's current shape). */
  numericField?: boolean;
  /** Uppercase label to the left of the track. */
  label?: string;
}
```

Then delete `ui/RowSlider.tsx`, retarget `CollapsibleRow` and `StdFeatureSpacesControls`, and
add `Slider` to `ui/index.ts` (removing `RowSlider`).

**What changes visually:** the thumb goes blue→white and the track loses `accent-blue-500`.
That is a deliberate look change on 2 call sites. It should be agreed before starting.

**Risk note:** `Slider.tsx`'s docblock says `InspectorContent.tsx:426` overlays absolute
markers positioned against a wrapper that assumes Root and Track stay coextensive. Adding a
sibling numeric field inside `Root` would break that. The numeric field must be a sibling of
`Root`, not a child. Flagging because it is easy to get wrong.

**Also fix while here:** both sliders hardcode `zinc`/`blue`/`white`. Tokenise as part of this.

### 3.4 `ListRow` gains selection; `AuthoringTargetList` adopts it — **medium value, low risk**

`AuthoringTargetList.tsx:192-260` hand-rolls a row that is `ListRow` plus: a `selected` border
state, a full-width `<button>` wrapping title+meta, and an action bar _below_ rather than
beside. `ListRow` currently has no `selected` and no notion of a primary action.

```ts
interface ListRowProps {
  // … existing: title, meta, actions, description, children
  selected?: boolean;
  onActivate?: () => void; // makes title+description a button
  footer?: ReactNode; // action bar below the divider
}
```

**Call sites:** `AuthoringTargetList.tsx` (adopt), `StandardInputCoveragePanel.tsx:108`
(unchanged), `GraphDiagnosticsPanel.tsx:554` (unchanged).

I am only moderately confident this is worth it — see §6.

### 3.5 Extract `FlatInputControlRow` to `ui/ControlRow` — **high value, low risk**

Currently 130 lines inside an 8,753-line file, with **7 call sites** (`VariablesPanel.tsx`
2309, 6674, 6778, 7596, 7657, 7755, plus its use inside `TreeRowWrapper`). It carries almost
no domain logic — its only coupling is the `InputCatalogRow` shape.

```ts
export interface ControlRowProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  defaultValue?: number;
  step?: number;
  editable?: boolean; // false → "Derived control (read-only)"
  selected?: boolean;
  locked?: boolean;
  lockedMessage?: string; // amber footer
  depth?: number; // marginLeft = depth * 14
  icon?: ReactNode;
  actions?: ReactNode;
  onSelect?: () => void; // row is role="button" + Enter/Space
  onChange?: (value: number) => void;
}
```

The `InputCatalogRow` → props mapping stays in `VariablesPanel` (one small adapter), as does
the value pipeline (`handlePanelInputValueChange`, `isInputCatalogRowLocked`).

**Storyworthy:** yes. It has five independent visual states (editable / derived / selected /
locked / nested) that are currently only reachable by driving the whole app.

**Bonus:** the same `role="button"` + Enter/Space + selected-card pattern is re-implemented at
`VariablesPanel.tsx:7281-7402` (blend-stage row). That could adopt `ControlRow` with
`editable={false}` — worth checking, not worth forcing.

### 3.6 `RiggingPropertyRow` → `ui/`, but **do not** merge its inputs into `NumberField`

This is the item where the obvious move is wrong, so it deserves detail.

**What is genuinely duplicated:** `useScrub` and `NumberField`'s pointer scrubbing implement
the same math (`startValue + delta * step`, threshold-gated). `CommitOnBlurNumberInput` and
`NumberField` with `commitMode="blur"` implement the same commit semantics.

**Why they are not interchangeable:**

|                   | `ScrubbableLabel` + `CommitOnBlurNumberInput`                                                              | `ui/NumberField`                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Scrub handle      | the **label**, not the input                                                                               | the input itself                                                         |
| Height            | 20px flat box (`bg-bg-input/50 h-5`), borderless input                                                     | `TextField` with persistent outline + steppers, 28–36px                  |
| Steppers          | none                                                                                                       | always rendered                                                          |
| Escape key        | reverts the draft                                                                                          | **not handled**                                                          |
| Event isolation   | stops click/mousedown/pointerdown/keydown unconditionally                                                  | stops pointer events only when `allowScrub={false}`; never stops keydown |
| Scrub start value | caller-owned via `scrubValuesRef` (survives value living in 3 different stores depending on binding state) | derived from the `value` prop at pointerdown                             |

Swapping in `NumberField` would roughly double the row height across the entire rigging
inspector and remove the label-as-scrub-handle affordance, which is the primary editing gesture
there. That is a redesign, not a refactor.

**Proposal instead:**

1. Move the shared scrub math into one hook used by both — `useDragScrub({ onDelta, thresholdPx })`
   in `ui/`. `NumberField` calls it internally; `ScrubbableLabel` calls it too.
2. Move `RiggingPropertyRow` (the shell — it is domain-free, all domain arrives via `renderX()`
   render props) into `ui/PropertyRow`, and `CommitOnBlurNumberInput` into
   `ui/InlineNumberInput` (rename: nothing about it is rigging-specific).
3. Add `Escape` handling to `NumberField` so the two agree.
4. Leave the visual difference alone. Two numeric affordances at two densities is a legitimate
   design decision, not an accident.

**Risk:** the file move touches 4 importers (`RiggingMaterialSection`, `RiggingTransformSection`,
`RiggingMorphTargetsSection`, `RiggingPropertyRow.test.tsx`). Mechanical.

### 3.7 Deduplicate the two motiongraph `TreeRow`s — **low value, low risk, but a real bug**

`motiongraph/components/InputSetsPanel.tsx:81` and `OutputSetsPanel.tsx:91` each define a
private `TreeRow`. I diffed them: identical except the accent colour (`sky-*` vs `emerald-*`)
and the presence of the remove `×` button.

Both are **entirely untokenised** — `neutral-800`, `neutral-600`, `neutral-500`, `sky-600/20`,
`emerald-600/20`. In light mode these are dark-on-dark. This is a light-mode rendering bug, not
just duplication.

**Proposal:** one `SetTreeRow` shared by both panels, tokenised, with `accent` and `onRemove`
props. Do **not** try to route it through `ui/TreeRow` — that primitive's model is
expander-chevron + selection, whereas these are checkbox-toggle leaves with disabled branches.
Forcing the merge would add three flags to `TreeRow` for one caller.

### 3.8 Delete `common/FilterableSelect` — **free**

349 lines + a story, zero call sites. `ui/Combobox` covers the use case. Delete both files.

The only argument for keeping it is that it is fully unstyled (14 `*ClassName` props) and might
be wanted as a headless base later. That is speculative; `ui/Combobox` is not headless but is
the one actually in use. Delete it; git remembers.

---

## 4. Layering classification

Legend: **(a)** publishable primitive · **(b)** app-specific composite that stays · **(c)** feature
component misfiled as a primitive.

### `src/components/ui/`

| Component          | Class              | Justification / blocker                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Badge`            | (a)\*              | Clean deps. _Blocker: hardcoded `zinc-_`for`info`/`muted` tones — dark-only.                                                                                                                                                                                                                       |
| `Button`           | (a)                | `@semio/ui` + `cn`. Clean.                                                                                                                                                                                                                                                                         |
| `Card`             | **(b)**            | `Card` itself is clean, but `CardHeader`/`CardTitle`/`CardDescription`/`CardBody` render app CSS classes (`asset-card__header`, `asset-card__title`, `asset-card__description`, `asset-card__body`) defined in `src/styles.css`. Publishable only if those move into the package.                  |
| `Checkbox`         | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `Chip`             | (a)\*              | \*Blocker: every tone is hardcoded `zinc`/`blue`/`green`/`yellow`/`red` — dark-only, no tokens. 73 references, so this is the highest-leverage tokenisation target in the file.                                                                                                                    |
| `CollapsibleGroup` | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `CollapsibleRow`   | **(b)** until §3.3 | Two blockers: bakes in `RowSlider`, and emits the app CSS class `inspector-row-hit-target`.                                                                                                                                                                                                        |
| `Combobox`         | (a)\*              | Clean deps. \*Uses `custom-scrollbar` (app CSS) — cosmetic, degrades gracefully.                                                                                                                                                                                                                   |
| `EmptyState`       | (a)                | Clean, and deliberately structurally typed for icon-library independence. Not in the barrel.                                                                                                                                                                                                       |
| `FieldRow`         | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `Input`            | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `ListRow`          | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `Logo`             | **(c)**            | Hardcodes `src="/assets/icon.svg"`, an app-absolute public path, and hardcodes the wordmark "vizij" and the Gilroy font stack. This is Vizij branding, not a primitive. **Move to `app/`**, or make it `<Brand src wordmark />` — but a Vizij-branded lockup does not belong in a generic package. |
| `MenuBar`          | (a)                | radix + tabler. Clean.                                                                                                                                                                                                                                                                             |
| `Modal`            | (a)                | radix + tabler. Clean.                                                                                                                                                                                                                                                                             |
| `NumberField`      | (a)                | Clean, well documented. Not in the barrel.                                                                                                                                                                                                                                                         |
| `Panel`            | (a)                | Clean. Note the dead `as` prop — it warns and falls back to `<section>` unconditionally. Worth removing rather than shipping a lie.                                                                                                                                                                |
| `PanelSearch`      | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `RowSlider`        | **(b)**            | Emits `inspector-row-hit-target` and `inspector-numeric-control` (app CSS). Slated for deletion in §3.3.                                                                                                                                                                                           |
| `Select`           | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `Slider`           | (a)\*              | \*Hardcoded `zinc-800`/`white`/`blue-500` — tokenise before publishing. Not in the barrel.                                                                                                                                                                                                         |
| `Switch`           | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `Tabs`             | (a)                | Clean. Note the `forceMount` + `data-[state=inactive]:hidden` coupling documented in its header — that is a real trap for a future consumer and belongs in the published docs.                                                                                                                     |
| `TextArea`         | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `ThemeToggle`      | **(c)**            | Imports `../../state/themeStore` (zustand). A published primitive cannot own the app's theme store. **Fix:** make it `<ThemeToggle theme onToggle />` and keep a one-line app-side `ThemeToggleConnected` that binds the store. Trivial change, 2 call sites.                                      |
| `Tooltip`          | (a)                | Clean.                                                                                                                                                                                                                                                                                             |
| `TreeRow`          | (a)                | Clean.                                                                                                                                                                                                                                                                                             |

**Summary: 22 (a), 3 (b), 2 (c).** The two (c)s are exactly the two already known
(`ThemeToggle`, `Logo`) — no new ones found, which is a good sign for this layer.

### `src/components/common/`

| Component            | Class      | Justification                                                                                                                                                              |
| -------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SidebarSection`     | **(b)**    | A layout convention (heading + description + instructions block + body), not a primitive. Reasonable where it is. Could publish, but it encodes this app's sidebar rhythm. |
| `InstructionCallout` | (a)        | Dependency-clean. Publishable. But see §6 — trim the unused API first.                                                                                                     |
| `FilterableSelect`   | **delete** | Dead. §3.8.                                                                                                                                                                |

### The `common/` vs `ui/` split itself

`common/` holds 3 files, one dead. `SidebarSection` imports from `ui/`. The distinction is not
carrying weight. **Suggestion (not a proposal):** fold `InstructionCallout` into `ui/`, leave
`SidebarSection` in `common/` or move it to `layouts/`, and let `common/` disappear. Low
priority; purely organisational.

---

## 5. High-level components worth extracting

### 5.1 `WorkbenchPanel` — **the single highest-value extraction in this document**

Nine files repeat the exact same scaffold:

```tsx
<Panel
  className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
  title={…} description={…} badge={…}
  actions={onClosePanel ? (
    <Button variant="ghost" size="icon"
      className="h-6 w-6 text-text-secondary hover:text-text-primary"
      onClick={onClosePanel} title="Hide panel"><X className="h-4 w-4"/></Button>
  ) : null}
>
```

Sites: `RuntimeSourceToolbar.tsx:444`, `HierarchyPanel.tsx:577`, `VariablesPanel.tsx:6564`,
`DebugPanel.tsx:343`, `MaterialsPanel.tsx:46`, `AnimationPanel.tsx:308`,
`MotionGraphPanel.tsx:149` and `:176`, `InspectorPanel.tsx:1069`. Plus `SpeechPanel.tsx:642`
(same header, no `className` override) and `ReferenceFacePanel.tsx:132`/`:200` (same close
button, absolutely positioned).

```ts
interface WorkbenchPanelProps {
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode; // rendered before the close button
  onClose?: () => void; // renders the standard "Hide panel" button
  fill?: "flex" | "full"; // flex-1 vs h-full — MotionGraphPanel needs both
  "data-testid"?: string;
  children: ReactNode;
}
```

**Layer:** (b) — app composite. It encodes this app's dockable-panel convention and the
"Hide panel" affordance. Not publishable, and that is fine.

**Storyworthy:** marginal. It has ~3 states. Story it only if it lands in `ui/`, which it
should not.

**Risk:** very low. Purely additive; each site migrates independently. Note `AnimationPanel`
carries `data-testid="animation-panel"` and `ReferenceFacePanel` carries
`data-testid="reference-face-close"` — e2e selectors that must survive.

### 5.2 `WizardModal` — not a stepper

`DiscrepancyWizard.tsx:369-950` and `PoseGraphRemapWizard.tsx:352-742` share:

- `<Modal open onClose title maxWidth="4xl">`
- a `<header>` with a rounded icon badge (`w-8 h-8`/`w-10 h-10`), an `<h1 className="text-xl font-bold … tracking-tight">`, and a metadata sub-line
- a scrollable body
- a `<footer className="flex justify-between items-center pt-6 border-t … mt-4">` with a ghost "Cancel import" on the left and a primary, `disabled={!canApply}` confirm on the right

They do **not** share a stepper: `PoseGraphRemapWizard` has no steps. `DiscrepancyWizard`'s
3-way step nav (`:413-433`) is a segmented pill group, which is a different extraction (§5.4).

```ts
interface WizardModalProps {
  open: boolean;
  onClose: () => void;
  modalTitle: string; // Modal chrome
  icon: ReactNode;
  heading: string;
  subheading?: ReactNode;
  nav?: ReactNode; // DiscrepancyWizard's step pills go here
  cancelLabel?: string; // default "Cancel"
  confirmLabel: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  children: ReactNode;
}
```

**Layer:** (b). The "Cancel import" copy is import-flow-specific; the shell is not, but there
are only two call sites, so it does not earn a spot in `ui/`.

**Worth doing for a second reason:** `PoseGraphRemapWizard` is entirely untokenised —
`text-slate-100`, `text-slate-500`, `bg-slate-950/70`, `border-white/10`, `bg-blue-500/10`,
`text-blue-400`. `DiscrepancyWizard` is fully tokenised. Extracting the shell forces the
untokenised one onto tokens, fixing light mode for that dialog. **Uncertain:** whether that
dialog is reachable in light mode today — I did not run the app.

**Storyworthy:** yes, if only to make both wizards' chrome visually diffable.

### 5.3 `InspectorSection` — use the component that already exists

`InspectorPanel.tsx:232-260` already defines it. It is used 4 times and hand-inlined 12 more
(the marker string `bg-bg-panel/35` appears 13× in that file). This is the cheapest
duplication removal in the codebase — no new component, no new API, just adoption.

The Rigging sections have a _second_, differently-shaped section shell
(`RiggingMaterialSection.tsx:298`, `RiggingTransformSection.tsx:74`,
`RiggingMorphTargetsSection.tsx:123`, `InspectorContent.tsx:5448`). Those four should collapse
into one too — and doing so fixes `RiggingMorphTargetsSection`'s untokenised
`bg-zinc-900/40 border-zinc-800/50 text-zinc-500`, which is the odd one out.

I would keep these two shells **separate** from each other: different densities, different
typographic scale (`text-[10px] uppercase tracking-wider` vs `text-[9px] font-bold uppercase`).
Merging them is a design decision, not a refactor.

**Layer:** (b) both.

### 5.4 `SegmentedControl` / filter-pill group

The "row of small uppercase pills where one is active" shape appears at:

- `DiscrepancyWizard.tsx:413-433` — step nav (3 pills)
- `PoseGraphRemapWizard.tsx:414-470` — filter mode (5 pills, inline-repeated 5×)
- `AuthoringTargetList.tsx:164-175` — source filter (`SOURCE_FILTERS.map`, uses `Button`)
- `VariablesPanel.tsx:7413-7472` — source filter chips (raw `<button>`)
- `VariablesPanel.tsx:7972-8015` — destination Existing/New toggle
- `RiggingMaterialSection.tsx:1013` / `RiggingTransformSection.tsx:596` — channel lock pills

```ts
interface SegmentedControlProps<T extends string> {
  items: ReadonlyArray<{
    id: T;
    label: ReactNode;
    count?: number;
    disabled?: boolean;
  }>;
  value: T | readonly T[]; // single-select or multi-select
  onChange: (next: T) => void;
  size?: "sm" | "md";
  variant?: "pill" | "solid";
}
```

**Layer:** (a) — genuinely presentational and generic.

**Caveat:** `ui/Tabs` already exists (radix) and covers the `DiscrepancyWizard` case properly,
with roving focus and ARIA. For a _tab_ nav, use `Tabs`, not a new component. `SegmentedControl`
is for the _filter_ cases, which are multi-select or not navigational. Do not conflate them —
that is how you end up with a component that is a bad tab bar and a bad filter group.

**Storyworthy:** yes.

### 5.5 `MergeValueField` (VariablesPanel copy modals)

`label + number input + "Use current X" button` in a
`grid-cols-[96px_minmax(0,1fr)_auto]`, appearing 4× across
`VariablesPanel.tsx:8107-8158`, `:8344-8414`, `:8663-8712`.

```ts
interface MergeValueFieldProps {
  label: string;
  value: string; // drafts are strings
  onChange: (raw: string) => void;
  currentValue?: number | null;
  currentLabel?: string; // "Use current min" etc.
  onUseCurrent?: () => void;
  disabled?: boolean;
}
```

**Layer:** (b) — the "draft is a string, current comes from elsewhere" model is copy-mapping
domain. Keep it next to `VariablesPanel`.

### 5.6 `GroupedInputTree` (VariablesPanel)

`renderProceduralAvailableGroups` (`:6632-6736`) and `renderAnimationAvailableGroups`
(`:6737-6835`) are ~100 lines each and structurally identical: recursive `TreeRow` folders with
an expansion-id set, containing `FlatInputControlRow` leaves. They differ only in which
expansion set they read and what actions they render per row.

```ts
interface GroupedInputTreeProps {
  groups: GroupedInputRowsByFolder[];
  expandedIds: Set<string>;
  onToggleFolder: (id: string) => void;
  renderRowActions: (row: InputCatalogRow) => ReactNode;
  rowProps: (
    row: InputCatalogRow,
  ) => Pick<ControlRowProps, "selected" | "locked" | "lockedMessage">;
  onSelectRow: (row: InputCatalogRow) => void;
  onValueChange: (inputId: string, value: number) => void;
}
```

**Layer:** (b). Depends on `InputCatalogRow` and folder grouping — app domain.

Do this **after** §3.5, since it composes `ControlRow`.

---

## 6. Not worth doing

An honest short list. Each of these looked like duplication and is not, or is duplication whose
removal costs more than it saves.

1. **Merging `InstructionCallout` into `CollapsibleGroup`.** They genuinely differ:
   controlled mode, `trigger="external"` (renders the body with no trigger at all), `icon` slot,
   caller-supplied `contentId`. Forcing them together means four flags on `CollapsibleGroup` for
   one consumer.
   _But do this instead, which is cheap:_ all 5 call sites use only `label` + `icon` + children.
   `isOpen`, `onToggle`, `trigger`, `contentId` and `size="compact"` are dead API. Delete the
   unused props (that removes the entire `isExternalTrigger` branch, ~35 lines) — **then** the
   two components are close enough that a merge might be reconsidered later. Trimming first is
   strictly better than merging first.

2. **Routing the motiongraph `TreeRow`s through `ui/TreeRow`.** Different interaction model
   (checkbox-toggle leaves with disabled branches vs expander + selection). Merge them with
   _each other_ (§3.7); leave `ui/TreeRow` alone.

3. **Replacing `ScrubbableLabel`/`CommitOnBlurNumberInput` with `ui/NumberField`.** Detailed in
   §3.6. It is a redesign of the rigging inspector's editing gesture and row density, sold as a
   dedup. Extract the shared scrub hook; leave the two affordances.

4. **Extracting `TrackRow` or `TreeRowWrapper` into anything reusable.** `TrackRow` is a
   timeline lane with a hardcoded 192px gutter and direct `useAnimationStore` writes.
   `TreeRowWrapper` is 665 lines of node-kind discrimination, reference-face ownership and
   motion-graph path membership. Both are correctly placed feature code. The only extractions
   worth taking out of `TreeRowWrapper` are `BulkSelectCheckbox` (4 verbatim copies → use
   `ui/Checkbox`) and `OwnershipScopeIcon` (already clean).

5. **A shared wizard _stepper_.** There is one stepper, in one wizard. Building an abstraction
   over a single instance is speculative. Build `WizardModal` (§5.2), which has two real
   instances; if a third wizard with steps appears, revisit.

6. **Merging `FieldRow` into `ListRow` or `ControlRow`.** They look adjacent but `FieldRow` is a
   settings-form label/control pair, `ListRow` is a card, `ControlRow` is a slider row. Three
   different jobs. `FieldRow` is underused (3 sites), not wrong.

7. **`AuthoringTargetList` adopting `ListRow` (§3.4) — genuinely marginal.** The row needs
   `selected`, a whole-row activate button, and a footer action bar. That is three new props on
   `ListRow` to serve one caller, and `ListRow`'s other two call sites use neither. I listed it
   above because the shapes really do overlap, but I would put it last and would not object to
   dropping it. **Flagging as my lowest-confidence recommendation.**

8. **`FeatureRow` / `DemoEmotionRow` renames.** Both names are misleading (neither is a row) but
   renaming churns imports and tests for zero behavioural gain. Fix opportunistically, never as
   its own change.

9. **Unifying `Chip` and `Badge`.** They overlap (both are small uppercase pills) but have
   different tone vocabularies (`Chip`: default/info/success/warning/danger/muted, dismissable;
   `Badge`: info/muted/accent) and different sizes, and there are 73 + 10 call sites. The
   migration cost is high and the payoff is one fewer file. Tokenise both instead — that is the
   change that actually matters for publishing.

---

## 7. Suggested order

Grouped so each step is independently landable and reviewable.

| #   | Step                                                                                                                          | Files touched | Risk                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------- |
| 1   | Delete `FilterableSelect` + its story (§3.8)                                                                                  | 2 (deleted)   | none                            |
| 2   | Adopt the existing `InspectorSection` at its 12 inline sites (§5.3)                                                           | 1             | very low                        |
| 3   | Extract `WorkbenchPanel`, migrate 9 panels (§5.1)                                                                             | 10            | very low                        |
| 4   | Extract `useRowLock` + `ChannelLockButton` + `ChannelLockStrip` (§3.2)                                                        | 4             | low                             |
| 5   | Merge the two `RiggingScalarRow`s behind 3 behaviour flags (§3.1)                                                             | 3             | low-medium                      |
| 6   | Extract `FlatInputControlRow` → `ui/ControlRow` (§3.5)                                                                        | 2             | low                             |
| 7   | Trim `InstructionCallout`'s dead API (§6.1)                                                                                   | 1             | low                             |
| 8   | Move `RiggingPropertyRow` shell → `ui/PropertyRow`; share `useDragScrub` (§3.6)                                               | 5             | low                             |
| 9   | Fix the two (c)-class components: `ThemeToggle` prop-driven, `Logo` out of `ui/` (§4)                                         | 4             | low                             |
| 10  | Tokenise `Chip`, `Badge`, `Slider`, `RowSlider`, `RiggingMorphTargetsSection`, `PoseGraphRemapWizard`, motiongraph `TreeRow`s | ~8            | medium — visual review needed   |
| 11  | Collapse `RowSlider` into `Slider` (§3.3)                                                                                     | 4             | medium — deliberate look change |
| 12  | `GroupedInputTree` (§5.6), `MergeValueField` (§5.5), `WizardModal` (§5.2), `SegmentedControl` (§5.4)                          | ~8            | medium                          |

Steps 1–9 are all mechanical or near-mechanical and remove roughly 700–900 duplicated lines.
Steps 10–12 involve visual decisions and should not start until someone has agreed to them.

---

## 8. Things I am not sure about

Listed rather than asserted.

- **Whether the morph-vs-material `RiggingScalarRow` fork (§3.1, diffs 5/6/7) is intentional.**
  The material version has a defending comment; the morph version does not. My proposal
  preserves both behaviours behind flags precisely because I cannot tell.
- **Whether `PoseGraphRemapWizard` is reachable in light mode.** It is entirely untokenised. I
  did not run the app, so I cannot say whether that is a live bug or a dialog nobody opens in
  light mode.
- **Whether the `RowSlider` → `Slider` visual change (blue thumb → white) is acceptable.** That
  is a design call, not a refactor call.
- **Whether `Card`'s `asset-card__*` sub-components are still load-bearing.** `Card` itself is
  used in 6 files; I did not audit which of those use `CardHeader`/`CardBody`. If the
  sub-components are also unused, `Card` becomes cleanly publishable for free — worth a 5-minute
  check before planning the harder route of moving CSS into the package.
- **Whether `Panel`'s `as` prop should be removed or repaired.** It currently `console.warn`s
  and ignores the caller. Nothing passes it today, so removal looks right, but it may have been
  left deliberately for in-flight work.
- **Storybook coverage claims.** I did not open the running Storybook; component/story counts
  quoted in the brief were taken as given and not independently verified.
