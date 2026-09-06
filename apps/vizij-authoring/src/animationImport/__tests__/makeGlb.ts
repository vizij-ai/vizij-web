import { deriveMorphFeatureKeys } from "@vizij/render";
import { buildPropsRigInputPath } from "../../rig/autoInputs";

/**
 * Builds a minimal in-memory GLB for tests.
 *
 * The Blender corpus is entirely `LINEAR`, so cases like `CUBICSPLINE` and
 * non-float accessors have no real asset to exercise them. Synthesising a GLB
 * keeps those paths covered without committing binary fixtures.
 */

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_BIN_CHUNK_TYPE = 0x004e4942;

function padTo4(length: number): number {
  return (4 - (length % 4)) % 4;
}

export function makeGlb(
  json: Record<string, unknown>,
  binary: ArrayBuffer,
): ArrayBuffer {
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = padTo4(jsonBytes.byteLength);
  const jsonLength = jsonBytes.byteLength + jsonPad;

  const binPad = padTo4(binary.byteLength);
  const binLength = binary.byteLength + binPad;

  const total = 12 + 8 + jsonLength + 8 + binLength;
  const out = new ArrayBuffer(total);
  const bytes = new Uint8Array(out);
  const view = new DataView(out);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);

  view.setUint32(12, jsonLength, true);
  view.setUint32(16, GLB_JSON_CHUNK_TYPE, true);
  bytes.set(jsonBytes, 20);
  // JSON chunk padding is spaces per the spec.
  for (let i = 0; i < jsonPad; i += 1) {
    bytes[20 + jsonBytes.byteLength + i] = 0x20;
  }

  const binHeader = 20 + jsonLength;
  view.setUint32(binHeader, binLength, true);
  view.setUint32(binHeader + 4, GLB_BIN_CHUNK_TYPE, true);
  bytes.set(new Uint8Array(binary), binHeader + 8);

  return out;
}

export function floatsToArrayBuffer(values: number[]): ArrayBuffer {
  const array = new Float32Array(values);
  return array.buffer.slice(0, array.byteLength) as ArrayBuffer;
}

/**
 * A single-node, single-animation GLB targeting one channel path.
 */
export function makeSingleChannelGlb(options: {
  nodeName: string;
  path: "translation" | "rotation" | "scale" | "weights";
  times: number[];
  /** Flat output values; length must be times.length * stride. */
  values: number[];
  interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
  /** Accessor type for the output; defaults from `path`. */
  outputType?: "SCALAR" | "VEC3" | "VEC4";
  morphTargetNames?: string[];
  /** glTF animation name; matters for round-trip provenance. */
  animationName?: string;
}): ArrayBuffer {
  const {
    nodeName,
    path,
    times,
    values,
    interpolation = "LINEAR",
    morphTargetNames,
    animationName = "TestAction",
  } = options;

  const outputType =
    options.outputType ??
    (path === "rotation" ? "VEC4" : path === "weights" ? "SCALAR" : "VEC3");
  const componentCount =
    outputType === "SCALAR" ? 1 : outputType === "VEC3" ? 3 : 4;
  const outputCount = values.length / componentCount;

  const binary = floatsToArrayBuffer([...times, ...values]);
  const timesBytes = times.length * 4;

  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "vizij-test" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [
      morphTargetNames ? { name: nodeName, mesh: 0 } : { name: nodeName },
    ],
    ...(morphTargetNames
      ? { meshes: [{ extras: { targetNames: morphTargetNames } }] }
      : {}),
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: timesBytes },
      {
        buffer: 0,
        byteOffset: timesBytes,
        byteLength: binary.byteLength - timesBytes,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: times.length,
        type: "SCALAR",
        min: [Math.min(...times)],
        max: [Math.max(...times)],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: outputCount,
        type: outputType,
      },
    ],
    animations: [
      {
        name: animationName,
        samplers: [{ input: 0, output: 1, interpolation }],
        channels: [{ sampler: 0, target: { node: 0, path } }],
      },
    ],
  };

  return makeGlb(json, binary);
}

/**
 * Models the propsrig input paths a face generated from geometry would expose.
 *
 * When a GLB carries no `RobotData`, `traverseThree` falls through to
 * `importScene`, which builds renderables from the scene itself: meshes become
 * shapes (`importMesh`) and non-mesh parents become groups (`importGroup`).
 * Both get translation/rotation/scale; meshes additionally get one scalar per
 * morph target. This mirrors that so a *self-contained* import — animations
 * resolved against the same file's geometry — can be tested without a Three
 * scene.
 *
 * Modelling groups matters: rigs commonly animate an empty parent (Quori and
 * Hugo both animate `Face_Tran_Rot_C`, which has children and no mesh).
 */
export function modelGeometryDerivedInputPaths(json: {
  nodes?: ReadonlyArray<{
    name?: unknown;
    mesh?: unknown;
    children?: unknown;
  } | null>;
  meshes?: ReadonlyArray<{ extras?: { targetNames?: unknown } | null } | null>;
}): string[] {
  const paths: string[] = [];
  for (const node of json.nodes ?? []) {
    const name = typeof node?.name === "string" ? node.name : "";
    const hasMesh = typeof node?.mesh === "number";
    const isGroup = Array.isArray(node?.children) && node.children.length > 0;
    if (!name || (!hasMesh && !isGroup)) {
      continue;
    }
    const element = buildPropsRigInputPath({
      elementName: name,
      featureKey: "probe",
    }).split("/")[2]!;

    for (const feature of ["translation", "rotation", "scale"]) {
      for (const component of ["x", "y", "z"] as const) {
        paths.push(`/propsrig/${element}/${feature}/${component}`);
      }
    }

    const targetNames = hasMesh
      ? json.meshes?.[node.mesh as number]?.extras?.targetNames
      : null;
    if (Array.isArray(targetNames)) {
      const keys = deriveMorphFeatureKeys(
        targetNames.map((entry) => (typeof entry === "string" ? entry : "")),
      );
      for (const key of keys) {
        paths.push(`/propsrig/${element}/${key}/value`);
      }
    }
  }
  return paths;
}
