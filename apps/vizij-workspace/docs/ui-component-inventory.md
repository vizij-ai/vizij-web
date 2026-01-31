# vizij-authoring UI Component Inventory (2025-11-20)

This note inventories the current UI surface of the `vizij-authoring` app and highlights where duplicated patterns could be standardized into reusable components or styling primitives.

## Scope and method

- Looked at files under `apps/vizij-authoring/src/components/**`, shared hooks in `components/common`, and the global styles in `src/styles.css` (inc. `components/ui/collapsible.css`).
- Focused on structural UI pieces (layout shells, panels, lists, tabs, controls) rather than business logic.
- Existing shared primitives live in `components/ui` (Button, Card, Collapsible\*) and `components/common` (FilterableSelect, SidebarSection, InstructionCallout).

## Component map (by area)

### App shell & navigation

- `App.tsx`: overall shell using `.app-shell`, `.sidebar`, `.workbench-panel__*` wrappers.
- `components/app/WorkbenchNav.tsx`: left rail view switcher (button list with active styling).
- `components/common/SidebarSection.tsx`: titled sidebar blocks with optional instruction callout.
- `components/common/InstructionCallout.tsx`: collapsible helper text; pattern overlaps with other collapsible bodies.

### Shared primitives

- `components/ui/Button.tsx`: variants = primary/secondary/subtle/danger; many controls still use bespoke classes (e.g., viewer buttons, feature actions).
- `components/ui/Card.tsx`: wraps `.asset-card` styling; header/title/description/body helpers.
- `components/ui/CollapsibleGroup.tsx` and `CollapsibleRow.tsx`: collapsible containers with optional actions and sliders.
- `components/ui/Input.tsx`: thin wrapper; inputs still styled contextually via global selectors.
- `components/common/FilterableSelect.tsx`: custom searchable select with many className hooks.

### Import / export workbench (left sidebar panels)

- `components/app/AssetLoaderPanel.tsx`, `GraphImportPanel.tsx`, `ExportPanel.tsx`, `RigGraphExportPanel.tsx`, `VizijBundleAuditPanel.tsx`, `RobotDataAuditPanel.tsx`, `GraphDiagnosticsPanel.tsx`, `VizijBundleSummaryPanel.tsx`, `PoseRigPanels.tsx`.
- All use `.asset-card*` blocks inside cards; several inline styles for rows, checkboxes, and hints.

### Viewer surface (right pane)

- `components/app/Viewer.tsx`: viewport header, graph playback toggle, switches, and pose capture inputs. Buttons use `.viewer__control-button`, switches use `.viewer__switch`, sections use `.viewer__section` cards.

### Scene composer

- `components/scene-composer/SceneComposerWorkbench.tsx`: wraps hierarchy + inspector; uses `.workbench-panel__*` shells.
- `SceneHierarchyPanel.tsx`: search toolbar + tree rows (`.hierarchy-tree__*`) with badges and meta counts.
- `SceneSelectionDetails.tsx`: definition list grid for selection metadata.

### Inspector

- `components/inspector/ObjectInspector.tsx`: tab strip (`.inspector-tab`), content swapper.
- `ObjectHeader.tsx`: panel header with editable title + subtitle.
- `DriverPanel.tsx`: groups drivers by feature using `CollapsibleGroup` + `CollapsibleRow`; uses ad-hoc action buttons and inputs.
- `DriverBindingSection.tsx`: per-binding cards (`.driver-binding-card`) with header meta and action rows.
- `FeatureList.tsx`: driver/feature lists with sliders, inputs, and secondary action buttons.

### Binding utilities (shared)

- `components/binding/*`: `BindingEditor.tsx`, `bindingNormalization.ts`, `panelUtils.ts`, `SlotDiagnosticsContext.tsx`, `types.ts` (feature-entry helpers), `slotKeys.ts`.
- These power the inspector’s bindings/drivers UI; the legacy animatable sidebar that used to house them has been removed.

### Pose rig workbench

- `poseRig/components/PoseRigWorkbench.tsx`, `PoseList.tsx`, `PoseEditor.tsx`, `NeutralEditor.tsx`, `PoseSummary.tsx`, `PoseGroupExportPanel.tsx`.
- Uses `.pose-rig-workbench*`, `.pose-rig-list*`, `.pose-rig-input*` styles; mix of `Button` and raw `<button>` controls; list rows mirror feature rows.

### Wizards / modals

- `components/discrepancy/DiscrepancyWizard.tsx`: multi-step diff resolution UI (`.discrepancy-wizard__*`).
- `components/poseRig/PoseGraphRemapWizard.tsx`: face-id remap flow (small modal-style panel).

## Styling patterns worth consolidating

- **Panel shells:** `.sidebar__panel` + header/title/description/badge, `.workbench-panel__header/body`, `.pose-rig-workbench__header/body`, `.viewer__section` — all implement similar “card with header + meta + body” shapes.
- **Tab sets & pills:** `.inspector-tab`, `.health-tabs__button/panel` (ImportExportWorkbench), driver visibility pills, selection filters — similar horizontal pill navigation.
- **Buttons & action chips:** bespoke classes (`.viewer__control-button`, `.feature-panel__input-action`, `.scene-hierarchy__clear`, `.pose-rig-workbench__actions`) alongside `Button` variants.
- **Search / filter toolbars:** scene hierarchy search, feature filters (`.feature-panel__filters`), binding filter chips, pose list search; each reimplements label + input + clear.
- **List rows with meta + actions:** driver rows, feature rows, pose rows, selection stack items, health tab lists all share “label + meta + inline actions/toggles”.
- **Badges / chips / tags:** `.sidebar__badge`, `.feature-panel__filter-chip`, `.viewer__face-segment`, pose group labels, driver count pills.
- **Form rows & toggles:** checkbox rows in `ExportPanel`, `PoseGroupExportPanel`, `PoseEditor`; switch styles in `Viewer`; slider rows in `CollapsibleRow` and feature panel sliders.
- **Instruction/callout blocks:** `InstructionCallout`, `SidebarSection` instructions, inline hints (`.asset-card__hint`, `.sidebar__section-instructions`);
  could share layout and iconography.

## Candidates to standardize next

| Candidate               | Where it appears today                                                                                                                                                            | Proposal                                                                                                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Panel wrapper           | `sidebar__panel` (ObjectInspector, SceneHierarchyPanel, SceneSelectionDetails, animatable Panel, driver panels), `workbench-panel__*`, `pose-rig-workbench__*`, `viewer__section` | Create a `Panel` primitive in `components/ui` with header/title/description/badge/action slots plus optional collapsible state; map existing shells to it and slim global CSS. |
| Tabs / pills            | `.inspector-tab`, `.health-tabs__button`, driver visibility chips, mode toggles                                                                                                   | Introduce a `Tabs` component with button + panel pairing and pill styling; reuse for inspector tabs and health tabs; give it keyboard support.                                 |
| Button variants         | Plain classes like `.viewer__control-button`, `.feature-panel__input-action`, `.scene-hierarchy__clear`, `.pose-rig-workbench__actions`                                           | Extend `Button` to cover size, “ghost”, “pill”, and icon-only variants; migrate bespoke button styles into themeable variants.                                                 |
| Search/toolbar strip    | `SceneHierarchyPanel` search + clear, `feature-panel__filters`, pose list filters                                                                                                 | Add a `Toolbar`/`SearchBar` helper (input + clear + optional chips/actions) to keep spacing and focus styles consistent.                                                       |
| List row pattern        | Feature rows, driver rows, pose rows, selection stack items (all: title + meta + inline actions/checkboxes/sliders)                                                               | Define a `ListRow` component with slots for primary label, metadata, controls, and optional collapse; reuse with `CollapsibleRow` where expansion is needed.                   |
| Badge / chip primitives | `.sidebar__badge`, `.feature-panel__filter-chip`, `.viewer__face-segment`, pose group labels                                                                                      | Provide `Badge`/`Chip` components with tone variants (info/warning/muted/outline); replace ad-hoc spans and repeated class names.                                              |
| Form rows & switches    | Checkbox rows in export panels, pose editors; switches in `Viewer`; inline style blocks in export panels                                                                          | Add `FieldRow` (label + control + hint) and `Switch` components so checkboxes/switches no longer rely on inline styles or raw inputs.                                          |
| Collapsible helpers     | `CollapsibleGroup/Row`, `InstructionCallout`, viewer playback toggle (`viewer__graph-body`), sidebar instructions                                                                 | Unify collapse behaviour (ARIA, keyboard) under a shared helper and apply to viewer sections and instruction callouts to remove duplicate logic.                               |
| Wizard/stepper scaffold | `DiscrepancyWizard` (multi-step), smaller remap wizard                                                                                                                            | Extract a lightweight `Stepper`/`Wizard` container with step nav, footer actions, and shared typography; reduce bespoke `.discrepancy-wizard__*` rules.                        |

### Quick wins

- Swap bespoke buttons in `components/app/Viewer.tsx` and `scene-composer` panels to the shared `Button` once variants exist.
- Replace inline-styled checkbox rows in `ExportPanel.tsx` and `PoseGroupExportPanel.tsx` with a shared `FieldRow` + `Switch`.
- Wrap `.sidebar__panel` + header markup into a `Panel` helper and consume it in `SceneHierarchyPanel.tsx`, `SceneSelectionDetails.tsx`, and `ObjectInspector.tsx` to cut repeated header/body markup.

### Follow-ups

- Extend `components/ui/Input.tsx` with a base class (e.g., `.input`) so inputs outside `.sidebar` inherit consistent styling.
- Reduce global `styles.css` surface by colocating component styles with the new primitives (e.g., move `asset-card` rules next to `Card`).
