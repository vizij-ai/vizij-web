# Vizij Authoring UI Design

Last updated: 2026-02-26
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

1. Pose -> Rig -> Props Rig -> Animatable
2. Animatable -> Props Rig -> Rig -> Pose sources

Traversal must preserve context (no unexpected selection resets).

## Inputs Pane Contract

1. Inputs include canonical rig controls, canonical pose-weight controls, and derived group/stage output rows.
2. Pose-weight controls are stable per pose and path-based (`rig/{face}/poses/{poseId}.weight`).
3. Internal pose-control paths (`rig/{face}/pose/control/{inputId}`) are runtime inputs but hidden from the default user-facing Inputs pane.
4. Derived composition rows use deterministic paths (`/pose/groups/{groupId}.output`, `/pose/stages/{stageId}.output`).
5. Input rows must show provenance metadata (pose source for pose-weight controls; group/stage mode and source context for derived rows).
6. Editability contract:
   - regular rig and pose-weight controls remain editable/selectable with standard range/default semantics,
   - derived group/stage rows are explicitly read-only and non-selectable.
7. Inputs must visibly distinguish control kinds (`rig-input`, `pose-weight`, `group-output`, `stage-output`).

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
3. Compose mode selector (UI labels: `Additive` (default) and `Average`; canonical enum values: `add` and `average`) for direct+pose channel combination.
4. Link/reference to the target variable.
5. Remove-channel action.

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
6. Data contracts support per-channel cross-group overrides, including `priority` mode with deterministic ordering/tie-break semantics; import/export and diagnostics must preserve and explain these policies.
7. Stage/group inspectors are the neutral authoring home for composition contexts; Inputs remains read-only observability for derived outputs.
8. Stage/group neutral source authoring supports:
   - `inherit`,
   - `pose-reference`,
   - `direct-values`.
9. Inspector composition outputs must show effective values for current authored live source weights; fixed checkpoint sampling is optional and non-default.

Direct+pose effective-channel contract:

1. For each driven channel, authoring configures how direct control and pose-control signals combine before binding.
2. Effective value uses `effective_i = clamp(compose(direct_i, pose_i), min_i, max_i)`.
3. MVP `compose` options are `add` and `average`, with `add` as default.
   - Canonical enum identifiers: `add`, `average`.
   - UI labels: `Additive` → `add`, `Average` → `average`.
   - Any new compose modes must define both their enum identifier and UI label mapping in this document.

## Neutral and Value Semantics

1. Pose output is neutral-aware when no contributor is active.
2. UI must distinguish:
   - target value,
   - current/applied value,
   - contribution strength.
3. Global neutral strategy (`face-default` vs explicit) must be visible once neutral authoring is enabled.
4. Scoped neutral precedence for composition contexts must be:
   - stage override,
   - group override,
   - global neutral,
   - channel default fallback.
5. Current `average` semantics are overlay-average relative to the effective neutral baseline (not a pure absolute overwrite).

## Props Rig Visibility Contract

1. Primary authoring UX should prioritize high-level variable/property semantics.
2. Low-level propsrig rows are hidden/minimized in default inspector chain flows unless no high-level mapping exists.
3. Advanced/debug view exposes full propsrig internals through explicit `Show/Hide Props Rig Internals` controls.

## Animation Transport Contract

1. `Play` activates the animation runtime session for the selected clip and
   starts playback from the current playhead.
2. `Pause` holds the playhead; the face keeps the pose it was showing.
3. `Stop` **halts and rewinds**: the playhead returns to 0, the clip's t=0 pose
   is applied, and the runtime session stays active so `Play` resumes without
   re-registering.
4. `Stop` must not tear down the runtime session. Clearing the active runtime
   target unregisters the animation source and mutes the clip to zero tracks,
   which makes the next `Play` re-activate and re-register everything, and
   makes a stopped clip indistinguishable from an absent one in diagnostics.
5. Tearing the session down is reserved for switching to a different clip and
   for session reset (new face load).
6. The transport clock reflects device feedback when available and a host-side
   playhead otherwise; it must never silently report 0 as a stand-in for
   "no telemetry".

## Import/Export UX Contract

1. Import must surface structured diagnostics consistently across pose config/IR/graph paths.
2. Export must show compatibility failures before write and include actionable remediation.
3. Export metadata includes pose IR and diagnostics for auditability.

## Out of Scope (Current MVP Scope)

1. Dedicated visual editor workflows for per-channel override/priority policy authoring (beyond config/IR import-export parity).
2. Full visual rebrand unrelated to authoring correctness/workflows.
3. Runtime architecture redesign outside authoring contract needs.
