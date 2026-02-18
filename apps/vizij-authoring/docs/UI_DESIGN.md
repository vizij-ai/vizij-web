# Vizij Authoring UI Design

Last updated: 2026-02-18
Status: active

This file defines UI/UX behavior contracts. Implementation sequencing is tracked in `plans/ROADMAP.md` and `plans/BACKLOG.md`.

## Design Principles

1. Inspector-first workflows: users should complete tasks without unnecessary panel/context switching.
2. Runtime-truthful presentation: displayed current values must reflect authoritative runtime/autorig state.
3. Readability under density: controls and hierarchy remain clear in high-complexity scenes.
4. Progressive disclosure: compact defaults with on-demand detail expansion.
5. Consistent lifecycle patterns: create/edit/delete flows behave similarly across variables, poses, and pose groups.

## Information Architecture

### Left Sidebar Surfaces

Required surfaces:

1. Face Elements
2. Variables
3. Poses
4. Pose Groups
5. Inputs

Behavior requirements:

1. One global selected item across surfaces.
2. Predictable pane ordering and density handling.
3. Hidden surfaces should not perform heavy filtering/tree work.

### Inspector

The inspector is the primary editing surface and must support:

1. Full item lifecycle controls relevant to selected entity.
2. Chain traversal in both directions:
   Pose -> Rig -> Autorig -> Animatable
   Animatable -> Autorig -> Rig -> Pose sources
3. Context preservation while traversing.

## Control Semantics

### Numeric + Slider Controls

1. Controls must remain legible and operable at supported panel widths.
2. Scrub and keyboard entry must both remain reliable.

### Pose Value Semantics

For pose-controlled channels, inspector must clearly separate:

1. target value (pose-defined intent),
2. current/applied value (runtime-authoritative output),
3. contribution strength (effective weight/percentage).

### Face Element Value Semantics

1. Displayed current value resolves from authoritative autorig channel state.
2. Inspector shows resolved chain/source context where indirect driving is involved.

### Lock Semantics

1. Locking applies at autorig channel granularity.
2. Locking one channel must not implicitly lock sibling channels.
3. Lock scope is visibly indicated.

## Lifecycle UX Contract

### Variables

1. Per-item create/edit/delete.
2. Editable metadata: name/path/min/max/default.
3. Binding/chain visibility from inspector context.

### Poses

1. Per-item create/edit/delete.
2. Target-content editing.
3. Group membership management.

### Pose Groups

1. Per-item create/edit/delete.
2. Membership management.
3. Blend behavior controls.

## Import/Export UX Contract

1. Import auto-fixes safe face-name mismatches.
2. Import auto-retargets invalid abstract-rig -> animatable links to autorig links where safe.
3. Export surfaces runtime compatibility validation results.
4. Runtime control surfaces expose pose weights alongside rig inputs.

## Data-Model UX Contract

1. Pose definitions are independent reusable entities.
2. Poses can belong to multiple groups.
3. UI exposes shared membership clearly from both pose and group perspectives.

## Out of Scope (Current Stage)

1. Full visual brand redesign.
2. Non-authoring surfaces and unrelated product workflows.
