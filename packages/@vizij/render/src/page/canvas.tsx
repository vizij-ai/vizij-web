import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  drainPicks,
  mount,
  placeVizij,
  ready,
  safeArea,
  type MountOptions,
} from "@vizij/runtime";
import { frame, type Slot } from "./frame";

/** The page's canvas: created once, mounted once, kept for the page's
 * lifetime — `@vizij/runtime` runs one App per page. */
let canvas: HTMLCanvasElement | null = null;
let mounting: Promise<HTMLCanvasElement> | null = null;
/** Whether `mount` has completed: the view's functions work from then on. */
let live = false;
let settle: {
  resolve: (canvas: HTMLCanvasElement) => void;
  reject: (error: unknown) => void;
};
const mounted = new Promise<HTMLCanvasElement>((resolve, reject) => {
  settle = { resolve, reject };
});

/** The mounted `<Vizij>` slots. */
const slots = new Set<Slot>();
/** The `<VizijCanvas>` elements showing the canvas; the frame loop runs while
 * there is one. */
let hosts = 0;
let loop: number | null = null;

/**
 * Resolves with the page's canvas once `<VizijCanvas>` has mounted it, which
 * `loadVizij` requires; rejects if mounting failed.
 */
export function canvasMounted(): Promise<HTMLCanvasElement> {
  return mounted;
}

const DEFAULT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
};

export interface VizijCanvasProps {
  /** `mount`'s options: every face's defaults. Read on the page's first
   * mount; the App keeps them for the page's lifetime. */
  options?: MountOptions;
  /** Replace the default style — fixed over the page, pointer events off —
   * of the element the canvas fills. A page that takes picks gives it
   * pointer events. */
  className?: string;
  style?: CSSProperties;
}

/**
 * The page's one canvas, which every `<Vizij>` slot draws on.
 *
 * Its first mount runs `@vizij/runtime`'s `mount`; a second `<VizijCanvas>`,
 * a remount or React StrictMode's second effect shows the same canvas and
 * App. While it is shown, one animation frame loop places each slot's face
 * over the slot and hands each pick to the slot it names: `placeVizij` and
 * `drainPicks` are page-wide, so they have one caller.
 *
 * By default the canvas is fixed over the page with pointer events off, so
 * faces draw wherever their slots lie and the page's own UI keeps the
 * pointer. Content that must draw over the faces stacks above the canvas.
 */
export function VizijCanvas({
  options,
  className,
  style,
}: VizijCanvasProps): ReactNode {
  const host = useRef<HTMLDivElement>(null);
  const firstOptions = useRef(options);

  useEffect(() => {
    const element = host.current!;
    const shown = pageCanvas();
    element.appendChild(shown);
    if (!mounting) {
      mounting = mount(shown, firstOptions.current).then(() => {
        live = true;
        return shown;
      });
      mounting.then(settle.resolve, settle.reject);
    }
    hosts += 1;
    if (hosts === 1) {
      void mounting.then(start, () => undefined);
    }
    return () => {
      hosts -= 1;
      if (hosts === 0) {
        stop();
      }
      if (shown.parentElement === element) {
        element.removeChild(shown);
      }
    };
  }, []);

  return (
    <div
      ref={host}
      className={className}
      style={style ?? (className ? undefined : DEFAULT_STYLE)}
    />
  );
}

function pageCanvas(): HTMLCanvasElement {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
  }
  return canvas;
}

const view = { placeVizij, ready, safeArea, drainPicks };

function start(): void {
  if (loop !== null || hosts === 0) return;
  const tick = () => {
    frame(slots, canvas!, view);
    loop = requestAnimationFrame(tick);
  };
  loop = requestAnimationFrame(tick);
}

function stop(): void {
  if (loop !== null) {
    cancelAnimationFrame(loop);
    loop = null;
  }
}

/** Register a mounted slot with the frame loop. The returned function
 * unregisters it and places its face on an empty rectangle, where it draws
 * nothing. */
export function addSlot(slot: Slot): () => void {
  slots.add(slot);
  return () => {
    slots.delete(slot);
    if (live) {
      placeVizij(slot.vizijId, { x: 0, y: 0, width: 0, height: 0 });
    }
  };
}
