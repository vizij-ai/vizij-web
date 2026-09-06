import { Euler, Quaternion } from "three";
import { deriveMorphFeatureKeys } from "@vizij/render";
import { buildPropsRigInputPath } from "../../rig/autoInputs";
import type { AnimationClipIR } from "../../types/animationClipIr";
import type { GltfJsonLike } from "../gltfAnimationChannels";
import { makeGlb } from "./makeGlb";

/**
 * Test-only encoder: rebuilds native glTF animation channels from an imported
 * clip, so the importer can be round-tripped through real GLB bytes.
 *
 * This is deliberately NOT the production baker. Authored clips drive semantic
 * rig inputs and need graph sampling to become node transforms (plan phase 3).
 * An *imported* clip is already propsrig-level — one scalar per node transform
 * component or morph weight — so re-encoding it is a pure regrouping, which is
 * exactly the symmetry worth testing: vector recombination, morph name vs
 * index, and euler -> quaternion.
 */

type ChannelPath = "translation" | "rotation" | "scale" | "weights";

interface PendingChannel {
  nodeName: string;
  path: ChannelPath;
  times: number[];
  /** Per-component (or per-morph-target) value columns, in target order. */
  columns: number[][];
}

function segmentOf(name: string): string {
  return buildPropsRigInputPath({
    elementName: name,
    featureKey: "probe",
  }).split("/")[2]!;
}

/** Maps normalized propsrig segments back to the source's real names. */
function buildNameIndex(json: GltfJsonLike) {
  const nodeBySegment = new Map<string, { name: string; nodeIndex: number }>();
  const morphIndexByKey = new Map<string, Map<string, number>>();
  const morphNamesBySegment = new Map<string, string[]>();

  (json.nodes ?? []).forEach((node, nodeIndex) => {
    const name = typeof node?.name === "string" ? node.name : "";
    if (!name) {
      return;
    }
    const segment = segmentOf(name);
    if (!nodeBySegment.has(segment)) {
      nodeBySegment.set(segment, { name, nodeIndex });
    }
    if (typeof node?.mesh !== "number") {
      return;
    }
    const targetNames = json.meshes?.[node.mesh]?.extras?.targetNames;
    if (!Array.isArray(targetNames)) {
      return;
    }
    const names = targetNames.map((entry) =>
      typeof entry === "string" ? entry : "",
    );
    morphNamesBySegment.set(segment, names);
    const keys = deriveMorphFeatureKeys(names);
    const byKey = new Map<string, number>();
    keys.forEach((key, index) => byKey.set(key, index));
    morphIndexByKey.set(segment, byKey);
  });

  return { nodeBySegment, morphIndexByKey, morphNamesBySegment };
}

const VECTOR_COMPONENT_INDEX: Record<string, number> = { x: 0, y: 1, z: 2 };

/**
 * Re-encodes `clip` into a GLB carrying native glTF animations, reusing the
 * source's node and morph-target names so the result re-imports onto the same
 * channels.
 */
export function reencodeClipToGlb(
  sourceJson: GltfJsonLike,
  clip: AnimationClipIR,
): ArrayBuffer {
  const { nodeBySegment, morphIndexByKey, morphNamesBySegment } =
    buildNameIndex(sourceJson);
  const channels = new Map<string, PendingChannel>();

  for (const track of clip.tracks) {
    const parts = track.channel.replace(/^\/+/, "").split("/");
    // propsrig/<element>/<feature>/<component>
    if (parts.length !== 4 || parts[0] !== "propsrig") {
      continue;
    }
    const [, segment, feature, component] = parts as [
      string,
      string,
      string,
      string,
    ];
    const node = nodeBySegment.get(segment);
    if (!node) {
      continue;
    }

    const isTransform =
      feature === "translation" ||
      feature === "rotation" ||
      feature === "scale";
    const path: ChannelPath = isTransform
      ? (feature as ChannelPath)
      : "weights";
    const width = isTransform
      ? 3
      : (morphNamesBySegment.get(segment)?.length ?? 1);
    const columnIndex = isTransform
      ? VECTOR_COMPONENT_INDEX[component]
      : morphIndexByKey.get(segment)?.get(feature);
    if (columnIndex === undefined) {
      continue;
    }

    const key = `${segment}|${path}`;
    let pending = channels.get(key);
    if (!pending) {
      pending = {
        nodeName: node.name,
        path,
        times: track.keyframes.map((keyframe) => keyframe.time),
        columns: Array.from({ length: width }, () =>
          new Array<number>(track.keyframes.length).fill(0),
        ),
      };
      channels.set(key, pending);
    }
    // Components of one source channel shared a sampler, so their time axes
    // must match; a mismatch means the import split something it should not.
    if (pending.times.length !== track.keyframes.length) {
      throw new Error(
        `Channel ${key} has components with differing key counts (${pending.times.length} vs ${track.keyframes.length}).`,
      );
    }
    pending.columns[columnIndex] = track.keyframes.map(
      (keyframe) => keyframe.value,
    );
  }

  // Lay out accessors: one time accessor + one output accessor per channel.
  const floats: number[] = [];
  const accessors: Array<Record<string, unknown>> = [];
  const bufferViews: Array<Record<string, unknown>> = [];
  const animChannels: Array<Record<string, unknown>> = [];
  const samplers: Array<Record<string, unknown>> = [];

  const pushAccessor = (
    values: number[],
    type: "SCALAR" | "VEC3" | "VEC4",
    count: number,
    withBounds = false,
  ): number => {
    const byteOffset = floats.length * 4;
    floats.push(...values);
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: values.length * 4,
    });
    const accessor: Record<string, unknown> = {
      bufferView: bufferViews.length - 1,
      componentType: 5126,
      count,
      type,
    };
    if (withBounds) {
      accessor.min = [Math.min(...values)];
      accessor.max = [Math.max(...values)];
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const nodesUsed = new Map<string, number>();
  const nodeDefs: Array<Record<string, unknown>> = [];
  const meshDefs: Array<Record<string, unknown>> = [];

  const ensureNode = (name: string): number => {
    const existing = nodesUsed.get(name);
    if (existing !== undefined) {
      return existing;
    }
    const segment = segmentOf(name);
    const morphNames = morphNamesBySegment.get(segment);
    const def: Record<string, unknown> = { name };
    if (morphNames) {
      meshDefs.push({ extras: { targetNames: morphNames } });
      def.mesh = meshDefs.length - 1;
    }
    nodeDefs.push(def);
    const index = nodeDefs.length - 1;
    nodesUsed.set(name, index);
    return index;
  };

  for (const pending of channels.values()) {
    const nodeIndex = ensureNode(pending.nodeName);
    const timeAccessor = pushAccessor(
      pending.times,
      "SCALAR",
      pending.times.length,
      true,
    );

    let outputValues: number[];
    let outputType: "SCALAR" | "VEC3" | "VEC4";
    let outputCount: number;

    if (pending.path === "rotation") {
      // Euler (ZYX radians) back to the quaternion glTF stores.
      outputValues = [];
      for (let k = 0; k < pending.times.length; k += 1) {
        const q = new Quaternion().setFromEuler(
          new Euler(
            pending.columns[0]![k]!,
            pending.columns[1]![k]!,
            pending.columns[2]![k]!,
            "ZYX",
          ),
        );
        outputValues.push(q.x, q.y, q.z, q.w);
      }
      outputType = "VEC4";
      outputCount = pending.times.length;
    } else if (pending.path === "weights") {
      outputValues = [];
      for (let k = 0; k < pending.times.length; k += 1) {
        for (const column of pending.columns) {
          outputValues.push(column[k] ?? 0);
        }
      }
      outputType = "SCALAR";
      outputCount = pending.times.length * pending.columns.length;
    } else {
      outputValues = [];
      for (let k = 0; k < pending.times.length; k += 1) {
        outputValues.push(
          pending.columns[0]![k]!,
          pending.columns[1]![k]!,
          pending.columns[2]![k]!,
        );
      }
      outputType = "VEC3";
      outputCount = pending.times.length;
    }

    const outputAccessor = pushAccessor(outputValues, outputType, outputCount);
    samplers.push({
      input: timeAccessor,
      output: outputAccessor,
      interpolation: "LINEAR",
    });
    animChannels.push({
      sampler: samplers.length - 1,
      target: { node: nodeIndex, path: pending.path },
    });
  }

  const array = new Float32Array(floats);
  const binary = array.buffer.slice(0, array.byteLength) as ArrayBuffer;

  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "vizij-test-reencode" },
    scene: 0,
    scenes: [{ nodes: nodeDefs.map((_, index) => index) }],
    nodes: nodeDefs,
    ...(meshDefs.length > 0 ? { meshes: meshDefs } : {}),
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews,
    accessors,
    animations: [
      {
        name: `${clip.name ?? clip.id}Action`,
        samplers,
        channels: animChannels,
      },
    ],
  };

  return makeGlb(json, binary);
}
