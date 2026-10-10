import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  setSelection,
  setView,
  type Bounds,
  type Fit,
  type Pick,
  type ToneMapping,
} from "@vizij/runtime";
import { addSlot, canvasMounted } from "./canvas";
import type { Slot } from "./frame";

export interface VizijProps {
  /** The face this slot shows: the id it is loaded under (`loadVizij`). */
  vizijId: string;
  /** Size and place the slot; the face draws over its border box. */
  className?: string;
  style?: CSSProperties;
  /** The face's tone-mapping curve; `none` when absent. */
  toneMapping?: ToneMapping;
  /** How the framed bounds fit the slot; the canvas's `options.fit` when
   * absent. */
  fit?: Fit;
  /** Magnification after the fit; the canvas's `options.zoom` when absent. */
  zoom?: number | [number, number];
  /** The world rectangle the face's camera frames, in place of the GLB's
   * authored `rootBounds`. */
  bounds?: Bounds;
  /** Outline the framed bounds over the face. */
  showSafeArea?: boolean;
  /** The elements whose outlines glow, by the ids their RobotData declares.
   * Absent, the slot leaves the face's selection as it is. */
  selection?: string[];
  /** A press on the face: the element under the pointer, or `null` for a
   * press that hit none. Picks need pointer events on the canvas. */
  onPick?: (pick: Pick) => void;
}

/**
 * Where face `vizijId` draws on the page's canvas (`<VizijCanvas>`): a
 * `<div>` the canvas's frame loop places the face over, following it as the
 * page scrolls and lays out. It renders no canvas of its own. One slot shows
 * a face at a time.
 *
 * The element carries `data-vizij-id`, and `data-vizij-ready` — `"true"`
 * once the face's scene shows its device's pose (`ready(vizijId)`).
 */
export function Vizij({
  vizijId,
  className,
  style,
  toneMapping,
  fit,
  zoom,
  bounds,
  showSafeArea = false,
  selection,
  onPick,
}: VizijProps): ReactNode {
  const element = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const outline = useRef<HTMLDivElement>(null);
  const slot = useRef<Slot | null>(null);

  useEffect(() => {
    const registered: Slot = {
      vizijId,
      element: element.current!,
      safeArea: null,
      onPick: undefined,
      placed: null,
    };
    registered.element.setAttribute("data-vizij-ready", "false");
    slot.current = registered;
    const remove = addSlot(registered);
    return () => {
      slot.current = null;
      remove();
    };
  }, [vizijId]);

  useEffect(() => {
    if (slot.current) slot.current.onPick = onPick;
  }, [onPick, vizijId]);

  useEffect(() => {
    if (!slot.current) return;
    slot.current.safeArea =
      showSafeArea && outline.current && frame.current
        ? { outline: outline.current, frame: frame.current }
        : null;
  }, [showSafeArea, vizijId]);

  // The view's functions work once the canvas is mounted. Props compare by
  // value, so a page may pass fresh objects on every render.
  const view = JSON.stringify({ toneMapping, fit, zoom, bounds });
  useEffect(
    () => onceMounted(() => setView(vizijId, JSON.parse(view))),
    [vizijId, view],
  );

  const selected = selection === undefined ? null : JSON.stringify(selection);
  useEffect(
    () =>
      selected === null
        ? undefined
        : onceMounted(() => setSelection(vizijId, JSON.parse(selected))),
    [vizijId, selected],
  );

  return (
    <div
      ref={element}
      className={className}
      style={style}
      data-vizij-id={vizijId}
    >
      {showSafeArea && (
        <div
          ref={frame}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          <div
            ref={outline}
            style={{
              position: "absolute",
              display: "none",
              boxSizing: "border-box",
              border: "2px solid red",
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Run `apply` once the page's canvas is mounted, unless the returned
 * cleanup ran first. */
function onceMounted(apply: () => void): () => void {
  let current = true;
  canvasMounted().then(
    () => {
      if (current) apply();
    },
    () => undefined,
  );
  return () => {
    current = false;
  };
}
