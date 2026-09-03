import { Suspense, useMemo } from "react";
import "./spike.css";
import {
  AnimationSheet,
  AnimationContext,
  createAnimationStore,
} from "@semio/animation";

/**
 * Phase 1 spike for adopting `@semio/animation` (see
 * `docs/plans/TIMELINE_ADOPTION_PLAN_2026-09-03.md`).
 *
 * Dev-only and deliberately unwired: it renders `AnimationSheet` against its
 * own store, seeded with a fixture clip, to answer three questions before any
 * integration is designed —
 *
 * 1. does the canvas-based sheet mount inside our Vite/React/Tailwind app,
 * 2. does its CSS coexist with ours,
 * 3. is `three` a single instance across `@vizij/render` and `@semio/animation`
 *    (two copies break every `instanceof` across the boundary, silently).
 *
 * Nothing here touches our animation store, our runtime, or the device. The
 * player and values bridges are Phases 3 and 4 precisely because doing them
 * incidentally is how two-stores-that-must-agree bugs get made.
 *
 * NO STYLESHEET IS IMPORTED, and that is a finding rather than an oversight.
 * The package's CSS entry points do not resolve for consumers:
 *
 * - `./styles.css` and `./theme.css` map to `./src/*.css`, and `src` is not
 *   shipped in the published tarball;
 * - `./dist/styles.css` is exported and does exist, but its contents are
 *   *unbuilt* Tailwind (`@import "tailwindcss"; @source "../src"`) pointing at
 *   that same missing source;
 * - `./dist/theme.css` exists on disk but is absent from the exports map, so
 *   Vite rejects it outright ("Missing ./dist/theme.css specifier").
 *
 * The sheet renders into a WebGL canvas, so how much of its appearance depends
 * on those tokens is exactly what this spike measures. Whatever the answer,
 * adoption needs an upstream packaging fix (or a local pnpm patch) — tracked
 * as a Phase 1 finding.
 */

/**
 * A fixture in *their* model: `animatableId`, and `stamp` in milliseconds.
 * Note this is the shape our runtime's stored clips already use — the
 * authoring IR (seconds, `channel`) is the odd one out.
 */
const FIXTURE_TRACKS = [
  {
    id: "spike-track-lid",
    name: "L_Lid translation Y",
    animatableId: "spike-animatable-lid",
    points: [
      { id: "k0", stamp: 0, value: 0 },
      { id: "k1", stamp: 500, value: 1 },
      { id: "k2", stamp: 1000, value: 0 },
    ],
    settings: { color: "#50C4B6" },
  },
];

export function SemioAnimationSheetSpike({
  height = 320,
}: {
  height?: number;
}) {
  // Their store, not ours, and created once. Sharing or syncing state is
  // explicitly out of scope for the spike.
  const store = useMemo(() => {
    try {
      return createAnimationStore();
    } catch (error) {
      console.error("[semio-spike] createAnimationStore failed", error);
      return null;
    }
  }, []);

  if (!store) {
    return (
      <div className="p-4 text-sm text-fg-secondary">
        `createAnimationStore()` threw — see the console. The spike cannot
        render.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="px-3 py-1 text-xs text-fg-secondary">
        Phase 1 spike · @semio/animation · not wired to the runtime
      </div>
      <div
        style={{ height, width: "100vw" }}
        className="relative overflow-hidden"
      >
        <Suspense fallback={<div className="p-4 text-sm">loading sheet…</div>}>
          <AnimationContext.Provider value={store as never}>
            <AnimationSheet height={height} />
          </AnimationContext.Provider>
        </Suspense>
      </div>
    </div>
  );
}

export const SEMIO_SPIKE_FIXTURE_TRACKS = FIXTURE_TRACKS;
