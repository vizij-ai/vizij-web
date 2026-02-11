# Vizij Authoring Contributor Appendix

Last updated: 2026-02-11
Audience: contributors implementing or reviewing changes in `vizij-authoring`.

This appendix complements `apps/vizij-authoring/docs/ARCHITECTURE.md` with practical engineering guidance.

## Contributor Do/Don't Rules

1. Do keep runtime-truthful behavior as the source of truth.

- If UI and runtime disagree, fix data flow first, styling second.

2. Do use store APIs and shared helpers.

- Prefer `useBindingAuthoring` / `useGraphRuntime` actions over direct ad-hoc mutation.

3. Do make import/remap changes deterministic and conflict-safe.

- Keep apply steps explicit; avoid hidden mutation side effects.

4. Don't hard-code slot assumptions.

- Do not assume `slots[0]` is the active source.

5. Don't add component-local logic for domain transforms that should be shared.

- Move reusable transforms into hooks/services/utils.

6. Don't mix selection domains casually.

- Route selection transitions through `useUnifiedSelection` patterns.

## Performance Hotspots

1. `useRigController` recompute paths.

- Graph build + scene projection can be expensive when bindings/inputs churn.
- Be careful when adding dependencies to large `useMemo`/`useEffect` blocks.

2. Inspector heavy rendering.

- `InspectorContent`, `FeatureList`, and `BindingEditor` can render large trees.
- Prefer memoized selectors and targeted prop updates over broad state pulls.

3. Variable and hierarchy trees.

- `VariablesPanel` and selector trees can grow large with many inputs/features.
- Keep filtering and grouping memoized.

4. Debug/diagnostics panels.

- Avoid synchronous heavy transforms in render path.

## Concurrency and Race Notes

1. Bundle sync ordering.

- Rig import may update face id; pose config import should wait for face id convergence.
- See `useBundleSynchronizer`.

2. Runtime bridge availability.

- Input staging depends on runtime bridge readiness; avoid assuming immediate availability.

3. Discrepancy review lifecycle.

- Only one active discrepancy resolution promise should be in flight per review context.

4. Cancellation handling.

- Async import/build effects should respect cancellation flags to avoid stale state writes.

## Security and Trust Boundaries

1. Imported files are untrusted input.

- Always normalize/validate GraphSpec payloads before applying to authoring state.

2. Use shared normalization paths.

- Prefer `prepareSpecForImport`, `normalizeGraphSpec`, and graph diff canonicalization helpers.

3. Fail closed for invalid graph payloads.

- If validation fails, surface diagnostics and avoid partial unsafe mutation.

4. Export should validate critical graph constraints.

- Block or warn according to current runtime/export rules, do not silently emit invalid payloads.

## Feature Flag Strategy

1. Add flags only for meaningful staged behavior.

- Prefer one flag per capability slice, not per component tweak.

2. Defaulting.

- New flags should have explicit defaults in central feature-flag state.

3. Scope.

- Flags should gate behavior in logic layers first, UI affordances second.

4. Cleanup.

- Remove flags once behavior is stable and rollout is complete.

## Release and PR Checklist

1. Validate locally:

- `pnpm --filter vizij-authoring run validate`

2. Keep docs current:

- Update architecture/plans/notes when behavior changes materially.

3. Confirm migration safety for import changes:

- Face mismatch, discrepancy path, remap conflict checks.

4. Confirm inspector chain behavior for UI changes:

- pose -> rig -> animatable and reverse traversal still works.

5. Confirm export semantics for graph/runtime changes:

- GraphSpec validity and pose graph checks remain consistent.

## Future Architecture Direction

1. Split `useRigController` into smaller orchestrators.

- Candidate boundaries: graph build/runtime publish, input staging, import/discrepancy, binding-authoring projection.

2. Unify inspector shell patterns.

- Shared wrapper for chain path + status + tabs to reduce duplication.

3. Strengthen integration-level coverage.

- Add broader end-to-end interaction tests for inspector traversal and import/remap workflows.

4. Continue moving stable transforms into shared packages where reuse is likely.
