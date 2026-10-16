// The `@vizij/runtime` functions the page components import, for tests that
// render them on Node: the view calls do nothing, and `onInitProgress`
// follows the contract — the current stage at once, then each change.
let current = { stage: "download", loaded: 0, total: null };
const listeners = new Set();

export function onInitProgress(listener) {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

/** Tests drive the runtime's stages through this. */
export function reportInitProgress(progress) {
  current = progress;
  for (const listener of [...listeners]) listener(progress);
}

export const init = () => new Promise(() => undefined);
export const mount = () => new Promise(() => undefined);
export const placeVizij = () => undefined;
export const ready = () => false;
export const safeArea = () => null;
export const drainPicks = () => [];
export const setView = () => undefined;
export const setSelection = () => undefined;
