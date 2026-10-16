import type { InitProgress } from "@vizij/runtime";

/**
 * A face's own stages on its way to being drawn, as whoever loads it reports
 * them (`setVizijProgress`): its GLB's bytes arriving (`total` is `null`
 * when the length is unknown), `loadVizij`, then its first frame. `failed`
 * ends the load.
 */
export type VizijProgress =
  | { stage: "fetch"; loaded: number; total: number | null }
  | { stage: "load" }
  | { stage: "draw" }
  | { stage: "failed"; error: Error };

/**
 * Where a face's slot is on its way to showing the face: the runtime's
 * stages (`@vizij/runtime`'s `onInitProgress` until `init()` resolves, then
 * `mount`, the page's App being built), then the face's own.
 */
export type LoadingStage =
  | Exclude<InitProgress, { stage: "ready" }>
  | { stage: "mount" }
  | VizijProgress;

/** The runtime's stage until the canvas is mounted; `null` from then on. */
type RuntimeStage =
  | Exclude<InitProgress, { stage: "ready" }>
  | { stage: "mount" }
  | { stage: "failed"; error: Error };

interface Face {
  progress: VizijProgress | null;
  /** The face has been drawn: its slot shows it, and a reload keeps the
   * previous scene drawing, so the loading view does not come back. */
  drawn: boolean;
}

/** Before `init()` is called, `onInitProgress` reports a download with
 * nothing received. */
let runtime: RuntimeStage | null = {
  stage: "download",
  loaded: 0,
  total: null,
};
const faces = new Map<string, Face>();
const watchers = new Set<{
  vizijId: string;
  listener: (stage: LoadingStage | null) => void;
  last: LoadingStage | null;
}>();

/**
 * Report face `vizijId`'s own stage, for the loading view of its slot
 * (`<Vizij>`). `@vizij/runtime-react`'s provider reports its faces; a page
 * that loads a face with `loadVizij` itself reports it the same way. `null`
 * says no face is loaded under the id any more: its slot shows the loading
 * view again until a face under the id is drawn.
 *
 * Whatever is reported, a slot hides its loading view once its face has been
 * drawn (`ready(vizijId)`), and keeps it hidden through reloads, whose
 * previous scene draws until the new one is ready.
 */
export function setVizijProgress(
  vizijId: string,
  progress: VizijProgress | null,
): void {
  if (progress === null) {
    faces.delete(vizijId);
  } else {
    const face = faces.get(vizijId);
    if (face) face.progress = progress;
    else faces.set(vizijId, { progress, drawn: false });
  }
  notify();
}

/** The canvas's report of the runtime's stage; `null` once it is mounted. */
export function setRuntimeStage(stage: RuntimeStage | null): void {
  runtime = stage;
  notify();
}

/** The canvas's frame loop saw face `vizijId` drawn. */
export function markDrawn(vizijId: string): void {
  const face = faces.get(vizijId);
  if (face?.drawn) return;
  if (face) face.drawn = true;
  else faces.set(vizijId, { progress: null, drawn: true });
  notify();
}

/**
 * The stage face `vizijId`'s slot shows, or `null` once the face is drawn.
 * A failure of the runtime or of the face shows first; then the runtime's
 * stages, which every face waits on; then the face's own, `load` when its
 * loader reports none.
 */
export function loadingStage(vizijId: string): LoadingStage | null {
  const face = faces.get(vizijId);
  if (face?.drawn) return null;
  if (runtime?.stage === "failed") return runtime;
  if (face?.progress?.stage === "failed") return face.progress;
  if (runtime !== null) return runtime;
  return face?.progress ?? { stage: "load" };
}

/** Calls `listener` with face `vizijId`'s stage at once, then with each
 * change; returns the unsubscribe. */
export function watchLoading(
  vizijId: string,
  listener: (stage: LoadingStage | null) => void,
): () => void {
  const watcher = { vizijId, listener, last: loadingStage(vizijId) };
  watchers.add(watcher);
  listener(watcher.last);
  return () => {
    watchers.delete(watcher);
  };
}

function notify(): void {
  for (const watcher of [...watchers]) {
    const next = loadingStage(watcher.vizijId);
    if (sameStage(next, watcher.last)) continue;
    watcher.last = next;
    watcher.listener(next);
  }
}

function sameStage(a: LoadingStage | null, b: LoadingStage | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.stage !== b.stage) return false;
  if ("loaded" in a && "loaded" in b) {
    return a.loaded === b.loaded && a.total === b.total;
  }
  if ("error" in a && "error" in b) return a.error === b.error;
  return true;
}
