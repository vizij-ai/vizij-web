# Where "the selected animation" lives

Review prompted by clips overwriting each other when switching. The short
answer is that no single place owns it: six pieces of state represent "the
animation", split across React `useState` in `App` and a zustand store, and
three independent paths write the selection.

## The six pieces

| State                                                                                              | Owner                                                                              | Means                                                    |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `selectedAnimationTargetId`                                                                        | `App` useState                                                                     | which clip is being edited                               |
| `resolvedSelectedAnimationTargetId`                                                                | derived in `useManagedTargetLifecycle`, **written back** via `setSelectedTargetId` | the selection after validation against the options list  |
| `activeAnimationRuntimeTargetId`                                                                   | `App`                                                                              | which clip holds a runtime session                       |
| `pendingAnimationTargetSwitchId`                                                                   | `App`                                                                              | a switch deferred until the runtime session is torn down |
| `tracks` / `duration` / `hydratedClipId`                                                           | `useAnimationStore` (zustand)                                                      | the **live contents** of whatever is loaded              |
| `authoredAnimationTargets`, `bundleAnimationClipOverrides`, `…NameOverrides`, `…DurationOverrides` | `App` useState                                                                     | the **persisted contents**                               |

The live contents and the persisted contents are different stores, reconciled
by effects. That is the root of this class of bug.

## Three paths change the selection

1. `handleSelectAnimationTarget` — the click. Saves the outgoing clip first,
   then sets selection and loads.
2. `useManagedTargetLifecycle`'s reconcile effect — calls
   `setSelectedTargetId(resolvedTargetId)` whenever the current selection is
   not in `targetOptions`. `resolveValidTargetId` silently falls back to
   **`targetOptions[0]`**. No save of the outgoing clip happens on this path.
3. The pending-switch effect — applies `pendingAnimationTargetSwitchId` after
   the runtime session clears.

Only path 1 saves before switching. Paths 2 and 3 move the selection with no
save, and path 2 can fire with no user action at all.

Note that `animationTargetOptions` is `[...authored, ...bundle]`, so
`targetOptions[0]` is the first _authored_ clip when one exists and the first
_imported_ clip otherwise — the fallback target changes identity depending on
what else is in the list.

## Two paths load the store

- `handleSelectAnimationTarget` → `loadSelectedAnimationTarget`
- `useManagedTargetLifecycle`'s load effect → same function, guarded by a ref
  keyed `sessionKey::resolvedTargetId`

Its dependency array includes `loadSelectedTarget`, whose identity changes on
**every** `authoredAnimationTargets` change — i.e. on every autosave. The ref
suppresses the redundant reload, so the guard is doing real work; remove it and
every save triggers a reload.

## Why this produces overwrites

The autosave effect writes **live contents → selected target** whenever
`tracks` or `duration` change. Selection and live contents are moved by
different code on different schedules, so any window where they disagree
writes one clip's tracks onto another. `hydratedClipId` narrows the window —
a write is refused unless the marker matches the target — but the save is
triggered by _store changes_, not by a _completed load_, so ordering still
decides correctness.

## Recommendation

Give it one owner. A single store holding `{ selectedTargetId, clips }` where
switching is one atomic action — save outgoing, load incoming, set selection,
in a single transition — removes the disagreement window by construction
rather than narrowing it. The current shape cannot be made correct by adding
more guards, because the invariant it needs ("selection and live contents
always refer to the same clip") is not expressible across two stores
reconciled by effects.

## Loose end

`hydrateAuthoredTimelineFromBundleAnimations` in `useBundleSynchronizer.ts` is
exported and has **no callers** — a leftover from a third hydration path.
Worth deleting so it cannot be mistaken for live behaviour.

## The experiment that would settle the remaining overwrite

Log, with a stack trace, every call to `setSelectedAnimationTargetId` and
`loadSelectedAnimationTarget`, alongside each autosave's `(selected, marker,
trackCount)`. The stack identifies which of the three paths moved the
selection, which is the one fact that reading the code has not settled — three
hypotheses derived that way have all been wrong.
