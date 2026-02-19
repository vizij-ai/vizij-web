# Vizij Authoring UI Design

Last updated: 2026-02-19
Status: active

This file defines UI/UX behavior contracts. Delivery sequencing is tracked in `plans/ROADMAP.md` and `plans/BACKLOG.md`.

## Design Principles

1. Inspector-first workflows: complete common authoring tasks without unnecessary panel switching.
2. Runtime-truthful values: displayed current/applied values must come from runtime-authoritative channels.
3. Progressive complexity: default flows stay simple; advanced internals are available when explicitly needed.
4. Deterministic editing: equivalent user actions produce equivalent authored/compiled outputs.
5. Dense-scene usability: search, hierarchy, and controls remain legible under large datasets.
6. Consistent lifecycle patterns: create/edit/delete flows behave similarly across authoring entities.

## Information Architecture

### Control Surfaces

Required top-level surfaces:

1. Face Elements
2. Control Elements

Control Elements sub-surfaces:

1. Variables
2. Poses
3. Pose Groups
4. Inputs

Behavior requirements:

1. One global selection context across surfaces.
2. Deterministic sub-surface ordering.
3. Hidden surfaces do not run heavy filtering work.

### Inspector Navigation

Inspector must support chain traversal in both directions:

1. Pose -> Rig -> Autorig -> Animatable
2. Animatable -> Autorig -> Rig -> Pose sources

Traversal must preserve context (no unexpected selection resets).

## Inputs Pane Contract

1. Inputs include canonical rig controls plus pose-weight controls.
2. Pose-weight controls are stable per pose and path-based (`rig/{face}/poses/{poseId}.weight`).
3. Input rows show enough metadata to understand provenance (control type/source).
4. Inputs remain editable with standard range/default semantics.
5. As stage/group composition grows, Inputs must distinguish:
   - pose-weight controls,
   - group/stage composition controls,
   - regular rig inputs.

## Pose Authoring Contract

### Variable Lifecycle

1. Editable metadata: name/path/min/max/default.
2. Variable create/edit/delete remains available from inspector-centric workflows.

### Pose Lifecycle

1. Create pose.
2. Duplicate pose.
3. Rename/edit pose metadata.
4. Delete pose.
5. Assign/unassign pose groups.

### "What I Drive" Channel Row Contract

Each driven channel renders as three rows.

Row 1 (identity + mapping):

1. Channel name.
2. Contribution strength.
3. Link/reference to the target variable.
4. Remove-channel action.

Row 2 (current value controls):

1. Slider for current value.
2. Numeric field bound to the same current value.
3. `Reset to Default` action.
4. `Set Current as Target` action.

Row 3 (target value controls):

1. Slider for target value.
2. Numeric field for target value.
3. Min and max labels from the referenced target channel.

Interaction requirements:

1. Numeric fields show exactly four digits after the decimal.
2. Clicking/typing in numeric fields does not trigger slider drag behavior.
3. Slider and numeric fields remain synchronized in both rows.

## Pose Groups and Composition UX Contract

1. Pose groups are first-class entities with explicit membership editing.
2. Group-local blend mode is configurable and visible.
3. Cross-group composition mode is configurable and visible.
4. Multi-stage composition supports explicit stage ordering and operations (`add` / `average`) with stage source selection (group and prior-stage references).
5. Stage editing blocks invalid topology before apply/export (self/forward references, unknown sources, duplicate/empty sources).
6. Policy features such as per-channel override/priority are deferred and must be clearly marked when absent.

## Neutral and Value Semantics

1. Pose output is neutral-aware when no contributor is active.
2. UI must distinguish:
   - target value,
   - current/applied value,
   - contribution strength.
3. Neutral strategy (`face-default` vs explicit) must be visible once neutral authoring is enabled.

## Autorig Visibility Contract

1. Primary authoring UX should prioritize high-level variable/property semantics.
2. Low-level autorig rows should be minimized in default flows.
3. Advanced/debug views may expose full autorig internals.

## Import/Export UX Contract

1. Import must surface structured diagnostics consistently across pose config/IR/graph paths.
2. Export must show compatibility failures before write and include actionable remediation.
3. Export metadata includes pose IR and diagnostics for auditability.

## Out of Scope (Current MVP Scope)

1. Per-channel override and priority policy authoring.
2. Full visual rebrand unrelated to authoring correctness/workflows.
3. Runtime architecture redesign outside authoring contract needs.
