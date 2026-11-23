import type { VizijEvent, VizijHandle } from "@vizij/runtime";
import type { FrameView } from "./frame";

/** What {@link trackDrawn} reads of the App's handle. */
export type FaceState = Pick<VizijHandle, "faces" | "loading">;

/** What {@link frameView} uses of the App's handle. */
export type FrameApp = Pick<
  VizijHandle,
  "faces" | "loading" | "place" | "safeAreas"
>;

/**
 * Which faces show their device's pose, kept from the App's events: a face
 * is drawn from its `ready` until its next `loaded`, the face a reload
 * replaces drawing meanwhile.
 */
export function trackDrawn(): {
  hear(event: VizijEvent): void;
  /** Whether face `vizijId` shows, has no load under way, and has drawn
   * since its last load. */
  ready(state: FaceState, vizijId: string): boolean;
} {
  const drawn = new Set<string>();
  return {
    hear(event) {
      if (event.type === "loaded") drawn.delete(event.instance);
      else if (event.type === "ready") drawn.add(event.instance);
    },
    ready(state, vizijId) {
      return (
        state.faces.has(vizijId) &&
        !state.loading.has(vizijId) &&
        drawn.has(vizijId)
      );
    },
  };
}

/**
 * What one frame asks of the App about its slots. The handle's `loading`
 * builds a new set of every instance on each read, so the frame reads it once
 * for all its slots rather than once per slot.
 */
export function frameView(
  app: FrameApp,
  drawn: ReturnType<typeof trackDrawn>,
): FrameView {
  const state: FaceState = { faces: app.faces, loading: app.loading };
  return {
    place: (vizijId, rect) => app.place(vizijId, rect),
    ready: (vizijId) => drawn.ready(state, vizijId),
    safeArea: (vizijId) => app.safeAreas.get(vizijId) ?? null,
  };
}
