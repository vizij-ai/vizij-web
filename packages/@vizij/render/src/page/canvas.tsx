import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  drainPicks,
  init,
  mount,
  onInitProgress,
  placeVizij,
  ready,
  safeArea,
  type MountOptions,
} from "@vizij/runtime";
import { frame, type Slot } from "./frame";
import { setRuntimeStage } from "./progress";

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

/** How long the canvas waits for a frame to paint the loading views' stage
 * before a call that holds the main thread. */
const PAINT_WAIT_MS = 100;

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
      mounting = mountOnce(shown, firstOptions.current);
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

/**
 * Mount the page's App on `shown`, feeding the slots' loading views the
 * runtime's stages: `init()`'s, then `mount`, which builds the App once
 * `init()` has resolved.
 *
 * `mount` and the faces' `loadVizij` hold the main thread while they run, so
 * a stage set just before one of them would never be painted: the browser
 * gets a frame to paint "Starting the view" before `mount`, and the faces'
 * own stages before `canvasMounted()` resolves and their loads start.
 */
async function mountOnce(
  shown: HTMLCanvasElement,
  options: MountOptions | undefined,
): Promise<HTMLCanvasElement> {
  const unfollow = onInitProgress((progress) => {
    setRuntimeStage(progress.stage === "ready" ? { stage: "mount" } : progress);
  });
  try {
    await init();
    await afterPaint();
    await mount(shown, options);
  } catch (error) {
    setRuntimeStage({ stage: "failed", error: asError(error) });
    throw error;
  } finally {
    unfollow();
  }
  live = true;
  setRuntimeStage(null);
  await afterPaint();
  return shown;
}

/** Resolves once the browser has had a frame to paint what was rendered
 * before the call, or after {@link PAINT_WAIT_MS} where no frame comes, as
 * on a hidden page. */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, PAINT_WAIT_MS);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 0),
    );
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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
