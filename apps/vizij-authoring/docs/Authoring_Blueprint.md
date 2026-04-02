# Authoring Blueprint: Inputs, Pose, and Rig Layer Contract

Last updated: 2026-03-30
Status: living local reference
Owner: Vizij Authoring  
Scope: `apps/vizij-authoring`

## 1) Purpose

This blueprint defines the canonical authored and compiled model for:

1. animatable leaves,
2. propsrigs (low-level rig variables),
3. abstract rig inputs,
4. poses and pose groups,
5. bindings (directed edges),
6. the namespace and validation model that keeps these layers consistent.

It also defines UI behaviors required to create, edit, and delete Inputs, Poses, and Pose Groups while preserving correct graph composition.

If this file conflicts with `ARCHITECTURE.md` or `UI_DESIGN.md`, follow those files first and treat this blueprint as the layer-model companion reference.

## 2) Current contract and migration notes

- Existing docs and implementations historically used `/rig/element`.
- New contract for this cycle: generated low-level rig variables are now **`/propsrig/...`**.
- Internal pose-control outputs now use `rig/<face>/pose/control/<inputId>` as a graph-internal runtime path; they are not a generated low-level rig namespace.
- Legacy imported assets should still load and continue to work, but emit migration diagnostics when their low-level mapping does not match the new `/propsrig` contract.

## 3) Authoring levels

### 3.1 Animatable layer (render/scene layer)

- Scope: scene target leaves (e.g., transform components, morph weights, material channels).
- These are the sink nodes that are directly rendered.
- They are discovered from the loaded face and exposed in Face Elements.
- They are **not** intended as top-level authored controls.

### 3.2 PropsRig layer (low-level rig variables)

- Scope: one auto-generated rig input per animatable leaf.
- These inputs are write-capable to animatable targets.
- They are considered implementation detail and are mostly metadata.
- Canonical path namespace: `/propsrig/<face>/<shape>/<feature>/<component>` (normalized).
- Path is derived from auto-generated source metadata (source id, animatable component id, etc.).
- The system should auto-create these on face import.
- If an imported face already has equivalent mappings, reuse that relation rather than duplicating.

### 3.3 Abstract Rig layer (control layer)

- Scope: authored abstract rig inputs that may be manual values, expressions, or binding-driven inputs.
- They may target:
  - other abstract rig nodes,
  - one or more propsrig nodes.
- They must **not** directly write animatable leaves.
- They are the primary authored input-editing layer.

### 3.4 Poses

- Scope: semantic collections of target values keyed by abstract-rig ids.
- A pose defines intended offsets/value goals for abstract-rig inputs (never directly for animatables).
- Poses are members of one or more pose groups.
- Pose IDs must be first-class references, not encoded by path prefix.

### 3.5 Pose groups

- Scope: first-class entity grouping poses with a local blend strategy.
- Output: one pose-group aggregate per abstract-rig target.
- Pose groups can be shared across targets.

### 3.6 Pose aggregate layer

- For each abstract-rig target:
  1. blend all pose contributions inside each group,
  2. then blend group outputs across groups with the cross-group strategy,
  3. emit a single pose aggregate target for that abstract-rig input.

### 3.7 Input edges

- Directed edges between input nodes (and pose aggregate outputs where applicable).
- Input edges connect the "source authority" (parent expression or upstream rig node) to the destination rig node.

## 4) Connection semantics (authority and direction)

1. `Pose` -> `Abstract Rig`  
   via pose aggregate outputs (group-local + cross-group).
2. `Abstract Rig` -> `Abstract Rig`  
   allowed, including:
   - abstract rig -> abstract rig,
   - abstract rig -> propsrig.
3. `PropsRig` -> `Animatable`  
   required for all direct scene writes.
4. `Abstract Rig` -> `Animatable`  
   not allowed; must be flagged as boundary violation.

### 4.1 Boundary rule (authoritative)

- Direct edges to animatable targets are valid **only** when the target node is an propsrig.
- Any edge from abstract-rig node to animatable is a contract violation.
- Warning/diagnostic should identify source and target ids and include fix guidance.

## 5) Namespace contract

### 5.1 Canonical source-of-truth

- Generated propsrig paths MUST use `/propsrig` prefix.
- Inputs logic should include `/propsrig` entries as first-class graph inputs and display them in the Inputs pane.
- Rig inspector/traversal should still resolve and display the alias relationship to scene features.

### 5.2 Detection and warning behavior

On load / import / compile:

1. If detected auto-generated entries use non-`/propsrig` prefix:
   - add warning: "legacy metadata namespace detected."
   - show list of offenders and the suggested migrated path.
   - preserve behavior at runtime for at least one release with migration support.
2. If a non-`/propsrig` animatable writer appears as a normal abstract-rig input:
   - classify as malformed migration path and require explicit user action.

## 6) Under-the-hood IR changes expected

1. Pose groups are not derived from prefix text; they are first-class entities.
2. Pose membership references groups by identity.
3. Pose-group aggregate outputs feed abstract-rig targets directly (or via explicit graph nodes), not individual poses directly to animatables.
4. Low-level auto-generated rig nodes are tagged as `metadata` but remain visible in the Inputs pane as leaf sliders for graph-level debugging and direct adjustment.
5. Validation rules operate on graph edges:
   - edge kind (binding/category),
   - target layer type (propsrig vs abstract rig),
   - namespace conformance.

## 7) UI blueprint and required functions

### 7.1 Face Elements surface

- Refresh on face load.
- Display discovered animatable leaves.
- Show auto-authoring status of each corresponding propsrig:
  - created,
  - missing,
  - stale.
- Provide quick sync action if propsrig mapping is missing.

### 7.2 Inputs and Drivers surfaces

Required functions:

1. Show one hierarchical collection of all potential graph inputs:
   - abstract rig inputs,
   - propsrig inputs,
   - pose-group weight inputs.
2. Preserve folder/group structure for discoverability.
3. Leaf selection always shows a slider control bound to that input’s current value.
4. Create input (abstract/derived).
5. Edit input label/path/group/default/range.
6. Delete input (where non-root, non-dependent inputs are removable).
7. Reparent/relink bindings for abstract/pose-group inputs.
8. Navigate to rig-node inspector.
9. Show metadata label for aliasing (e.g., propsrig row resolves to scene target).

### 7.3 Poses surface

Required functions:

1. Create pose.
2. Edit pose metadata (name/label/description).
3. Edit rig-target values (numeric matrix + raw input controls).
4. Duplicate and delete pose.
5. Add/remove pose from pose groups (IDs, not by path prefix).
6. Preview pose contribution against neutral baseline.

### 7.4 Pose Groups surface

Required functions:

1. Create group.
2. Rename group.
3. Delete group (with membership safety checks).
4. Assign/unassign pose members.
5. Set local blend mode.
6. Set/inspect cross-group strategy.

### 7.5 Wiring model

- The app currently keeps a dedicated Drivers surface inside `Control Authoring`.
- Wiring actions are performed via:
  - Drivers/input bindings editor for selected rows,
  - Inspector-level chain navigation/actions.
- Required wiring behavior:
  1. Show selected node incoming/outgoing links.
  2. Create/delete link edges between allowed nodes.
  3. Retarget links when ids are migrated.
  4. Open chain context (`pose-aggregate-output` / `pose-group-output` / propsrig / animatable) from selected nodes.

## 8) Authoring workflows this blueprint enforces

### 8.1 Face load bootstrap

1. Load face.
2. Discover animatables and animated components.
3. Auto-create propsrig nodes under `/propsrig`.
4. Build alias map to original face targets.
5. If legacy non-`/propsrig` mappings exist, surface warnings and migration actions.

### 8.2 Authoring control flow

1. Author all graph inputs from the Inputs pane (abstract rig + propsrig + pose-group weight inputs).
2. Create poses + pose groups independent of path naming.
3. Compile to pose aggregates.
4. Compile graph resolves to abstract rig and propsrig nodes.
5. Runtime writes resolve to animatable leaves only through propsrigs.

## 9) Acceptance criteria

1. An abstract-rig input can drive an propsrig or another abstract-rig input.
2. An abstract-rig input cannot directly target animatable nodes and is prevented/flagged.
3. `/propsrig` is the generated namespace for low-level rig metadata.
4. Legacy non-`/propsrig` mappings load with warning and deterministic migration path.
5. Inputs/poses/pose groups support create/edit/delete in dedicated surfaces.
6. Pose membership is independent of path naming and remains valid through import/export.
