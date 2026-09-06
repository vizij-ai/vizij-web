// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectInputPathMap,
  composeGraphSpecs,
  resolveAnimationBridgeOutputPaths,
} from "@vizij/runtime-react";
import {
  collectBakeGraphSources,
  outputPathsOfSpec,
} from "../bakeGraphSources";

/**
 * Pins the path conventions of a REAL exported bundle.
 *
 * The first version of graph sampling baked nothing, and every unit test
 * passed, because the fixtures were built from the same wrong assumptions as
 * the code:
 *
 * 1. that the rig graph writes `propsrig/...` paths (it writes animatable
 *    uuids),
 * 2. that a clip's channel is a graph input path (the graph declares its own,
 *    in an underscored form),
 * 3. that outputs are scalar per component (vector features are joined).
 *
 * A synthetic fixture cannot catch that class of error. This reads the shipped
 * asset instead, so a convention change shows up as a failure here.
 */

const ASSET = resolve(
  __dirname,
  "../../../public/assets/Quori_Current_Extended.glb",
);

const GLB_JSON_CHUNK = 0x4e4f534a;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The bundle rides on a node's extensions, not the document root. */
function readBundle(): {
  graphs?: Array<{ kind?: string; spec?: unknown; id?: string }>;
  animations?: Array<{ id?: string; clip?: unknown }>;
} {
  const buffer = readFileSync(ASSET);
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === GLB_JSON_CHUNK) {
      json = JSON.parse(
        buffer.subarray(offset + 8, offset + 8 + length).toString("utf8"),
      );
      break;
    }
    offset += 8 + length;
  }
  expect(json, "no JSON chunk in the asset").not.toBeNull();
  for (const value of Object.values(json!)) {
    if (!Array.isArray(value)) {
      continue;
    }
    for (const entry of value) {
      const extensions = (entry as { extensions?: Record<string, unknown> })
        ?.extensions;
      if (!extensions) {
        continue;
      }
      for (const [name, payload] of Object.entries(extensions)) {
        if (name.toUpperCase().includes("VIZIJ")) {
          return payload as ReturnType<typeof readBundle>;
        }
      }
    }
  }
  throw new Error("no VIZIJ bundle found in the asset");
}

describe("real bundle path conventions", () => {
  const bundle = readBundle();

  it("has the rig and pose graphs baking needs", () => {
    const sources = collectBakeGraphSources(bundle);
    const kinds = sources.map((source) => source.sourceId.split(":")[0]);
    expect(kinds).toContain("rig");
    expect(kinds).toContain("pose-driver");
  });

  it("rig outputs are animatable uuids, NOT propsrig channel paths", () => {
    // This is defect 1. If this ever legitimately changes, the bake's
    // channel index has to change with it.
    const rig = (bundle.graphs ?? []).find((graph) => graph.kind === "rig");
    const paths = outputPathsOfSpec(rig?.spec);

    expect(paths.length).toBeGreaterThan(50);
    expect(paths.every((path) => UUID.test(path))).toBe(true);
    expect(paths.some((path) => path.includes("propsrig"))).toBe(false);
  });

  it("resolves clip channels through the same bridge playback uses", () => {
    // This is defect 2. Staging a clip's channel raw writes to a path nothing
    // reads — the same failure that stopped playback.
    const sources = collectBakeGraphSources(bundle);
    const inputMap: Record<string, string> = Object.assign(
      {},
      ...sources.map((source) => collectInputPathMap(source.spec as never)),
    );
    const declaredInputPaths = new Set(Object.values(inputMap));

    // A propsrig channel must resolve: this is the path family the bake
    // depends on, and the one the graph declares in underscored form.
    const propsRigKey = Object.keys(inputMap).find(
      (key) =>
        key.startsWith("propsrig_") && inputMap[key]?.includes("/propsrig/"),
    )!;
    const resolved = resolveAnimationBridgeOutputPaths(
      propsRigKey,
      undefined,
      inputMap,
    );
    expect(
      resolved.some((path) => declaredInputPaths.has(path)),
      `"${propsRigKey}" did not resolve to any declared graph input`,
    ).toBe(true);

    // Pose weights resolve only when the pose exists in this graph. This
    // asset's clip references a different pose set than its pose-driver
    // declares, which is a genuine content mismatch — the point is that it is
    // *detectable*, not that it resolves.
    const poseInputs = Object.values(inputMap).filter((path) =>
      /\/poses\/.+\.weight$/.test(path),
    );
    expect(
      poseInputs.length,
      "asset has no pose weight inputs",
    ).toBeGreaterThan(0);
    const existingPoseChannel = poseInputs[0]!.replace(/^rig\/[^/]+\//, "");
    expect(
      resolveAnimationBridgeOutputPaths(
        existingPoseChannel,
        undefined,
        inputMap,
      ).some((path) => declaredInputPaths.has(path)),
      `an existing pose channel "${existingPoseChannel}" must resolve`,
    ).toBe(true);

    expect(
      resolveAnimationBridgeOutputPaths(
        "poses/pose_that_does_not_exist.weight",
        undefined,
        inputMap,
      ).some((path) => declaredInputPaths.has(path)),
      "a nonexistent pose must NOT resolve to a declared input",
    ).toBe(false);
  });

  it("keys the input map by the underscored id a clip track carries", () => {
    // The bridge between the two naming worlds: a clip says
    // `poses/pose_x.weight` with targetInputId `poses_pose_x.weight`, and the
    // graph's input node is `input_poses_pose_x.weight` at a face-prefixed
    // slash path.
    const rig = (bundle.graphs ?? []).find((graph) => graph.kind === "rig");
    const inputMap = collectInputPathMap(rig?.spec as never);

    const propsRigKey = Object.keys(inputMap).find(
      (key) =>
        key.startsWith("propsrig_") && inputMap[key]?.includes("/propsrig/"),
    );
    expect(propsRigKey, "no underscored propsrig input key").toBeDefined();
    expect(inputMap[propsRigKey!]).toMatch(/^rig\/[^/]+\/propsrig\//);
  });

  it("composition leaves store paths alone but renames nodes", () => {
    // Why the input map must be built per source: composition prefixes node
    // ids, which defeats collectInputPathMap's `input_` strip.
    const sources = collectBakeGraphSources(bundle);
    const composed = composeGraphSpecs(sources as never);
    const composedNodes = (composed as { nodes: Array<{ id: string }> }).nodes;

    expect(composedNodes.some((node) => node.id.includes("::"))).toBe(true);
    const composedMap = collectInputPathMap(composed as never);
    expect(
      Object.keys(composedMap).some((key) => key.startsWith("propsrig_")),
      "composed spec unexpectedly yields bare input keys",
    ).toBe(false);

    // Store paths themselves survive composition unchanged.
    const rig = sources.find((source) => source.sourceId.startsWith("rig:"));
    for (const path of outputPathsOfSpec(rig?.spec)) {
      expect(outputPathsOfSpec(composed)).toContain(path);
    }
  });
});
