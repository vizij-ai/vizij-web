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

function numericFrom(raw: unknown): number | null {
  if (typeof raw === "number") {
    return raw;
  }
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  for (const key of ["float", "f32", "f64"]) {
    const value = record[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
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
      const values = new Map<string, number | null>();
      for (const path of paths) {
        values.set(path, numericFrom(raw[path]));
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
