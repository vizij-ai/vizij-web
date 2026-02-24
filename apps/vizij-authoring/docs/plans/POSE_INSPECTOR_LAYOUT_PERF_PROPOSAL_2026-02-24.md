# Pose Inspector Layout + Performance Proposal (2026-02-24)

## Context

When the pose inspector opens with dense pose payloads, frame rate can drop from over 20 FPS to around 12 FPS even before editing. The primary hotspot is the "What I Drive" surface, where each channel currently contributes multiple interactive controls and value derivations.

## Static Analysis Summary (Pose Inspector)

### 1) Eager mount of expensive controls per channel

Before this pass, every channel row mounted:

- direct-input slider + numeric field
- pose-target slider + numeric field
- action buttons and derived indicators

For large poses, this creates a high interactive control count immediately on open.

### 2) Broad pose-mode subscriptions to `inputValues`

The parent inspector subscribed to broad input maps while rendering pose content. Any staged input update could fan out rerenders across many rows, including rows not being edited.

### 3) Parent-level derivation of per-channel direct values

Direct values were resolved for all channels in parent render paths, even when channel details were not actively used.

### 4) Dense row layout work

Every row rendered full detail controls by default, increasing layout/reflow/paint pressure for the side panel.

## Changes Implemented In This Pass

Code path: `apps/vizij-authoring/src/components/inspector/InspectorContent.tsx`

1. Channel details are now collapsed by default and expanded per-channel.
2. Heavy controls are lazily mounted only when a channel is expanded (`PoseVariableExpandedControls`).
3. Added `Expand Channels / Collapse Channels` controls for fast batch interaction.
4. Narrowed pose-mode binding-store subscription scope; broad `inputValues` subscription is no longer active for the whole pose inspector.
5. Moved direct-value selector reads into the expanded-detail component so collapsed rows stay lightweight.

Validation completed:

- `pnpm --filter vizij-authoring run validate` passed (existing lint warning unchanged).
- Pose inspector contract coverage updated in:
  - `poseInspectorSemanticsContracts.test.ts`
  - includes contract for deferred heavy controls behind expansion.

## Why Default-Collapsed Channels Improve Performance

Yes: collapsing channels should materially improve speed.

Reason: collapsed rows avoid mounting most interactive controls and related subscriptions. If `N` channels exist and only `E` are expanded (`E << N`), mounted heavy controls scale with `E`, not `N`. That reduces:

- React reconciliation work
- DOM node count
- layout/paint cost
- store-driven rerender fan-out

## Proposal: Next Layout Reorganization (Clarity + Speed)

### Phase A (Low risk, incremental)

1. Keep summary-first rows as default (already partially landed).
2. Standardize row summary fields to: label, contribution, target, pose-driven value, compose mode, inspect/remove.
3. Keep detailed editing controls hidden behind explicit expansion.
4. Persist expansion state per pose during session so users do not re-open channels repeatedly.

### Phase B (Moderate risk, high leverage)

1. Add channel-list virtualization when visible row count exceeds a threshold (for example, 60+ rows).
2. Split row rendering into memoized leaf components:
   - `PoseChannelSummaryRow`
   - `PoseChannelDetails`
3. Keep selectors local to leaves; parent should pass stable IDs and immutable metadata only.
4. Add optional "Edit Focus Mode" to show controls only for selected/filtered channels.

### Phase C (Larger refactor)

1. Extract pose inspector into dedicated modules (`PoseInspectorShell`, `PoseChannelsPanel`, `PoseChannelRow`, `PoseChannelDetails`).
2. Introduce explicit selector boundaries for pose value streams vs metadata streams.
3. Add targeted perf harness for pose-inspector-open and dense channel edit scenarios with regression budgets.

## Functional Safety Requirements (Must Hold)

1. Variables, drivers, and direct input authoring remain live and correct.
2. Pose target editing and pose-driven preview remain runtime-truthful.
3. Compose mode (`add`/`average`) behavior remains unchanged.
4. Inspect/remove channel actions remain unchanged.

## Perf + Validation Plan For Follow-Up

1. Add dedicated pose-inspector benchmark test:
   - open pose inspector with dense channel set
   - compare collapsed-open vs expanded-all scenarios
   - capture commit durations and interaction latency
2. Add render-count assertions for collapsed rows (no detail control mount until expanded).
3. Continue running:
   - `pnpm --filter vizij-authoring run validate`
   - perf baseline scripts after each tranche

## Recommendation

Proceed with Phase A and Phase B next. Phase C should be scheduled only after Phase B metrics confirm that remaining bottlenecks are architectural rather than control-density driven.
