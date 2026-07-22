import type { StoredAnimation } from "./animationRuntime";

/**
 * Inline StoredAnimation samples for the demo.
 *
 * The standalone `@vizij/animation-wasm` engine shipped fixture clips; the
 * device path loads plain StoredAnimation JSON, so the demo carries a couple of
 * its own. Each track's `animatableId` is the store key its sampled value lands
 * on and the demo reads back.
 */
export const SAMPLES: Record<string, StoredAnimation> = {
  "simple-scalar-ramp": {
    id: "simple-scalar-ramp",
    name: "Simple scalar ramp",
    duration: 1000,
    tracks: [
      {
        id: "ramp",
        name: "ramp",
        animatableId: "node/x",
        points: [
          { id: "k0", stamp: 0, value: 0 },
          { id: "k1", stamp: 1, value: 1 },
        ],
      },
    ],
  },
  "bounce-scalar": {
    id: "bounce-scalar",
    name: "Bounce scalar",
    duration: 2000,
    tracks: [
      {
        id: "bounce",
        name: "bounce",
        animatableId: "node/y",
        points: [
          { id: "b0", stamp: 0, value: 0 },
          { id: "b1", stamp: 0.25, value: 1 },
          { id: "b2", stamp: 0.5, value: 0 },
          { id: "b3", stamp: 0.75, value: 0.5 },
          { id: "b4", stamp: 1, value: 0 },
        ],
      },
    ],
  },
  "two-track": {
    id: "two-track",
    name: "Two tracks",
    duration: 1500,
    tracks: [
      {
        id: "x",
        name: "x",
        animatableId: "node/x",
        points: [
          { id: "x0", stamp: 0, value: -1 },
          { id: "x1", stamp: 1, value: 1 },
        ],
      },
      {
        id: "y",
        name: "y",
        animatableId: "node/y",
        points: [
          { id: "y0", stamp: 0, value: 1 },
          { id: "y1", stamp: 0.5, value: -1 },
          { id: "y2", stamp: 1, value: 1 },
        ],
      },
    ],
  },
};

/** Sample ids in a stable, sorted order. */
export function listSamples(): string[] {
  return Object.keys(SAMPLES).sort((a, b) => a.localeCompare(b));
}

/** Load a sample clip by id (deep-cloned so the editor can mutate it freely). */
export function loadSample(id: string): StoredAnimation {
  const clip = SAMPLES[id];
  if (!clip) {
    throw new Error(`Unknown sample "${id}"`);
  }
  return structuredClone(clip);
}
