import type { VizijEvent, VizijHandle } from "@vizij/runtime";

/** What {@link trackDrawn} reads of the App's handle. */
export type FaceState = Pick<VizijHandle, "faces" | "loading">;

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
