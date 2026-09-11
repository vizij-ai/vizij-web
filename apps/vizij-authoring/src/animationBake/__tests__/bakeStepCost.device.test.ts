// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph";
import { startRuntime } from "@vizij/runtime";
import { composeGraphSpecs } from "@vizij/runtime-react";
import { collectBakeGraphSources } from "../bakeGraphSources";

/**
 * What a bake step actually costs, on the real rig graph.
 *
 * A single GLB export of the extended Quori face blocks the main thread for
 * ~29 seconds, all of it inside `bakeAuthoredClips`. Profiling put every bit
 * of that in `evaluator.step()` — reads and input staging are free — so the
 * question is whether the per-step cost is inherent to a 2116-node graph or
 * whether the bake's evaluator is doing something the live runtime does not.
 *
 * This measures the runtime directly, with the graph read out of the shipped
 * asset, so the number is not confounded by the app, the export path, or a
 * browser. It reports rather than asserts a threshold: the point is to have
 * the figure recorded next to the code that spends it.
 */

const ASSET = "public/assets/Quori_Current_Extended.glb";

/** The bundle's graphs, read straight out of the GLB. */
function bundleGraphs(): Array<{ id: string; kind?: string; spec?: unknown }> {
  const bytes = readFileSync(ASSET);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as {
    nodes: Array<{
      extensions?: {
        VIZIJ_bundle?: {
          graphs?: Array<{ id: string; kind?: string; spec?: unknown }>;
        };
      };
    }>;
  };
  for (const node of gltf.nodes) {
    const graphs = node.extensions?.VIZIJ_bundle?.graphs;
    if (graphs) {
      return graphs;
    }
  }
  throw new Error(`no VIZIJ bundle graphs found in ${ASSET}`);
}

/** The rig graph spec, read straight out of the GLB's VIZIJ bundle. */
function rigGraphSpec(): { spec: GraphSpec; nodeCount: number } {
  const bytes = readFileSync(ASSET);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + jsonLength).toString("utf8"),
  ) as {
    nodes: Array<{
      extensions?: {
        VIZIJ_bundle?: {
          graphs?: Array<{ id: string; spec?: unknown }>;
        };
      };
    }>;
  };

  for (const node of gltf.nodes) {
    const graphs = node.extensions?.VIZIJ_bundle?.graphs;
    if (!graphs) {
      continue;
    }
    const rig = graphs.find((graph) => graph.id === "quori_latest");
    if (rig?.spec) {
      const spec = rig.spec as GraphSpec & { nodes?: unknown[] };
      return { spec, nodeCount: spec.nodes?.length ?? 0 };
    }
  }
  throw new Error(`no "quori_latest" graph found in ${ASSET}`);
}

describe("the cost of one bake step on the real rig graph", () => {
  it("reports milliseconds per step, and what a full bake implies", async () => {
    const { spec, nodeCount } = rigGraphSpec();
    expect(nodeCount).toBeGreaterThan(2000);

    const runtime = await startRuntime(spec);
    try {
      // Warm up: the first steps carry graph setup and JIT.
      for (let i = 0; i < 5; i += 1) {
        runtime.step(16);
      }

      const steps = 40;
      const started = performance.now();
      for (let i = 0; i < steps; i += 1) {
        runtime.step(1000 / 30);
      }
      const perStep = (performance.now() - started) / steps;

      // What the export actually does: two clips, 30fps, and
      // `propagationTicks: 1` means every frame steps twice.
      const frames = Math.round(5 * 30) + 1 + (Math.round(10 * 30) + 1);
      const stepsPerFrame = 2;
      const projected = (perStep * frames * stepsPerFrame) / 1000;

      console.log(
        `[bake-cost] nodes=${nodeCount} perStep=${perStep.toFixed(2)}ms ` +
          `frames=${frames} stepsPerFrame=${stepsPerFrame} ` +
          `projectedBake=${projected.toFixed(1)}s`,
      );

      expect(perStep).toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });

  it("reports the cost of the spec the bake actually composes", async () => {
    // The bake composes only `rig` and `pose-driver` sources — programs are
    // excluded — so this is the graph it really steps, not the rig alone.
    const sources = collectBakeGraphSources({ graphs: bundleGraphs() });
    const spec = composeGraphSpecs(sources) as GraphSpec & {
      nodes?: unknown[];
    };
    const nodeCount = spec.nodes?.length ?? 0;
    expect(sources.length).toBeGreaterThan(0);

    const runtime = await startRuntime(spec);
    let perStep = 0;
    try {
      for (let i = 0; i < 5; i += 1) {
        runtime.step(16);
      }
      const steps = 40;
      const started = performance.now();
      for (let i = 0; i < steps; i += 1) {
        runtime.step(1000 / 30);
      }
      perStep = (performance.now() - started) / steps;
    } finally {
      runtime.dispose();
    }

    console.log(
      `[bake-cost] composed=${sources.map((source) => source.sourceId).join(",")} ` +
        `nodes=${nodeCount} perStep=${perStep.toFixed(2)}ms`,
    );
    expect(perStep).toBeGreaterThan(0);
  });

  it("reports each source's cost on its own, to place the superlinearity", async () => {
    // Composing 15% more nodes costs 9x. Either the pose graph is simply
    // expensive on its own, or composition is superlinear — and the fix is
    // different in each case.
    const sources = collectBakeGraphSources({ graphs: bundleGraphs() });
    for (const source of sources) {
      const spec = source.spec as GraphSpec & { nodes?: unknown[] };
      const runtime = await startRuntime(spec);
      let perStep = 0;
      try {
        for (let i = 0; i < 5; i += 1) {
          runtime.step(16);
        }
        const steps = 40;
        const started = performance.now();
        for (let i = 0; i < steps; i += 1) {
          runtime.step(1000 / 30);
        }
        perStep = (performance.now() - started) / steps;
      } finally {
        runtime.dispose();
      }
      console.log(
        `[bake-cost] alone=${source.sourceId} ` +
          `nodes=${spec.nodes?.length ?? 0} perStep=${perStep.toFixed(2)}ms`,
      );
    }
    expect(sources.length).toBeGreaterThan(1);
  });
});
