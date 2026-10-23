/**
 * The inspector's locks as the view's holds.
 *
 * A locked inspector target is an animatable (`<animatableId>`) or one
 * component of it (`<animatableId>:x` … `:z`, `:r` … `:b`) — the forms the
 * view's `hold` takes — so a lock is held as it is named. This says which
 * holds to take and which to release when the locked set changes.
 */
export function heldOutputChanges(
  held: ReadonlySet<string>,
  locked: ReadonlySet<string>,
): { hold: string[]; release: string[] } {
  const hold: string[] = [];
  const release: string[] = [];
  locked.forEach((target) => {
    if (target.trim() && !held.has(target)) {
      hold.push(target);
    }
  });
  held.forEach((target) => {
    if (!locked.has(target)) {
      release.push(target);
    }
  });
  return { hold, release };
}
