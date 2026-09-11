import { useCallback } from "react";
import { useRowLock, type RowLockState } from "../editor/hooks/useRowLock";
// Deliberately the provider re-export rather than `state/bindingAuthoringStore`:
// the inspector tests mock `state/RigControllerProvider`, and a hook reaching
// past it would bypass every one of those mocks.
import { useBindingAuthoring } from "../../state/RigControllerProvider";

/**
 * App-layer adapter: binds the generic {@link useRowLock} aggregation to this
 * app's inspector lock state.
 *
 * The split is deliberate. `useRowLock` (in `editor/`) owns the part that is
 * genuinely reusable — "all of these are locked", "toggling means all-or-
 * nothing", "an unbound channel is not lockable". This file owns the part that
 * is not: the fact that vizij stores locks as a `Set` of *inspector target ids*
 * on `useBindingAuthoring`. `editor/` may not import `src/state/`, so this is
 * where that knowledge has to live.
 *
 * Accepts a single id or a list, because inspector rows come in both shapes:
 * a scalar property has one target, a vector or colour property has one per
 * component. `null`/`undefined` entries are dropped, so callers can pass
 * `component?.targetId` without guarding.
 */
export function useInspectorTargetLock(
  targetIds:
    | ReadonlyArray<string | null | undefined>
    | string
    | null
    | undefined,
): RowLockState {
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const handleSetInspectorTargetLocked = useBindingAuthoring(
    (state) => state.handleSetInspectorTargetLocked,
  );

  const isTargetLocked = useCallback(
    (targetId: string) => lockedInspectorTargetIds.has(targetId),
    [lockedInspectorTargetIds],
  );

  const ids = Array.isArray(targetIds)
    ? targetIds
    : [targetIds as string | null | undefined];

  return useRowLock(ids, {
    isTargetLocked,
    setTargetLocked: handleSetInspectorTargetLocked,
  });
}
