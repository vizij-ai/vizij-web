# Component Inventory & Unification Map

> Phase B/C of the component-coverage work. The `ui/` primitives (28) + `common/` (3) are
> the design-system layer (Storybook + Figma). The **58 feature components** below are
> store/3D(R3F)/WASM-connected compositions — **not** design-system atoms. This maps each to
> the interface it serves (the 5 from `03`/`10`) so it can feed unification and interface design.

## Feature components by interface

### Face Designer — build/import the face, materials, hierarchy, viewport
- `app/Viewer` · `app/RuntimeFaceFrame` · `app/RuntimeFaceControlsOverlay` · `app/ReferenceFacePanel` · `app/ReferenceFaceRuntime` · `app/FaceLoadingProgressBar`
- `panels/HierarchyPanel` · `scene-composer/SceneHierarchyPanel` · `scene-composer/SceneSelectionDetails`
- `panels/MaterialsPanel` · `inspector/MaterialEditor` · `inspector/RiggingMaterialSection` · `inspector/RiggingMorphTargetsSection` · `inspector/RiggingTransformSection`

### Rig Designer — bind controls → channels, feature spaces, inspector
- `app/RiggingTabs` · `inspector/InspectorPanel` · `inspector/InspectorContent` · `inspector/InspectorHeader` · `inspector/FeatureList` · `inspector/RiggingPropertyRow`
- `inspector/BindingConnections` · `inspector/VariableSelector` · `inspector/VariablePipelineStages` · `panels/VariablesPanel`
- `binding/BindingEditor` · `binding/SlotDiagnosticsContext`
- `app/StdFeatureSpacesEditor` · `…Controls` · `…ChannelsPanel` · `…MappingEditor` · `app/StandardInputCoveragePanel`
- `poseRig/PoseGraphRemapWizard`

### Animation Designer — timeline, tracks, keyframes
- `animation/TimelineEditor` · `animation/TrackRow` · `panels/AnimationPanel`

### Behavior Designer — graph, speech, diagnostics
- `panels/SpeechPanel` · `panels/DebugPanel` · `app/GraphDiagnosticsPanel`

### Face Controller — drive the face live
- `app/RuntimeSourceToolbar` · `app/RuntimeFaceControlsOverlay` (shared w/ Face Designer)

### Shell & cross-cutting — chrome, dialogs, import/export, audits
- Chrome: `app/AppMenuBar` · `panels/BottomPanelContainer` · `app/workbenchGuides`
- Wizards/dialogs: `app/AppWizards` · `discrepancy/DiscrepancyWizard` · `poseRig/PoseGraphRemapWizard` · `app/OrientationConfirmationDialog`
- Import/Export/Audit: `app/ExportDialog` · `ExportPanel` · `RigGraphExportPanel` · `GraphImportPanel` · `AssetLoaderPanel` · `PoseRigPanels` · `VizijBundleAuditPanel` · `VizijBundleSummaryPanel` · `RobotDataAuditPanel`
- `panels/AuthoringTargetList`

## Unification / inconsistency candidates (Phase C)

1. **FilterableSelect ≈ Combobox** — two filter-dropdowns. Pick one; fold the other in.
2. **RiggingPropertyRow atoms** (`CommitOnBlurNumberInput`, `ScrubbableLabel`) ≈ `NumberField` + `RowSlider`. Promote scrubbable-number into the primitive.
3. **Two hierarchy panels** — `panels/HierarchyPanel` vs `scene-composer/SceneHierarchyPanel`. Likely one tree pattern (use `TreeRow`).
4. **Inspector sections** — `RiggingMaterialSection` / `MorphTargetsSection` / `TransformSection` share a collapsible-section shape → standardize on `CollapsibleGroup` / `SidebarSection`.
5. **Panel scaffolds** — the ~9 export/import/audit `*Panel`s repeat header + body + actions → standardize on `Panel` / `StudioPanel`.
6. **Wizards** — `DiscrepancyWizard`, `PoseGraphRemapWizard`, `AppWizards`, `OrientationConfirmationDialog` share a step/dialog pattern → a `Wizard` scaffold over `Modal`.
7. **Feature-spaces cluster** — five `Std*`/coverage components; candidate to consolidate into one editor surface.

## Bug pattern note (already fixed in ui/ + common/)
Base UI `data-[state=…]` Radix-isms and hardcoded `zinc/white//blue` colors. **Feature components likely carry the same two bug classes** — worth a sweep when any feature component is reworked.
