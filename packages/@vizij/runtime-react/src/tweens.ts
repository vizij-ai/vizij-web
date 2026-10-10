import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type { Runtime, ValueJSON } from "@vizij/runtime";
import { useVizijRuntime } from "./hooks";

export type Easing =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | ((t: number) => number);

export interface AnimateValueOptions {
  /** Seconds; default 0.35. `0` writes the target at once. */
  duration?: number;
  /** Default `linear`. */
  easing?: Easing;
}

const DEFAULT_DURATION = 0.35;

const EASINGS: Record<
  Exclude<Easing, (t: number) => number>,
  (t: number) => number
> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

/** The numeric kinds a store value comes in, and whether each is an
 * integer. */
const NUMERIC: Record<string, boolean> = {
  f32: false,
  f64: false,
  float: false,
  i8: true,
  i16: true,
  i32: true,
  i64: true,
  u8: true,
  u16: true,
  u32: true,
  u64: true,
};

/** `value`'s number and the kind it is written in, when it is a number. */
function numberOf(
  value: ValueJSON | null | undefined,
): { kind: string; n: number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  for (const [kind, n] of Object.entries(value)) {
    if (kind in NUMERIC && typeof n === "number") return { kind, n };
  }
  return null;
}

interface Tween {
  /** The pending animation frame, `null` before the first. */
  frame: number | null;
  resolve: () => void;
}

/** The tweens of one face, one per path: a newer tween on a path replaces
 * the running one. */
export interface Tweens {
  start(
    runtime: Runtime,
    path: string,
    target: number,
    options: AnimateValueOptions | undefined,
  ): Promise<void>;
  cancel(path: string): void;
  cancelAll(): void;
}

/**
 * Where a tween of `path` starts: the key's value, or — for a key the store
 * declares but nothing has written yet — the value it rests at, as the
 * device lists it (`listKeys`' `__meta.default`). Its numeric kind is the
 * kind every write of the tween takes.
 */
async function startOf(
  runtime: Runtime,
  path: string,
): Promise<{ kind: string; n: number } | null> {
  const value = numberOf(runtime.readValues([path])[path]);
  if (value) return value;
  const listed = (await runtime.listKeys(path)).find(
    (key) => key.path === path,
  );
  return numberOf(listed?.__meta.default as ValueJSON | undefined);
}

export function createTweens(): Tweens {
  const running = new Map<string, Tween>();

  const cancel = (path: string) => {
    const tween = running.get(path);
    if (!tween) return;
    if (tween.frame !== null) cancelAnimationFrame(tween.frame);
    running.delete(path);
    tween.resolve();
  };

  return {
    start(runtime, path, target, options) {
      cancel(path);
      const duration =
        Math.max(0, options?.duration ?? DEFAULT_DURATION) * 1000;
      const easing =
        typeof options?.easing === "function"
          ? options.easing
          : EASINGS[options?.easing ?? "linear"];
      return new Promise<void>((resolve, reject) => {
        const tween: Tween = { frame: null, resolve };
        running.set(path, tween);
        const live = () => running.get(path) === tween;
        startOf(runtime, path).then(
          (from) => {
            if (!live()) return;
            if (!from) {
              running.delete(path);
              reject(new Error(`${path} holds no number to animate from`));
              return;
            }
            const integer = NUMERIC[from.kind];
            const write = (n: number) =>
              runtime.setValue(path, {
                [from.kind]: integer ? Math.round(n) : n,
              } as ValueJSON);
            let started: number | null = null;
            const step = (now: number) => {
              if (!live()) return;
              started ??= now;
              const progress =
                duration === 0 ? 1 : Math.min((now - started) / duration, 1);
              write(from.n + (target - from.n) * easing(progress));
              if (progress < 1) {
                tween.frame = requestAnimationFrame(step);
              } else {
                running.delete(path);
                resolve();
              }
            };
            if (duration === 0) {
              step(0);
            } else {
              tween.frame = requestAnimationFrame(step);
            }
          },
          (error: unknown) => {
            if (!live()) return;
            running.delete(path);
            reject(error);
          },
        );
      });
    },
    cancel,
    cancelAll() {
      for (const path of [...running.keys()]) cancel(path);
    },
  };
}

export const TweenContext = createContext<Tweens | null>(null);

/**
 * Animate a key of the face's store towards a number: a JS tween, one write
 * per animation frame through `runtime.setValue`, eased, in the numeric kind
 * the key holds (an `f32` key stays `f32`). A key nothing has written yet
 * starts from the value the device lists it resting at. A newer tween on the
 * same path replaces the running one; the component's tweens are cancelled
 * when it unmounts, and a face's when it reloads. The promise resolves when
 * the tween ends or is cancelled, and rejects when the key holds no number
 * and rests at none.
 */
export function useAnimateValue(): {
  animateValue(
    path: string,
    target: number,
    options?: AnimateValueOptions,
  ): Promise<void>;
  cancelAnimation(path: string): void;
} {
  const tweens = useContext(TweenContext);
  if (!tweens) {
    throw new Error("useAnimateValue must be used within VizijRuntimeProvider");
  }
  const { runtime } = useVizijRuntime();
  const latest = useRef(runtime);
  latest.current = runtime;
  const mine = useRef(new Set<string>());

  useEffect(
    () => () => {
      for (const path of mine.current) tweens.cancel(path);
    },
    [tweens],
  );

  return useMemo(
    () => ({
      animateValue(path, target, options) {
        const live = latest.current;
        if (!live) {
          return Promise.reject(new Error("The face has not loaded yet"));
        }
        mine.current.add(path);
        return tweens.start(live, path, target, options);
      },
      cancelAnimation(path) {
        tweens.cancel(path);
      },
    }),
    [tweens],
  );
}
