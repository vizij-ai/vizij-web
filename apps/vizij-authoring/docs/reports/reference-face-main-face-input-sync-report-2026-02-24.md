# Reference/Main Face Input Sync Report (2026-02-24)

## Scope

This report documents:

1. How main-face and reference-face input behavior currently works.
2. How "copy between faces" currently works.
3. Candidate improvements and recommended next steps.

---

## Current System: How It Works

### 1) Main-face runtime + authoring inputs

- Main authoring values are stored in binding authoring state (`inputValues`) and updated via `handleInputValueChange`:
  - `apps/vizij-authoring/src/hooks/useRigController.ts` (runtime routing + input staging)
- Runtime input writes are staged through graph-path lookup (`runtimeInputGraphPathLookupRef`) and emitted through `stageRuntimeInput`.
- Main viewer runtime constraints are now exported upward via:
  - `RuntimeInputCatalogBridge` in `apps/vizij-authoring/src/components/app/Viewer.tsx`
  - This bridge emits all constraint-derived inputs, not only `/standard/*`.

### 2) Reference-face runtime + local input state

- Reference face is hosted by `ReferenceFaceRuntime` and keeps its own local input values through `useReferenceFaceState`.
- Constraint discovery now uses:
  - `buildRuntimeInputCatalogFromConstraints(...)` in `apps/vizij-authoring/src/components/app/runtimeInputsFromConstraints.ts`
- This means reference-side input catalog includes all mirrorable runtime constraints (standard and non-standard paths), as long as they appear in runtime `inputConstraints`.

### 3) Shared sync layer between faces

- Sync is orchestrated in `App.tsx` through `useSharedVariableSync(...)`:
  - Main side input map: merged catalog (`main runtime constraints` + authored `standardInputsById`)
  - Reference side input map: reference runtime catalog
- `useSharedVariableSync` pairs inputs by normalized path and mirrors values according to policy:
  - `off`, `bidirectional`, `main-to-reference`, `reference-to-main`
- Drift/conflicts are tracked and can be resolved in the Variables panel UI.

### 4) "All that we can" boundary

Even with non-standard discovery enabled, mirroring still requires:

1. Path-level overlap across both faces after normalization.
2. A routable main runtime graph path for the target input.

If either side lacks a matching/routable path, that input cannot be applied cross-face.

---

## How Copy Functionality Works Between Faces

There are two distinct "copy" behaviors:

### A) Live value mirroring (sync policy driven)

- Implemented in `useSharedVariableSync`.
- On detected value change in one face, the other face is updated (based on policy).
- Loop prevention is done through per-path suppression maps.
- Conflicts are tracked if both faces diverge within a short window.

This is value sync only. It does not create new authored variables.

### B) Explicit variable copy into main face ("Copy Ref")

- Implemented in `VariablesPanel` (`copyReferenceVariableToMain`, `handleCopyReferenceToMain`).
- For each reference entry:
  1. If main already has a linked/matching variable path, it reuses that variable.
  2. Otherwise it creates a custom standard input in main using the reference normalized path.
  3. It copies metadata (label/default/range/sourceId) to the new main variable.

This is a definition-copy operation. It changes the main authoring model.

---

## Candidate Improvements

## P0 (High value, low-to-medium risk)

### 1) Split runtime constraint model from `StandardRigInput`

Current implementation uses `StandardRigInput` as the transport type for non-standard runtime constraints. This works but conflates two domains:

1. Authoring-owned standard inputs.
2. Runtime-discovered constraints.

Recommendation:

- Introduce `MirrorableRuntimeInput` (`id`, `normalizedPath`, `default`, `range`, `source: runtime|authored`).
- Keep `StandardRigInput` for authored/main data only.
- Convert explicitly at UI boundaries where needed.

### 2) Add "unmapped constraints" diagnostics

Today, non-overlapping inputs silently do not mirror. Add a diagnostics surface:

1. Count of reference-only inputs.
2. Count of main-only inputs.
3. Count of matched/mirrorable inputs.
4. Optional expandable list with normalized paths.

This gives immediate feedback on why some channels are not syncing.

### 3) Add targeted tests for non-standard mirroring

Add tests that assert:

1. Non-`/standard/*` overlapping paths are paired.
2. Bidirectional updates mirror both ways.
3. Constraint catalog refresh does not clobber existing reference values.
4. Main route fallback resolution works for non-standard path-derived IDs.

## P1 (Medium value, medium risk)

### 4) Move pairing key from derived ID to canonical path token

IDs derived from path are convenient but brittle for aliasing. Use a single canonical key:

1. `normalizedPath` as the sync identity.
2. ID as a runtime/write helper only.

This reduces mismatch risk across rigs with different ID conventions.

### 5) Introduce explicit sync boundary filters

Now that we include more constraints, define explicit guardrails:

1. Allowlist by prefix (default includes `/standard`, `/autorig`, `/pose/control`, etc.).
2. Optional denylist for internal-only channels.

This avoids accidental mirroring of internal or unstable control channels.

## P2 (Longer-term refactor)

### 6) Unify main/reference runtime input catalogs through a shared provider

Current flow builds catalogs separately in Viewer and Reference runtime. A shared catalog service/provider would:

1. Standardize normalization and conflict semantics.
2. Reduce duplicated path transformation logic.
3. Centralize observability/metrics.

### 7) Upgrade conflict model with causality metadata

Current conflict logic is time-window based. Consider storing sequence/source metadata to better classify:

1. User-initiated edits.
2. Programmatic sync writes.
3. Runtime-originated updates.

This improves conflict quality and reduces false positives.

---

## Suggested Next Execution Steps

1. Add non-standard sync diagnostics in Variables panel (counts + expandable list).
2. Add P0 test coverage for non-standard mirrored paths.
3. Introduce `MirrorableRuntimeInput` and migrate sync pairing to that type.
4. Add prefix-based sync allowlist/denylist controls.
