# Backlog

Last updated: 2026-02-11 (post pose-group inspector tranche)

The canonical planning set for authoring lives in:

- `apps/vizij-authoring/docs/plans/GOAL.md`
- `apps/vizij-authoring/docs/plans/TRACKER.md`
- `apps/vizij-authoring/docs/plans/ROADMAP_BACKLOG.md`

Use this file for app-local implementation backlog only.

## P0 (must address first)

- [x] Fix runtime graph bundle clear semantics to avoid stale graph controllers.
      Context: when rig/pose graphs are removed or become invalid, viewer bridge sends `undefined`, but runtime bundle merge keeps prior graph values.
      Goal: clearing graph payloads must unregister corresponding runtime graphs so stale controls do not keep running.
      Exit criteria: graph/pose removal path clears runtime controllers, verified with targeted tests for add/update/remove graph bundle transitions.
- [x] Replay staged standard-input defaults when runtime input bridge becomes ready.
      Context: graph defaults can stage before `stageRuntimeInput` is available, leaving runtime state unstaged until manual user edits.
      Goal: when runtime readiness flips to ready, staged/default input values are pushed automatically.
      Exit criteria: first-ready runtime state matches binding store values without extra slider interaction; regression test covers ready-after-graph sequence.
- [x] Guard pose graph export build failures in `exportPoseGraphFile`.
      Context: pose graph export can throw before user feedback when spec build fails.
      Goal: export should fail gracefully with actionable dialog messaging, consistent with `exportGlb` handling.
      Exit criteria: thrown build failures are caught, dialog shown, no uncaught error path.
- [x] Restore direct binding-expression authoring path from legacy inspector flow.
      Context: `main` app exposed per-feature/per-leaf `BindingEditor` flows (slots, aliases, value types, expressions), but current active inspector path does not surface equivalent editing.
      Goal: user can select an object feature/leaf and directly author slot wiring + expressions without leaving the active inspector workflow.
      Exit criteria: active inspector exposes `BindingEditor` (or equivalent) for feature leaves, including add/remove slot, alias/value type controls, normalize helpers, and expression editing.
- [x] Restore explicit static-vs-animatable feature controls in active inspector.
      Context: legacy `main` inspector clearly surfaced feature animated/static state and default/constraint editing; current UI has fragmented sections and no single equivalent control surface.
      Goal: static and animated feature states are clearly visible and editable from active inspector modes.
      Exit criteria: user can inspect/toggle animated state and edit default/constraint behavior for feature leaves in one coherent UI path.
- [x] Restore leaf-level driven-variable authoring in inspector.
      Context: selecting a property to drive currently binds all feature components (for example translation x/y/z), not a specific leaf target.
      Goal: allow choosing exact leaf components and bind only the selected component unless user explicitly opts into bulk bind.
      Exit criteria: user can bind one component at a time (x vs y vs z), inspect/edit that relationship directly, and optionally bulk-bind with explicit confirmation.
- [x] Make Variables pane path-complete for rig authoring.
      Context: Variables pane currently surfaces only custom main-face rig inputs and does not represent all path-backed standard inputs.
      Goal: all path-backed inputs (`auto`, `preset`, `custom`, plus mapped reference paths when relevant) are visible and selectable as variables.
      Exit criteria: every standard input with a path appears in Variables with source badges/filters and can be selected for drive/remap workflows.
- [x] Align chain surfacing across inspector summaries and trace views.
      Context: trace view is transitive-chain aware, but top-level \"Connected To\" and pose grouping still rely on direct-slot matching.
      Goal: all chain-oriented UI consistently reflects pose -> rig -> animatable relationships through `inputBindings`.
      Exit criteria: selecting an element yields consistent direct + transitive chain reporting across summaries, grouping, and trace diagnostics.
- [x] Resolve legacy inspector component drift (rewire or retire dormant panels).
      Context: legacy components (`FeatureList`, `DriverPanel`, `DriverBindingSection`) still exist but are not clearly part of active inspector routing.
      Goal: either integrate these capabilities into active inspector flows or remove dead paths with replacement UX documented.
      Exit criteria: no dormant critical editing path remains; docs accurately describe the supported authoring surfaces.
- [x] Complete trace suggestion UX (preview, ignore, undo-safe apply).
      Context: actionable suggestions now exist and can be applied, but apply path lacks dry-run preview, explicit ignore, and undo-safe operations.
      Goal: make migration fixes safe and auditable for production retargeting workflows.
      Exit criteria: each suggestion supports preview, apply, ignore, and undo-safe rollback semantics.
- [x] Harden remap coverage for migration edge cases.
      Context: remap confidence/conflict handling is improved, but delta-only filtering and low-confidence legacies still require manual recovery.
      Goal: make legacy split-graph remap robust across inactive outputs and ambiguous naming.
      Exit criteria: remap flow can optionally include non-delta outputs, surfaces confidence rationale clearly, and provides deterministic conflict resolution.
- [x] Investigate false "No Driven properties" signals for higher-level rig items.
      Context: authors can observe rigs visibly driving the face while inspector/high-level summaries claim there are no driven properties.
      Goal: align inspector diagnostics with actual runtime write paths so the driven-property state is trustworthy.
      Exit criteria: a reproducible failing case is documented, root cause is fixed, and inspector output matches observed driving behavior.
- [x] Add pose-output retargeting workflow for previously wired faces.
      Context: pose outputs list driven variables, but variable details are not editable in place and legacy/old-system faces do not visibly respond.
      Goal: make driven variable details inspectable and editable so pose outputs can be retargeted to correct rig inputs/paths.
      Exit criteria: user can open a pose output, inspect current target mapping, retarget mapping, and see face response update.
- [x] Implement end-to-end pose -> rig -> face connection debug trace.
      Context: selecting a face element shows pose connections, but those wirings appear not to flow through to actual drive results.
      Goal: provide a deterministic trace path that confirms whether pose weights resolve into rig inputs and then to animatable writes.
      Exit criteria: for any selected face element, tooling can show matched pose outputs, rig inputs, and final animatable targets with mismatch diagnostics.
- [x] Rework import review mismatch handling into automatic face rename + order-insensitive matching.
      Context: face mismatch review currently behaves as manual friction; list comparisons can fail because of ordering rather than semantic mismatch.
      Goal: auto-resolve face-id rename workflows and treat permutation-only list differences as equivalent.
      Exit criteria: import review auto-renames when safe, ignores order-only diffs, and only prompts when there is a true mapping conflict.
- [x] Harden import mismatch auto-resolution for face-id migration.
      Context: auto-resolution must be deterministic and avoid broad heuristic acceptance.
      Goal: auto-rename only when residual diff after face namespace rewrite is empty.
      Exit criteria: strict rewrite + residual diff gate is enforced before auto-accept.
- [x] Make runtime input staging reactive in `useRigController` (avoid stale `getState()` callback capture).
- [x] Resolve graph playback UX mismatch:
  - either wire playback actions to runtime behavior
  - or remove/disable controls until implemented.
- [x] Wire pose graph import action consistently in export/import dialog surface.
- [x] Align `exportGlb` pose validation with recomputed pose graph using active blend mode.
- [x] Replace or safely guard `PoseGraphService.generateSummary` throw path.
- [x] Keep baseline checks green:
  - `pnpm --filter vizij-authoring typecheck`
  - targeted runtime/authoring regression tests.

## P1 (next up)

- [x] Build dedicated authoring side-surface taxonomy for the left panel.
      Context: left-side authoring surfaces are now split into dedicated Face Elements, Variables, Poses, Pose Groups, and Inputs panes (panel visibility remains configurable).
      Goal: split the left sidebar into explicit sections: 1) Face Elements, 2) Variables, 3) Poses, 4) Pose Groups, 5) Inputs.
      Exit criteria: 1. each section has independent selection context with one globally selected inspector target. 2. selecting any item routes one deterministic inspector state. 3. variable selection opens a slider-only editor for the selected leaf.

- [x] Expose a consolidated Poses panel showing all poses and pose-group membership.
      Context: poses are discoverable in a dedicated Poses pane, with clear selection and membership actions.
      Goal: show all primary-face pose definitions in one pane and surface group membership within pose inspect views.
      Exit criteria: 1. pose inspector shows a list of all groups containing the pose. 2. users can add/remove pose membership in one action. 3. pose inspection and target editing remains functional without path-first edits.

- [x] Implement dedicated Pose Groups editor for lifecycle and blending strategy controls.
      Context: blend strategy and group membership editing currently feels path-first and fragmented.
      Goal: add explicit create/rename/delete/select/persist UI for pose groups, with cross-group blend mode controls in the pane and group-local blend controls in the inspector.
      Exit criteria: 1. users can create/rename/delete groups directly. 2. users can add/remove poses from groups. 3. users can set group-local blend modes from the pose group inspector. 4. users can set cross-group blend modes from the pose groups pane.

- [x] Keep Inputs as a dedicated inspection surface for drive relationships.
      Context: driver graph currently mixes with other content and can hide what drives what.
      Goal: make driver introspection explicit for each selected item: - what the item drives - what drives the item
      Exit criteria: 1. both incoming/outgoing drive links are inspectable. 2. each entry supports clickthrough to the linked item editor. 3. empty/ambiguous relationships are explicitly explained.

- [x] Treat auto-generated animatable-driven rig paths as metadata under `/autorig`.
      Context: these lower-level rig drivers should be treated as implementation details and not exposed as user-editable variables.
      Goal: prefix generated rig bindings with `/autorig` and hide them from Variables as primary user-editables.
      Exit criteria: 1. no `/autorig` paths appear in Variables panel inputs. 2. no `/autorig` paths appear in Inputs outputs unless in metadata mode. 3. the same underlying control still appears in rig inspector as aliased ownership to its target property.

- [x] Implement first-class pose-group domain model (not just `pose.group` labels).
      Context: current pose compiler treats groups primarily as naming/path metadata, but target behavior requires group entities with own blend semantics.
      Goal: represent pose groups explicitly in authoring state and compile contracts.
      Exit criteria: 1. Pose groups have identity + local blend strategy. 2. Poses reference group entities deterministically. 3. Existing `pose.group` assets migrate without data loss.
- [x] Implement two-layer pose blending in compile output.
      Context: current pose graph applies one global blend layer across all poses per target variable.
      Goal: blend within each group first, then blend group outputs per target (default cross-group additive).
      Exit criteria: 1. Per-group-per-target blend nodes exist in compiled graph. 2. Cross-group-per-target blend nodes exist and are strategy-driven. 3. Roundtrip export/import preserves behavior.
- [x] Add pose blend-strategy controls to authoring export flow.
      Context: strategy controls were implicit and hidden from normal authoring surfaces.
      Goal: let authors configure default group blend and cross-group blend behavior in-app.
      Exit criteria: 1. export panel exposes both strategy controls. 2. selections persist through pose compile/export paths. 3. tests cover strategy-influenced graph generation.
- [x] Add pose creation + target authoring affordances for validation workflows.
      Context: validating pose handling required creating fresh poses and wiring targets without importing legacy configs.
      Goal: support direct pose creation and target assignment in normal workflow.
      Exit criteria: 1. users can create poses from variables panel and inspector flows. 2. pose target rows support save/reset and live scrub editing. 3. authoring state updates without manual config edits.
- [x] Add sidebar pose-group inspector for pose-vector previewing.
      Context: pose interactions required a group-level surface to test combinations and neutral behavior.
      Goal: provide in-sidebar group controls (weights, solo, play, reset) without popup interruption.
      Exit criteria: 1. selecting a pose-group folder opens inspector pane section. 2. sliders stage preview values against neutral baseline. 3. authors can solo/reset/weight poses within the selected group.
- [x] Make single-pose playback/preview semantics neutral-baseline-safe.
      Context: single-pose slider interactions could leave unrelated pose values active and appear to collapse targets toward zero instead of neutral.
      Goal: pose preview starts from neutral baseline and composes only the selected pose contribution.
      Exit criteria: 1. play sets selected pose to 100% preview. 2. slider blend scales selected pose deltas from neutral. 3. unrelated pose entries do not remain implicitly active in single-pose mode.
- [ ] Surface pose aggregate outputs as first-class rig binding sources.
      Context: UI currently implies pose-to-variable links directly from individual poses, but target binding semantics are aggregate outputs.
      Goal: make rig target binding semantics explicit: aggregate pose layer -> rig variable target.
      Exit criteria: 1. Inspector can show and navigate pose entry vs group output vs aggregate output. 2. Binding editor targets aggregate pose-layer sources where appropriate. 3. Chain labels are unambiguous and typed.
- [x] Enforce rig-layer boundary: only low-level rig variables may write animatable leaves.
      Context: target architecture requires abstract-rig variables to compose through rig bindings, not direct animatable writes.
      Goal: prevent invalid abstract-rig-to-animatable wiring and provide migration guidance for legacy assets.
      Exit criteria: 1. Compiler blocks or migrates invalid boundary-crossing bindings with diagnostics. 2. UI prevents creating new invalid direct mappings. 3. Tests cover valid and invalid boundary cases.
- [x] Add pose-group and blend-strategy authoring UI.
      Context: no first-class editor exists for group-local and cross-group blend strategy configuration.
      Goal: expose group lifecycle + strategy editing without raw JSON edits.
      Exit criteria: 1. User can create/rename/delete groups and assign poses. 2. User can configure local group strategy and cross-group strategy. 3. Preview/diff surfaces show expected target-value effects.
- [ ] Add explicit pose import grouping/strategy controls and migration affordances.
      Context: import grouping behavior is currently implicit and source-name-driven.
      Goal: make grouping and blend strategy outcomes explicit during remap apply.
      Exit criteria: 1. Import supports preserve/map/prefix/flatten grouping strategies. 2. Strategy choice is shown before apply and deterministic. 3. Group-level conflicts are actionable with clear resolution UX.
- [ ] Add pose-layer diagnostics (group, aggregate, boundary, and target coverage).
      Context: current diagnostics emphasize id remap and slot issues, but do not expose missing group aggregate or boundary violations clearly.
      Goal: provide actionable pose architecture diagnostics during authoring and export.
      Exit criteria: 1. Diagnostics cover empty groups, missing aggregate contributions, unsupported boundary crossings, and unresolved target mappings. 2. Each diagnostic links to relevant editor context. 3. Regression coverage exists for each diagnostic class.
- [x] Make inspector chain traversal first-class across Pose -> Rig -> Animatable.
      Context: authors can inspect "driven" relationships but cannot reliably click through each link in the chain and continue authoring from that next node.
      Goal: every chain list row behaves like navigable graph topology, so users can drill from high-level pose outputs down to final animatable leaves.
      Exit criteria: 1. Clicking a pose-driven rig row opens Rig inspector for that exact input id. 2. Clicking a rig-driven property row opens Scene inspector for the bound animatable target. 3. Clicking connected pose rows from scene/animatable context opens Pose inspector and preserves chain context. 4. The flow works bidirectionally (pose -> rig -> animatable and animatable -> rig -> pose) without dead ends.
- [x] Add explicit selection-routing contracts for all inspector "connected/driven" surfaces.
      Context: current routing behavior differs by panel (some select, some summarize only), which breaks mental model continuity.
      Goal: all chain-surfacing UI uses one deterministic selection/routing contract.
      Exit criteria: 1. Every connected/driven list item is either explicitly actionable or explicitly marked read-only. 2. Actionable rows route to a concrete inspector mode + selected entity id. 3. No list reports a relationship that cannot be navigated to in the editor.
- [x] Restore binding-authoring parity for Rig and Pose inspector contexts.
      Context: `BindingEditor` capabilities are strongest in animatable/feature contexts; rig/pose contexts still rely on partial controls and indirection.
      Goal: regardless of entry point (pose, rig, animatable), users can inspect and edit slot wiring/expression semantics for the selected relationship.
      Exit criteria: 1. Rig context exposes equivalent binding controls (slot add/remove, alias/value-type, expression edit, normalize helpers) for its driven targets. 2. Pose context exposes equivalent binding controls for pose-output-to-rig mappings (including retarget/edit without leaving pose workflow). 3. Edits made from rig/pose contexts are reflected immediately in animatable inspector surfaces and trace diagnostics.
- [x] Add chain-context affordances in inspector (breadcrumbs/return path/history).
      Context: after clicking through multiple chain hops, users lose context about where they came from and what upstream/downstream relationships remain.
      Goal: maintain orientation while traversing graph chains in authoring sessions.
      Exit criteria: 1. Inspector shows current chain path (for example `Pose > Rig Input > Animatable Leaf`) or equivalent context indicator. 2. User can jump back to prior node(s) without re-searching in Variables panel. 3. Context is cleared/reset predictably when selection is manually changed outside chain navigation.
- [x] Add regression tests for inspector chain navigation + binding parity workflows.
      Context: recent fixes caught behavior gaps only during deep manual review.
      Goal: lock in click-through + binding-edit expectations before broader P1/P2 work.
      Exit criteria: 1. Tests cover pose->rig->animatable click-through routing. 2. Tests cover rig->pose back-navigation from connected lists. 3. Tests cover binding editor availability and updates from each inspector context.
- [x] Prevent inert "self" bindings on animatable leaf targets.
      Context: binding UI currently allows `Slider (self)` for leaf/component bindings, but graph compilation only supports `self` for parent/input bindings; component self resolves to "Self reference unavailable for this input." and silently falls back.
      Goal: remove invalid authoring states by context-gating self options and/or adding explicit component-self semantics.
      Exit criteria: 1. Component/animatable binding rows cannot land in unsupported self states without explicit warning. 2. Existing unsupported self states are surfaced as actionable diagnostics and migration fixups. 3. Slider interactions always map to an actual runtime-driven input for the edited target.
- [x] Fix inspector quick-edit driver resolution to use active slot (not hard-coded slot[0]).
      Context: transform/material/morph quick-edit sections currently read only `binding.slots[0].inputId`, so multi-slot or legacy-normalized bindings can appear unbound or edit the wrong driver.
      Goal: resolve the effective slot deterministically (first valid non-self bound slot, with explicit handling for read-only/self cases) across all quick-edit sections.
      Exit criteria: 1. Transform/material/morph rows display/edit the same effective driver as binding evaluation. 2. Multi-slot bindings remain editable from quick-edit rows. 3. Regression tests cover slot ordering and self-slot edge cases.
- [x] Surface compile-time binding diagnostics directly inside active inspector editors.
      Context: `BindingEditor` supports `issues`, but inspector call sites do not pass graph-build issues, so invalid bindings look editable but inert.
      Goal: always show target/slot diagnostic messages (missing inputs, unsupported self, unresolved expression vars) where users author bindings.
      Exit criteria: 1. Scene and parent/input `BindingEditor` instances render graph issues for the selected target. 2. Inert slider states always include a visible reason. 3. Tests cover at least one unsupported-self and one missing-input scenario.
- [x] Add test coverage for standard-input coverage panel + pose rig kind roundtrip.
- [x] Expand required validation set beyond targeted suites.
- [x] Promote compile/validate/apply states from debug-first presentation to primary authoring workflow feedback.
- [x] Standardize inspector terminology around relationship perspective (`what drives me` vs `what I drive`).
      Context: current labels (`Binding Editor`, `Edit binding`, `Driving`) are inconsistent across scene/rig/pose, making chain intent ambiguous.
      Goal: inspector language should be perspective-first and consistent in all modes.
      Exit criteria: 1. tabs/buttons use one relationship vocabulary across scene/rig/pose. 2. variable/property relationship lists are explicitly labeled by type. 3. docs reflect the finalized terminology contract.
- [x] Split rig inspector add-driven actions into explicit property and variable flows.
      Context: `Add Driven Variable` currently opens scene-property picker and processes only property selections.
      Goal: remove label/behavior mismatch and support both authoring intents directly.
      Exit criteria: 1. separate actions for adding driven properties vs driven variables. 2. each action opens the matching picker context by default. 3. tests cover both paths.
- [x] Align quick-edit driver resolution with BindingEditor fallback logic for legacy/non-canonical input ids.
      Context: quick transform/material/morph strips can appear inert when slot input ids are legacy-normalized while BindingEditor still resolves them.
      Goal: quick-edit and BindingEditor resolve/edit the same effective driver ids.
      Exit criteria: 1. quick strips resolve normalized legacy ids deterministically. 2. unresolved slots show explicit inline reason. 3. Quori smoke case (`L_Eye` scale) is reproducibly functional.
- [x] Disambiguate pose binding modal states for root variables vs missing parent links.
      Context: `No Parent Binding` currently conflates valid root variables and actual mapping gaps.
      Goal: make pose binding diagnostics actionable and semantically accurate.
      Exit criteria: 1. root/no-parent state is clearly labeled as valid when appropriate. 2. missing-link state exposes actionable fix CTA. 3. no false-error messaging for root pose-driven variables.
- [x] Add legacy pose-config import remap by normalized path/source-id before strict id pruning.
      Context: pose config normalization currently prunes unknown ids by exact match only.
      Goal: preserve legacy pose values when logical inputs still exist under migrated ids.
      Exit criteria: 1. import attempts deterministic remap by normalized path/source id. 2. unresolved ids are reported in migration diagnostics. 3. tests cover remap success and unresolved reporting.
- [x] Add regression coverage for Quori smoke findings.
      Context: recent behavior gaps were only found by manual smoke testing.
      Goal: lock in fixes for inspector intent clarity and slider reliability.
      Exit criteria: 1. tests cover rig add-driven dual actions. 2. tests cover quick-edit fallback id resolution. 3. tests cover pose root-vs-missing parent state and pose id remap.

## P2 (architecture and scale-readiness)

- [ ] Extract shared pose-derived analysis service for grouping/path/chain summaries.
      Context: pose grouping and chain summaries are currently computed inside UI components with duplicated assumptions.
      Goal: centralize derived pose/group/path/chain computations in reusable selectors/services.
      Exit criteria: 1. Shared service provides pose membership summary, path preview/collision detection, and downstream property summary. 2. Inspector + Variables panel consume shared derivations. 3. Service-level tests cover legacy-id and collision edge cases.
- [ ] Rationalize pose store command surface for lifecycle/group/import diagnostics.
      Context: pose actions are available but not organized by domain intent, which increases UI coupling and side-effect ambiguity.
      Goal: expose stable command groups for lifecycle, grouping, and import/diagnostic flows.
      Exit criteria: 1. UI calls through stable command APIs (minimal ad-hoc mutations). 2. Command side effects on config/spec regeneration are documented and test-covered. 3. Integration tests verify runtime sync invariants after command operations.
- [ ] Extract remaining cross-workbench app flows into focused hooks/services.
- [ ] Add store-level tests for graph runtime, binding authoring, and selection stores.
- [ ] Harden RobotData audit:
  - scene/animatable versioning
  - incremental caching
  - worker-capable traversal path.
- [ ] Harden bundle audit:
  - explicit run model
  - chunked/parallel compile/diff path
  - caching by graph hash.
- [ ] Replace JSON-only deep clone in import/export mutation paths.
- [ ] Continue pose authoring modularization for unit-testable persistence/math/IO layers.
- [ ] Replace bespoke `StandardInputsSection` virtualization with maintained virtualizer primitives.

## P3 (UX expansion and polish)

- [ ] Implement animator-feedback tranche:
  - undo/redo foundations
  - scrubbable number controls
  - collapsible persistence and expand/collapse-all.
- [ ] Dependency panel for variable -> shape relationships.
- [ ] Save/load animation workflow.
- [ ] Input coverage and shared-variable improvements.
- [ ] Procedural inputs (sin/cos/tan/noise).
- [ ] Face-id editing UX.

## Known Bugs

- [ ] Inspector connected-variable list is too broad.
- [ ] Aggregate-vs-entry pose contribution labeling is still ambiguous in inspector chain views.
- [ ] Pose group inspector currently scopes to one selected group; no global cross-group mix surface yet.
- [x] Some quick-edit transform sliders (notably scale on select legacy-loaded shapes) can appear inert despite binding editor showing a driver.
- [ ] Creating material without attached shape fails.
- [ ] Selecting variable-to-drive can break hierarchy.
- [ ] Reference face hierarchy not shown.
- [ ] Self rigs should be hidden/locked.
- [x] Some binding-editor sliders appear non-functional for specific leaves (commonly scale) when slot/input resolution is invalid or unsupported.
- [x] Quick-edit sections (transform/material/morph) may show stale/non-editable drivers because they assume slot index `0` is always the active source.
- [x] Binding compile issues are not surfaced in active editor panels, making broken slot/expression states hard to distinguish from runtime bugs.

## UI Polish Backlog

- [ ] Reduce excess blue tones and legacy CSS carryover.
- [ ] Keep panel titles sticky while scrolling.
- [ ] Unify add/create interactions for variables and materials.
- [ ] Improve iconography and visual intent consistency.
