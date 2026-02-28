import { GLTFExporter } from "three-stdlib";
import type { AnimationClip, Group } from "three";
import * as THREE from "three";
import type { VizijBundleExtension } from "../types";
import { applyVizijBundle } from "./vizij-bundle";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export type ExportSceneOptions = {
  fileName?: string;
  bundle?: VizijBundleExtension | null;
  animations?: AnimationClip[];
  binary?: boolean;
  onError?: (error: Error) => void;
  onComplete?: () => void;
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

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revocation so browsers finish resolving the download URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
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

function sanitizeExportedGlb(
  buffer: ArrayBuffer,
  fallbackSceneName?: string,
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

  let jsonPayload: GltfJsonLike;
  try {
    const jsonText = new TextDecoder().decode(
      originalBytes.slice(jsonChunkStart, jsonChunkEnd),
    );
    jsonPayload = JSON.parse(jsonText) as GltfJsonLike;
  } catch {
    return buffer;
  }

  const changed = normalizeExportedSceneJson(jsonPayload, fallbackSceneName);
  if (!changed) {
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

export function exportScene(
  data: Group,
  fileNameOrOptions: string | ExportSceneOptions = "scene.glb",
): void {
  const options: ExportSceneOptions =
    typeof fileNameOrOptions === "string"
      ? { fileName: fileNameOrOptions }
      : (fileNameOrOptions ?? {});

  const fileName = options.fileName ?? "scene.glb";
  const animationClips = Array.isArray(options.animations)
    ? options.animations.filter(Boolean)
    : [];
  const shouldAttachBundle = Boolean(options.bundle);

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

  const sourceRoot = data as unknown as THREE.Object3D;
  const exportRoot =
    sourceRoot instanceof THREE.Scene ? sourceRoot : sourceRoot.clone(true);
  const exportTarget =
    exportRoot instanceof THREE.Scene
      ? exportRoot
      : (() => {
          const scene = new THREE.Scene();
          scene.name = data.name?.trim() || "Scene";
          scene.add(exportRoot);
          return scene;
        })();

  const detachBundle =
    shouldAttachBundle && options.bundle
      ? applyVizijBundle(exportRoot, options.bundle)
      : () => {};

  const binary = options.binary ?? true;
  const exporterOptions: Record<string, unknown> = {
    trs: true,
    onlyVisible: false,
    binary,
    includeCustomExtensions: true,
  };

  if (animationClips.length > 0) {
    exporterOptions.animations = animationClips;
  }

  try {
    exporter.parse(
      exportTarget,
      (gltf) => {
        detachBundle();
        if (!(gltf instanceof ArrayBuffer)) {
          const error = new Error("Failed to export scene.");
          options.onError?.(error);
          return;
        }
        const sanitizedGltf = sanitizeExportedGlb(
          gltf,
          data.name?.trim() || undefined,
        );
        const trimmed = fileName.trim();
        const safeFileName = trimmed.length > 0 ? trimmed : "scene.glb";
        const downloadName = safeFileName.toLowerCase().endsWith(".glb")
          ? safeFileName
          : `${safeFileName}.glb`;
        triggerBlobDownload(
          new Blob([sanitizedGltf], {
            type: "application/octet-stream",
          }),
          downloadName,
        );
        options.onComplete?.();
      },
      (error) => {
        detachBundle();
        options.onError?.(normalizeExportError(error));
      },
      exporterOptions,
    );
  } catch (error) {
    detachBundle();
    const normalizedError = normalizeExportError(error);
    options.onError?.(normalizedError);
    throw normalizedError;
  }
}
