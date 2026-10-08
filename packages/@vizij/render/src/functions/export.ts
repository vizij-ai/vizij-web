import { GLTFExporter } from "three-stdlib";
import type { AnimationClip } from "three";
import * as THREE from "three";
import type { VizijBundleExtension } from "../types";
import { applyVizijBundle } from "./vizij-bundle";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export type ExportSceneOptions = {
  /** Written into the GLB as the `VIZIJ_bundle` extension of the root node. */
  bundle?: VizijBundleExtension | null;
  /** Baked clips, written as glTF animations. */
  animations?: AnimationClip[];
};

function normalizeExportError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("Failed to export scene.");
}

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_PADDING_BYTE = 0x20;

type GltfNodeLike = {
  name?: unknown;
  mesh?: unknown;
  camera?: unknown;
  skin?: unknown;
  children?: unknown;
  translation?: unknown;
  rotation?: unknown;
  scale?: unknown;
  extensions?: unknown;
};

type GltfSceneLike = {
  name?: unknown;
  nodes?: unknown;
};

type GltfJsonLike = {
  scene?: unknown;
  scenes?: unknown;
  nodes?: unknown;
};

function isNearlyEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}

function isIdentityTransformNode(node: GltfNodeLike): boolean {
  const translation = node.translation;
  if (
    Array.isArray(translation) &&
    (translation.length !== 3 ||
      !isNearlyEqual(Number(translation[0]), 0) ||
      !isNearlyEqual(Number(translation[1]), 0) ||
      !isNearlyEqual(Number(translation[2]), 0))
  ) {
    return false;
  }

  const rotation = node.rotation;
  if (
    Array.isArray(rotation) &&
    (rotation.length !== 4 ||
      !isNearlyEqual(Number(rotation[0]), 0) ||
      !isNearlyEqual(Number(rotation[1]), 0) ||
      !isNearlyEqual(Number(rotation[2]), 0) ||
      !isNearlyEqual(Number(rotation[3]), 1))
  ) {
    return false;
  }

  const scale = node.scale;
  if (
    Array.isArray(scale) &&
    (scale.length !== 3 ||
      !isNearlyEqual(Number(scale[0]), 1) ||
      !isNearlyEqual(Number(scale[1]), 1) ||
      !isNearlyEqual(Number(scale[2]), 1))
  ) {
    return false;
  }

  return true;
}

function isPassThroughWrapperNode(
  node: GltfNodeLike | null | undefined,
): node is {
  name?: string;
  children: number[];
} {
  if (!node || typeof node !== "object") {
    return false;
  }
  if (!Array.isArray(node.children) || node.children.length === 0) {
    return false;
  }
  const hasOnlyNumericChildren = node.children.every((index) =>
    Number.isInteger(index),
  );
  if (!hasOnlyNumericChildren) {
    return false;
  }
  if (
    node.mesh !== undefined ||
    node.camera !== undefined ||
    node.skin !== undefined
  ) {
    return false;
  }
  // Preserve wrapper nodes that carry metadata extensions. Unwrapping these
  // can orphan the canonical Vizij root node from `scene.nodes`.
  if (
    node.extensions &&
    typeof node.extensions === "object" &&
    Object.keys(node.extensions as Record<string, unknown>).length > 0
  ) {
    return false;
  }
  return isIdentityTransformNode(node);
}

function normalizeExportedSceneJson(
  json: GltfJsonLike,
  fallbackSceneName?: string,
): boolean {
  if (!json || typeof json !== "object") {
    return false;
  }
  if (!Array.isArray(json.scenes) || !Array.isArray(json.nodes)) {
    return false;
  }

  const sceneIndexRaw = json.scene;
  const sceneIndex =
    typeof sceneIndexRaw === "number" && Number.isInteger(sceneIndexRaw)
      ? sceneIndexRaw
      : 0;
  const sceneDef = json.scenes[sceneIndex] as GltfSceneLike | undefined;
  if (!sceneDef || typeof sceneDef !== "object") {
    return false;
  }

  let changed = false;
  let wrapperNodeName: string | undefined;

  if (Array.isArray(sceneDef.nodes) && sceneDef.nodes.length === 1) {
    const wrapperIndex = sceneDef.nodes[0];
    if (Number.isInteger(wrapperIndex)) {
      const wrapperNode = json.nodes[wrapperIndex] as GltfNodeLike | undefined;
      if (isPassThroughWrapperNode(wrapperNode)) {
        sceneDef.nodes = [...wrapperNode.children];
        wrapperNodeName =
          typeof wrapperNode.name === "string" ? wrapperNode.name : undefined;
        changed = true;
      }
    }
  }

  const currentSceneName =
    typeof sceneDef.name === "string" ? sceneDef.name.trim() : "";
  if (currentSceneName === "AuxScene") {
    const nextSceneName = (
      wrapperNodeName?.trim() ||
      fallbackSceneName?.trim() ||
      "Scene"
    ).trim();
    if (nextSceneName.length > 0 && nextSceneName !== currentSceneName) {
      sceneDef.name = nextSceneName;
      changed = true;
    }
  }

  return changed;
}

/**
 * Rewrite a GLB's JSON chunk in place.
 *
 * `mutate` returns whether it changed anything; when it did not, the original
 * buffer is handed back untouched rather than re-encoded. Any malformed input
 * — wrong magic, missing JSON chunk, unparseable payload — returns the buffer
 * as-is, since a patch is never worth corrupting an export over.
 *
 * Exists so a caller can amend an already-exported GLB instead of exporting
 * twice: `GLTFExporter` is the expensive part, and running it again to change
 * a few bytes of metadata froze the UI thread on real assets.
 */
export function patchGlbJson(
  buffer: ArrayBuffer,
  mutate: (json: Record<string, unknown>) => boolean,
): ArrayBuffer {
  if (buffer.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    return buffer;
  }

  const originalBytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  if (magic !== GLB_MAGIC || version !== GLB_VERSION) {
    return buffer;
  }

  const jsonChunkLength = view.getUint32(GLB_HEADER_BYTES, true);
  const jsonChunkType = view.getUint32(GLB_HEADER_BYTES + 4, true);
  if (jsonChunkType !== GLB_JSON_CHUNK_TYPE) {
    return buffer;
  }

  const jsonChunkStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES;
  const jsonChunkEnd = jsonChunkStart + jsonChunkLength;
  if (jsonChunkEnd > originalBytes.length) {
    return buffer;
  }

  let jsonPayload: Record<string, unknown>;
  try {
    const jsonText = new TextDecoder().decode(
      originalBytes.slice(jsonChunkStart, jsonChunkEnd),
    );
    jsonPayload = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return buffer;
  }

  if (!mutate(jsonPayload)) {
    return buffer;
  }

  const encodedJson = new TextEncoder().encode(JSON.stringify(jsonPayload));
  const paddedJsonLength = (encodedJson.length + 3) & ~3;
  const paddedJson = new Uint8Array(paddedJsonLength);
  paddedJson.fill(GLB_JSON_PADDING_BYTE);
  paddedJson.set(encodedJson);

  const remainingChunks = originalBytes.slice(jsonChunkEnd);
  const totalLength =
    GLB_HEADER_BYTES +
    GLB_CHUNK_HEADER_BYTES +
    paddedJsonLength +
    remainingChunks.length;
  const sanitized = new ArrayBuffer(totalLength);
  const sanitizedBytes = new Uint8Array(sanitized);
  const sanitizedView = new DataView(sanitized);

  sanitizedView.setUint32(0, GLB_MAGIC, true);
  sanitizedView.setUint32(4, GLB_VERSION, true);
  sanitizedView.setUint32(8, totalLength, true);
  sanitizedView.setUint32(GLB_HEADER_BYTES, paddedJsonLength, true);
  sanitizedView.setUint32(GLB_HEADER_BYTES + 4, GLB_JSON_CHUNK_TYPE, true);
  sanitizedBytes.set(paddedJson, jsonChunkStart);
  sanitizedBytes.set(remainingChunks, jsonChunkStart + paddedJsonLength);

  return sanitized;
}

function sanitizeExportedGlb(
  buffer: ArrayBuffer,
  fallbackSceneName?: string,
): ArrayBuffer {
  return patchGlbJson(buffer, (json) =>
    normalizeExportedSceneJson(json as GltfJsonLike, fallbackSceneName),
  );
}

/**
 * Merge `metadata` into the `VIZIJ_bundle` extension already written into
 * `glb`, wherever it landed — the exporter attaches it to a node, but a
 * root-level extension is read back too, so both are handled.
 */
export function patchVizijBundleMetadata(
  glb: ArrayBuffer,
  metadata: Record<string, unknown>,
): ArrayBuffer {
  return patchGlbJson(glb, (json) => {
    const carriers: Array<Record<string, unknown>> = [];
    const rootExtensions = json.extensions;
    if (rootExtensions && typeof rootExtensions === "object") {
      carriers.push(rootExtensions as Record<string, unknown>);
    }
    const nodes = Array.isArray(json.nodes) ? json.nodes : [];
    for (const node of nodes) {
      const extensions = (node as { extensions?: unknown } | null)?.extensions;
      if (extensions && typeof extensions === "object") {
        carriers.push(extensions as Record<string, unknown>);
      }
    }

    let patched = false;
    for (const extensions of carriers) {
      const bundle = extensions.VIZIJ_bundle;
      if (!bundle || typeof bundle !== "object") {
        continue;
      }
      const record = bundle as Record<string, unknown>;
      const existing =
        record.metadata && typeof record.metadata === "object"
          ? (record.metadata as Record<string, unknown>)
          : {};
      record.metadata = { ...existing, ...metadata };
      patched = true;
    }
    return patched;
  });
}

/**
 * Encode `root` and its descendants as a GLB.
 *
 * Every node is written with its local translation, rotation and scale, every
 * mesh with its morph weights, and each object's `userData` as glTF
 * extensions and extras, which is where `RobotData` travels. A root that is
 * not a `Scene` is cloned into one, so the caller's graph is left as it was.
 *
 * Only textures need a DOM; a scene without images encodes in Node.
 */
export async function exportScene(
  root: THREE.Object3D,
  options: ExportSceneOptions = {},
): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  exporter.register(() => ({
    writeMesh(mesh, meshDef) {
      const meshName =
        mesh.name?.trim() || mesh.geometry?.name?.trim() || undefined;
      if (meshName) {
        meshDef.name = meshName;
      }
    },
  }));

  const exportRoot = root instanceof THREE.Scene ? root : root.clone(true);
  const exportTarget =
    exportRoot instanceof THREE.Scene
      ? exportRoot
      : (() => {
          const scene = new THREE.Scene();
          scene.name = root.name?.trim() || "Scene";
          scene.add(exportRoot);
          return scene;
        })();

  const detachBundle = options.bundle
    ? applyVizijBundle(exportRoot, options.bundle)
    : () => {};

  const animations = (options.animations ?? []).filter(Boolean);

  let gltf: unknown;
  try {
    gltf = await exporter.parseAsync(exportTarget, {
      trs: true,
      onlyVisible: false,
      binary: true,
      includeCustomExtensions: true,
      ...(animations.length > 0 ? { animations } : {}),
    });
  } catch (error) {
    throw normalizeExportError(error);
  } finally {
    detachBundle();
  }
  if (!(gltf instanceof ArrayBuffer)) {
    throw new Error("Failed to export scene.");
  }
  return sanitizeExportedGlb(gltf, root.name?.trim() || undefined);
}
