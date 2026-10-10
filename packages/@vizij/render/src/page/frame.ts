import type { Pick, Rect } from "@vizij/runtime";

/** A mounted `<Vizij>`: where face `vizijId` draws on the page. */
export interface Slot {
  vizijId: string;
  /** The slot's element: its border box is the face's rectangle. */
  element: Element;
  /** The face's safe-area outline and the element it is positioned in, when
   * the slot shows it. */
  safeArea: { outline: HTMLElement; frame: Element } | null;
  onPick: ((pick: Pick) => void) | undefined;
  /** The rectangle last given to `placeVizij`. */
  placed: Rect | null;
}

/** The `@vizij/runtime` functions a frame calls. */
export interface FrameView {
  placeVizij(vizijId: string, rect: Rect): void;
  ready(vizijId: string): boolean;
  safeArea(vizijId: string): Rect | null;
  drainPicks(): Pick[];
}

/**
 * One animation frame of the page's canvas: each slot's face placed over the
 * slot's rectangle when it moved, its `data-vizij-ready` and safe-area
 * outline brought up to date, then the page's picks handed to the slots they
 * name.
 *
 * Reading every rectangle each frame follows scrolling, resizes and layout
 * shifts alike.
 */
export function frame(
  slots: Iterable<Slot>,
  canvas: Element,
  view: FrameView,
): void {
  const origin = canvas.getBoundingClientRect();
  const byId = new Map<string, Slot>();
  for (const slot of slots) {
    byId.set(slot.vizijId, slot);
    const rect = relative(slot.element.getBoundingClientRect(), origin);
    if (!sameRect(rect, slot.placed)) {
      view.placeVizij(slot.vizijId, rect);
      slot.placed = rect;
    }
    const ready = String(view.ready(slot.vizijId));
    if (slot.element.getAttribute("data-vizij-ready") !== ready) {
      slot.element.setAttribute("data-vizij-ready", ready);
    }
    if (slot.safeArea) {
      outline(slot.safeArea, view.safeArea(slot.vizijId), origin);
    }
  }
  for (const pick of view.drainPicks()) {
    byId.get(pick.vizijId)?.onPick?.(pick);
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
