import { startRuntime, type Runtime } from "@vizij/runtime";
import type { GraphSpec } from "@vizij/node-graph";
import type { GraphEvaluator } from "./sampleClipThroughGraph";

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

const SCALAR_KEYS = ["float", "f32", "f64"] as const;
const VECTOR_KEYS = ["vec3", "vec2", "vec4", "vector", "quat"] as const;
const COMPONENT_KEYS = ["x", "y", "z", "w"] as const;

/**
 * Decode a store value into an ordered component list.
 *
 * The rig graph writes *joined vectors* at one path per animatable, so a
 * scalar-only decode returns null for every vector feature — which is
 * indistinguishable from a graph that never ran, and is exactly why the first
 * version of this baked nothing.
 */
function componentsFrom(raw: unknown): number[] | null {
  if (typeof raw === "number") {
    return [raw];
  }
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (Array.isArray(raw)) {
    const values = raw.filter(
      (entry): entry is number => typeof entry === "number",
    );
    return values.length > 0 ? values : null;
  }
  const record = raw as Record<string, unknown>;

  for (const key of SCALAR_KEYS) {
    const value = record[key];
    if (typeof value === "number") {
      return [value];
    }
  }
  for (const key of VECTOR_KEYS) {
    const nested = record[key];
    if (nested !== undefined) {
      const decoded = componentsFrom(nested);
      if (decoded) {
        return decoded;
      }
    }
  }
  // Component-keyed object, e.g. { x, y, z }.
  const byComponent = COMPONENT_KEYS.map((key) => record[key]).filter(
    (value): value is number => typeof value === "number",
  );
  if (byComponent.length > 0) {
    return byComponent;
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

/**
 * How many zero-dt ticks a spec needs before a staged input is visible at
 * `outputPath`.
 *
 * Measured rather than assumed: the hop count depends on how many sources the
 * value crosses, which is a property of the composed graph, not something a
 * caller should hardcode. Returns `null` when the output never responds,
 * which means the path is not driven by that input at all.
 */
export async function measurePropagationTicks(options: {
  spec: GraphSpec;
  inputPath: string;
  outputPath: string;
  maxTicks?: number;
}): Promise<number | null> {
  const maxTicks = options.maxTicks ?? 8;
  const runtime: Runtime = await startRuntime(options.spec);
  try {
    // Settle first, so the measurement is of the *response* to a change and
    // not of the graph's initial convergence from zero.
    for (let tick = 0; tick < maxTicks; tick += 1) {
      runtime.step(0);
    }
    const before = numericFrom(
      runtime.readValues([options.outputPath])[options.outputPath],
    );

    runtime.setValue(options.inputPath, { float: 1 });
    for (let tick = 0; tick <= maxTicks; tick += 1) {
      runtime.step(0);
      const after = numericFrom(
        runtime.readValues([options.outputPath])[options.outputPath],
      );
      if (
        after !== null &&
        (before === null || Math.abs(after - before) > 1e-9)
      ) {
        return tick;
      }
    }
    return null;
  } finally {
    runtime.dispose();
  }
}
