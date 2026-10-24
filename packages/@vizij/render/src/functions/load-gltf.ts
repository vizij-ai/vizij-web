import * as THREE from "three";
import type { AnimationClip, Group } from "three";
import type { GLTF } from "three-stdlib";
import { GLTFLoader, DRACOLoader } from "three-stdlib";
import type { AnimatableValue, RawVector2 } from "@vizij/utils";
import type { World } from "../types/world";
import type { VizijBundleExtension, VizijAnimationClipData } from "../types";
import { recordRenderCounter } from "../memoryInvestigation";
import { traverseThree } from "./gltf-loading/traverse-three";
import { extractVizijBundle } from "./vizij-bundle";
import { extractVizijAnimations } from "./gltf-loading/extract-animations";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

export { EmptyModelError } from "./empty-model-error";

type ParserJsonFallbackSource = {
  url?: string;
  arrayBuffer?: ArrayBuffer;
};

export function parseGlbJsonChunk(buffer: ArrayBuffer): unknown | undefined {
  if (buffer.byteLength < GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES) {
    return undefined;
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  if (magic !== GLB_MAGIC || version !== GLB_VERSION) {
    return undefined;
  }

  const chunkLength = view.getUint32(GLB_HEADER_BYTES, true);
  const chunkType = view.getUint32(GLB_HEADER_BYTES + 4, true);
  if (chunkType !== GLB_JSON_CHUNK_TYPE) {
    return undefined;
  }

  const chunkStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES;
  const chunkEnd = chunkStart + chunkLength;
  if (chunkEnd > buffer.byteLength) {
    return undefined;
  }

  try {
    const chunkBytes = new Uint8Array(buffer, chunkStart, chunkLength);
    const jsonText = new TextDecoder().decode(chunkBytes);
    return JSON.parse(jsonText);
  } catch {
    return undefined;
  }
}

async function resolveParserJson(
  parserJson: unknown,
  fallback: ParserJsonFallbackSource,
): Promise<unknown> {
  if (parserJson && typeof parserJson === "object") {
    return parserJson;
  }

  if (fallback.arrayBuffer) {
    const fromArrayBuffer = parseGlbJsonChunk(fallback.arrayBuffer);
    if (fromArrayBuffer && typeof fromArrayBuffer === "object") {
      return fromArrayBuffer;
    }
  }

  if (fallback.url && typeof fetch === "function") {
    try {
      const response = await fetch(fallback.url);
      if (response.ok) {
        const binary = await response.arrayBuffer();
        const fromUrl = parseGlbJsonChunk(binary);
        if (fromUrl && typeof fromUrl === "object") {
          return fromUrl;
        }
      }
    } catch {
      // Best-effort fallback only.
    }
  }

  return parserJson;
}

export async function loadGLTF(
  url: string,
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<[World, Record<string, AnimatableValue>, VizijAnimationClipData[]]> {
  const asset = await loadGLTFWithBundle(url, aggressiveImport, rootBounds);
  return [asset.world, asset.animatables, asset.animations];
}

export async function loadGLTFFromBlob(
  blob: Blob,
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<[World, Record<string, AnimatableValue>, VizijAnimationClipData[]]> {
  const asset = await loadGLTFFromBlobWithBundle(
    blob,
    aggressiveImport,
    rootBounds,
  );
  return [asset.world, asset.animatables, asset.animations];
}

export type LoadedVizijAsset = {
  world: World;
  animatables: Record<string, AnimatableValue>;
  bundle: VizijBundleExtension | null;
  animations: VizijAnimationClipData[];
  scene: Group;
};

function parseScene(
  scene: Group,
  aggressiveImport: boolean,
  rootBounds?:
    | {
        center: RawVector2;
        size: RawVector2;
      }
    | undefined,
  parserJson?: unknown,
  clips?: AnimationClip[] | undefined,
): LoadedVizijAsset {
  const [world, animatables] = traverseThree(
    scene,
    aggressiveImport,
    rootBounds,
  );
  const bundle = extractVizijBundle(scene, parserJson);
  const animations = extractVizijAnimations(parserJson, clips);
  return { world, animatables, bundle, animations, scene };
}

function createTrackedGLTFLoader() {
  recordRenderCounter("gltfLoadCount");
  recordRenderCounter("dracoLoaderCreationCount");
  const modelLoader = new GLTFLoader();
  modelLoader.setDRACOLoader(new DRACOLoader());
  return modelLoader;
}

export async function loadGLTFWithBundle(
  url: string,
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
  parserJsonFallback?: ParserJsonFallbackSource,
): Promise<LoadedVizijAsset> {
  recordRenderCounter("gltfUrlLoadCount");
  const modelLoader = createTrackedGLTFLoader();
  const modelData = await modelLoader.loadAsync(url);
  const parserJson = await resolveParserJson((modelData as any)?.parser?.json, {
    url,
    ...parserJsonFallback,
  });
  return parseScene(
    modelData.scene,
    aggressiveImport,
    rootBounds,
    parserJson,
    modelData.animations,
  );
}

/**
 * Load a GLB or self-contained glTF from `blob`.
 *
 * The bytes are read into memory and parsed there; nothing is fetched, so this
 * runs the same in a browser and in Node.
 */
export async function loadGLTFFromBlobWithBundle(
  blob: Blob,
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<LoadedVizijAsset> {
  recordRenderCounter("gltfBlobLoadCount");
  const arrayBuffer = await blob.arrayBuffer();
  const loader = createTrackedGLTFLoader();
  const gltf = await new Promise<GLTF>((resolve, reject) => {
    loader.parse(arrayBuffer, "", resolve, (error: ErrorEvent) => {
      reject(new Error(`Error loading GLTF: ${error.message}`));
    });
  });
  const parserJson = await resolveParserJson((gltf as any)?.parser?.json, {
    arrayBuffer,
  });
  return parseScene(
    gltf.scene,
    aggressiveImport,
    rootBounds,
    parserJson,
    gltf.animations,
  );
}
