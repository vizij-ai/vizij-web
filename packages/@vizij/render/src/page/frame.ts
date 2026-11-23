import type { Rect } from "@vizij/runtime";
import { markDrawn } from "./progress";

/** A click on a slot's face: the face's id, and the element under the
 * pointer by the id its RobotData declares — `null` for a click that hit no
 * element (a miss). */
export interface VizijPick {
  vizijId: string;
  elementId: string | null;
}

/** A mounted `<Vizij>`: where face `vizijId` draws on the page. */
export interface Slot {
  vizijId: string;
  /** The slot's element: its border box is the face's rectangle. */
  element: Element;
  /** The face's safe-area outline and the element it is positioned in, when
   * the slot shows it. */
  safeArea: { outline: HTMLElement; frame: Element } | null;
  onPick: ((pick: VizijPick) => void) | undefined;
  /** The rectangle last given to `place`. */
  placed: Rect | null;
}

/** What a frame asks of the page's App about each face. */
export interface FrameView {
  place(vizijId: string, rect: Rect): void;
  /** Whether the face shows its device's pose: drawn since its last load. */
  ready(vizijId: string): boolean;
  safeArea(vizijId: string): Rect | null;
}

/**
 * One animation frame of the page's canvas: each slot's face placed over the
 * slot's rectangle when it moved, its `data-vizij-ready`, loading view and
 * safe-area outline brought up to date.
 *
 * Reading every rectangle each frame follows scrolling, resizes and layout
 * shifts alike, which no event from the App reports.
 */
export function frame(
  slots: Iterable<Slot>,
  canvas: Element,
  view: FrameView,
): void {
  const origin = canvas.getBoundingClientRect();
  for (const slot of slots) {
    const rect = relative(slot.element.getBoundingClientRect(), origin);
    if (!sameRect(rect, slot.placed)) {
      view.place(slot.vizijId, rect);
      slot.placed = rect;
    }
    const ready = view.ready(slot.vizijId);
    if (ready) markDrawn(slot.vizijId);
    if (slot.element.getAttribute("data-vizij-ready") !== String(ready)) {
      slot.element.setAttribute("data-vizij-ready", String(ready));
    }
    if (slot.safeArea) {
      outline(slot.safeArea, view.safeArea(slot.vizijId), origin);
    }
  }
}

/** Hand a click on face `instance` to the slot showing it; a click on a face
 * no slot shows is dropped. */
export function deliverPick(
  slots: Iterable<Slot>,
  instance: string,
  element: string | null,
): void {
  for (const slot of slots) {
    if (slot.vizijId === instance) {
      slot.onPick?.({ vizijId: instance, elementId: element });
    }
  }
}

/** `rect` in the frame of `origin`'s top-left corner. */
function relative(rect: DOMRect, origin: DOMRect): Rect {
  return {
    x: rect.x - origin.x,
    y: rect.y - origin.y,
    width: rect.width,
    height: rect.height,
  };
}

function sameRect(a: Rect, b: Rect | null): boolean {
  return (
    b !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height
  );
}

/** Position the outline over `area` (canvas pixels), or hide it while the
 * face has no safe area. */
function outline(
  { outline, frame }: { outline: HTMLElement; frame: Element },
  area: Rect | null,
  canvas: DOMRect,
): void {
  if (!area) {
    outline.style.display = "none";
    return;
  }
  const at = relative(frame.getBoundingClientRect(), canvas);
  outline.style.display = "block";
  outline.style.left = `${area.x - at.x}px`;
  outline.style.top = `${area.y - at.y}px`;
  outline.style.width = `${area.width}px`;
  outline.style.height = `${area.height}px`;
}
