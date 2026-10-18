import { startRuntime, type Runtime } from "@vizij/runtime";
import { valueAsNumber, valueAsVector } from "@vizij/value-json";
import type { GraphSpec } from "@vizij/node-graph";
import type { GraphEvaluator } from "./sampleClipThroughGraph";

const COMPONENT_KEYS = ["x", "y", "z", "w"] as const;

/**
 * A `GraphEvaluator` backed by a real device, for baking.
 *
 * Deliberately a *separate* device from the live session's:
 *
 * - Sampling stages inputs and steps time. Driving the live device would make
 *   the user's viewport jump around during export and clobber their current
 *   input values.
 * - Paths here are bare. The provider namespaces every graph node path at
 *   registration (`<namespace>/<path>`) and namespaces staged writes to
 *   match; a spec straight from `buildRigGraphSpec` is namespace-free, so a
 *   bake device built from it is self-consistent. Mixing the two conventions
 *   is what made animation playback write real values to keys nothing read.
 *
 * It is the same composition code either way, so the baked graph cannot drift
 * from the played one.
 */
export interface DeviceGraphEvaluator extends GraphEvaluator {
  dispose(): void;
}

/**
 * Decode a store value into an ordered component list.
 *
 * The rig graph writes *joined vectors* at one path per animatable, so a
 * scalar-only decode returns null for every vector feature — which is
 * indistinguishable from a graph that never ran, and is exactly why the first
 * version of this baked nothing.
 *
 * Delegates to `@vizij/value-json`, which owns the encoding. The hand-rolled
 * version this replaces dropped non-numeric entries *without preserving
 * position*, so `{ x: 1, z: 3 }` decoded to `[1, 3]` and the consumer — which
 * indexes positionally — wrote z's value into the y channel.
 */
export function componentsFrom(raw: unknown): number[] | null {
  if (typeof raw === "number") {
    return [raw];
  }
  if (raw === null || raw === undefined) {
    return null;
  }

  const asValueJson = raw as Parameters<typeof valueAsVector>[0];
  const vector = valueAsVector(asValueJson);
  if (vector && vector.length > 0) {
    return vector;
  }
  const scalar = valueAsNumber(asValueJson);
  if (scalar !== undefined) {
    return [scalar];
  }

  if (typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;

  // Component-keyed object, e.g. { x, y, z }. Not part of the ValueJSON
  // surface, so it stays here — but a missing component now reads as 0 rather
  // than silently shifting every later component down one slot.
  const present = COMPONENT_KEYS.filter(
    (key) => typeof record[key] === "number",
  );
  if (present.length > 0) {
    const highest = COMPONENT_KEYS.indexOf(present[present.length - 1]!);
    return COMPONENT_KEYS.slice(0, highest + 1).map((key) =>
      typeof record[key] === "number" ? (record[key] as number) : 0,
    );
  }
  // A single-field wrapper, e.g. { value: 0.5 }.
  const value = record.value;
  if (typeof value === "number") {
    return [value];
  }
  return null;
}

/** First component only, for the propagation probe. */
function numericFrom(raw: unknown): number | null {
  return componentsFrom(raw)?.[0] ?? null;
}

export async function createDeviceGraphEvaluator(options: {
  spec: GraphSpec;
  /**
   * Extra zero-dt ticks after each frame's step, to let a value cross from
   * one composed source to another.
   *
   * Sources communicate through store paths, so each hop costs a tick: a
   * pose graph feeding the rig graph is one hop, and recording without
   * allowing for it time-shifts the bake by a frame per hop. Zero-dt ticks
   * propagate without advancing time, so a node whose state depends on dt is
   * unaffected — which stepping extra *real* frames would not be.
   *
   * Defaults to 0; `measurePropagationTicks` finds the value a given spec
   * needs.
   */
  propagationTicks?: number;
}): Promise<DeviceGraphEvaluator> {
  const runtime: Runtime = await startRuntime(options.spec);
  const propagationTicks = Math.max(0, options.propagationTicks ?? 0);

  return {
    stageInput(path: string, value: number) {
      runtime.setValue(path, { float: value });
    },
    step(dtMs: number) {
      runtime.step(dtMs);
      for (let tick = 0; tick < propagationTicks; tick += 1) {
        runtime.step(0);
      }
    },
    readOutputs(paths: ReadonlyArray<string>) {
      const raw = runtime.readValues([...paths]);
      const values = new Map<string, ReadonlyArray<number> | null>();
      for (const path of paths) {
        values.set(path, componentsFrom(raw[path]));
      }
      return values;
    },
    get behaviorError() {
      return runtime.behaviorError;
    },
    dispose() {
      runtime.dispose();
    },
  };
}

/** The time each probe step carries: enough for a spring, a damper or a
 * slew to move measurably, as none moves at a step with no time in it. */
const PROBE_STEP_MS = 1;

/**
 * How many ticks a spec needs before a staged input is visible at
 * `outputPath`: the zero-dt ticks the bake adds after each frame.
 *
 * Measured rather than assumed: the hop count depends on how many sources the
 * value crosses, which is a property of the composed graph, not something a
 * caller should hardcode. Two devices of the spec step side by side, each
 * step carrying a little time so a smoother on the way moves, one with the
 * input changed; the first step after which their outputs differ is the
 * count. Comparing against the twin, not against the output's earlier
 * value, keeps a smoother still settling from its own start from reading as
 * the response. Returns `null` when the output never responds, which means
 * the path is not driven by that input at all.
 */
export async function measurePropagationTicks(options: {
  spec: GraphSpec;
  inputPath: string;
  outputPath: string;
  maxTicks?: number;
}): Promise<number | null> {
  const maxTicks = options.maxTicks ?? 8;
  const [probe, twin] = await Promise.all([
    startRuntime(options.spec),
    startRuntime(options.spec),
  ]);
  const read = (runtime: Runtime) =>
    numericFrom(runtime.readValues([options.outputPath])[options.outputPath]);
  try {
    const current = numericFrom(
      probe.readValues([options.inputPath])[options.inputPath],
    );
    probe.setValue(options.inputPath, { float: (current ?? 0) + 1 });
    for (let tick = 0; tick <= maxTicks; tick += 1) {
      probe.step(PROBE_STEP_MS);
      twin.step(PROBE_STEP_MS);
      const changed = read(probe);
      const unchanged = read(twin);
      if (
        changed !== null &&
        (unchanged === null || Math.abs(changed - unchanged) > 1e-9)
      ) {
        return tick;
      }
    }
    return null;
  } finally {
    probe.dispose();
    twin.dispose();
  }
}
