// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bakeChannelKeys,
  composeBakeGraph,
  hasBakeGraph,
  inputPathsOfSpec,
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
 * 2. that a clip's channel is a graph input path (the face resolves it
 *    through its rig, to an input path or by an input's id),
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
  animations?: Array<{
    id?: string;
    clip?: { tracks?: Array<{ channel?: string }> };
  }>;
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
    const kinds = (bundle.graphs ?? []).map((graph) => graph.kind);
    expect(kinds).toContain("rig");
    expect(kinds).toContain("pose-driver");
    expect(hasBakeGraph(bundle)).toBe(true);
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

  it("drives a key the composed graph reads for every channel of the shipped clips", async () => {
    // This is defect 2. Staging a clip's channel raw writes to a key nothing
    // reads — the same failure that stops playback.
    const declared = new Set(inputPathsOfSpec(await composeBakeGraph(bundle)));
    const channels = (bundle.animations ?? []).flatMap((animation) =>
      (animation.clip?.tracks ?? []).flatMap((track) =>
        track.channel ? [track.channel] : [],
      ),
    );
    expect(channels.length, "the asset ships no clip channels").toBeGreaterThan(
      0,
    );

    const keys = await bakeChannelKeys(bundle, channels);
    for (const channel of channels) {
      expect(
        declared.has(keys.get(channel) ?? ""),
        `"${channel}" drives ${keys.get(channel)}, which the graph does not read`,
      ).toBe(true);
    }

    const missing = await bakeChannelKeys(bundle, [
      "poses/pose_that_does_not_exist.weight",
    ]);
    expect(
      declared.has(missing.get("poses/pose_that_does_not_exist.weight")!),
      "a nonexistent pose must NOT drive a key the graph reads",
    ).toBe(false);
  });

  it("drives an input named by its id at the input's path", async () => {
    // A track may name its input by the id the rig gives the input node,
    // without `input_` and its `direct_` alias.
    const rig = (bundle.graphs ?? []).find((graph) => graph.kind === "rig");
    const direct = (
      (
        rig?.spec as {
          nodes?: Array<{
            id?: string;
            type?: string;
            params?: { path?: string };
          }>;
        }
      )?.nodes ?? []
    ).find(
      (node) =>
        node.type === "input" &&
        node.id?.startsWith("input_direct_") &&
        node.params?.path?.includes("/gaze/"),
    );
    expect(direct, "the rig has no direct gaze input").toBeDefined();
    const id = direct!.id!.slice("input_direct_".length);

    const keys = await bakeChannelKeys(bundle, [id]);
    expect(keys.get(id)).toBe(direct!.params!.path);
  });

  it("composition leaves store paths alone but renames nodes", async () => {
    const composed = await composeBakeGraph(bundle);
    const composedNodes = (
      composed as unknown as { nodes: Array<{ id: string }> }
    ).nodes;

    expect(composedNodes.some((node) => node.id.includes("::"))).toBe(true);
    // Store paths themselves survive composition unchanged.
    const rig = (bundle.graphs ?? []).find((graph) => graph.kind === "rig");
    const composedOutputs = new Set(outputPathsOfSpec(composed));
    for (const path of outputPathsOfSpec(rig?.spec)) {
      expect(composedOutputs.has(path), path).toBe(true);
    }
  });
});
