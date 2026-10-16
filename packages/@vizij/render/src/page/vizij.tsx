import { useEffect, useRef, useState } from "react";
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
import { DefaultLoading, describeLoading, type VizijLoading } from "./loading";
import { watchLoading, loadingStage, type LoadingStage } from "./progress";

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
  /** The image of the default loading view, in place of the face outline
   * `@vizij/render` ships; `null` for none. */
  loadingImage?: ReactNode;
  /** The slot's own loading view, in place of the default: called with the
   * stage, its label and its fraction while the face is not drawn. `null`
   * shows none. */
  loading?: ((loading: VizijLoading) => ReactNode) | null;
}

/**
 * Where face `vizijId` draws on the page's canvas (`<VizijCanvas>`): a
 * `<div>` the canvas's frame loop places the face over, following it as the
 * page scrolls and lays out. It renders no canvas of its own. One slot shows
 * a face at a time.
 *
 * The element carries `data-vizij-id`, and `data-vizij-ready` — `"true"`
 * once the face's scene shows its device's pose (`ready(vizijId)`).
 *
 * Until its face is first drawn, the slot shows a loading view over its
 * border box: the runtime's stages, then the face's (`setVizijProgress`).
 * The view is a DOM overlay in the slot: under a canvas laid over the page,
 * it shows wherever the canvas draws nothing.
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
  loadingImage,
  loading,
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

  const stage = useLoadingStage(vizijId);
  const loadingView =
    stage === null || loading === null ? null : loading ? (
      loading(describeLoading(stage))
    ) : (
      <DefaultLoading loading={describeLoading(stage)} image={loadingImage} />
    );

  return (
    <div
      ref={element}
      className={className}
      style={style}
      data-vizij-id={vizijId}
    >
      {(showSafeArea || loadingView !== null) && (
        <div
          ref={frame}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {loadingView !== null && (
            <div
              data-vizij-loading=""
              style={{ position: "absolute", inset: 0 }}
            >
              {loadingView}
            </div>
          )}
          {showSafeArea && (
            <div
              ref={outline}
              style={{
                position: "absolute",
                display: "none",
                boxSizing: "border-box",
                border: "2px solid red",
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** The stage face `vizijId`'s slot shows, `null` once the face is drawn. */
function useLoadingStage(vizijId: string): LoadingStage | null {
  const [stage, setStage] = useState(() => loadingStage(vizijId));
  useEffect(() => watchLoading(vizijId, setStage), [vizijId]);
  return stage;
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
