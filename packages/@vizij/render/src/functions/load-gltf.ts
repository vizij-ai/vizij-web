import * as THREE from "three";
import type { AnimationClip, Group } from "three";
import type { GLTF } from "three-stdlib";
import { GLTFLoader, DRACOLoader } from "three-stdlib";
import type { AnimatableValue, RawVector2 } from "@vizij/utils";
import type { World } from "../types/world";
import type { VizijBundleExtension, VizijAnimationClipData } from "../types";
import { traverseThree } from "./gltf-loading/traverse-three";
import { extractVizijBundle } from "./vizij-bundle";
import { extractVizijAnimations } from "./gltf-loading/extract-animations";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;

export class EmptyModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyModelError";
  }
}

type ParserJsonFallbackSource = {
  url?: string;
  blob?: Blob;
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

  if (fallback.blob) {
    try {
      const blobBuffer =
        typeof fallback.blob.arrayBuffer === "function"
          ? await fallback.blob.arrayBuffer()
          : await new Response(fallback.blob).arrayBuffer();
      const fromBlob = parseGlbJsonChunk(blobBuffer);
      if (fromBlob && typeof fromBlob === "object") {
        return fromBlob;
      }
    } catch {
      // Best-effort fallback only.
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
  namespaces: string[],
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<[World, Record<string, AnimatableValue>, VizijAnimationClipData[]]> {
  const modelLoader = new GLTFLoader();
  modelLoader.setDRACOLoader(new DRACOLoader());

  const modelData = await modelLoader.loadAsync(url);
  const parserJson = await resolveParserJson((modelData as any)?.parser?.json, {
    url,
  });

  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  const asset = parseScene(
    modelData.scene,
    actualizedNamespaces,
    aggressiveImport,
    rootBounds,
    parserJson,
    modelData.animations,
  );

  return [asset.world, asset.animatables, asset.animations];
}

export async function loadGLTFFromBlob(
  blob: Blob,
  namespaces: string[],
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<[World, Record<string, AnimatableValue>, VizijAnimationClipData[]]> {
  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const asset = await loadGLTFWithBundle(
        objectUrl,
        actualizedNamespaces,
        aggressiveImport,
        rootBounds,
        { blob },
      );
      return [asset.world, asset.animatables, asset.animations];
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const arrayBuffer =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Response(blob).arrayBuffer();

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());

    loader.parse(
      arrayBuffer,
      "",
      async (gltf: GLTF) => {
        try {
          const parserJson = await resolveParserJson(
            (gltf as any)?.parser?.json,
            { arrayBuffer },
          );
          const asset = parseScene(
            gltf.scene,
            actualizedNamespaces,
            aggressiveImport,
            rootBounds,
            parserJson,
            gltf.animations,
          );
          resolve([asset.world, asset.animatables, asset.animations]);
        } catch (error) {
          if (error instanceof Error) {
            reject(error);
          } else {
            reject(new Error(String(error)));
          }
        }
      },
      (error: ErrorEvent) => {
        reject(new Error(`Error loading GLTF: ${error.message}`));
      },
    );
  });
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
  namespaces: string[],
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
    namespaces,
    aggressiveImport,
    rootBounds,
  );
  const bundle = extractVizijBundle(scene, parserJson);
  const animations = extractVizijAnimations(parserJson, clips);
  // if (bundle) {
  //   console.info("[vizij-render] Bundle extracted during GLTF load.", {
  //     graphs: bundle.graphs?.length ?? 0,
  //     poseCount: bundle.poses?.config?.poses?.length ?? 0,
  //     animations: bundle.animations?.length ?? 0,
  //     version: bundle.version,
  //   });
  // } else {
  //   console.info("[vizij-render] No bundle extracted during GLTF load.");
  // }
  return { world, animatables, bundle, animations, scene };
}

export async function loadGLTFWithBundle(
  url: string,
  namespaces: string[],
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
  parserJsonFallback?: ParserJsonFallbackSource,
): Promise<LoadedVizijAsset> {
  const modelLoader = new GLTFLoader();
  modelLoader.setDRACOLoader(new DRACOLoader());

  const modelData = await modelLoader.loadAsync(url);
  const parserJson = await resolveParserJson((modelData as any)?.parser?.json, {
    url,
    ...parserJsonFallback,
  });

  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  return parseScene(
    modelData.scene,
    actualizedNamespaces,
    aggressiveImport,
    rootBounds,
    parserJson,
    modelData.animations,
  );
}

export async function loadGLTFFromBlobWithBundle(
  blob: Blob,
  namespaces: string[],
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<LoadedVizijAsset> {
  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadGLTFWithBundle(
        objectUrl,
        actualizedNamespaces,
        aggressiveImport,
        rootBounds,
        { blob },
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  const arrayBuffer =
    typeof blob.arrayBuffer === "function"
      ? await blob.arrayBuffer()
      : await new Response(blob).arrayBuffer();

  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());

    loader.parse(
      arrayBuffer,
      "",
      async (gltf: GLTF) => {
        try {
          const parserJson = await resolveParserJson(
            (gltf as any)?.parser?.json,
            { arrayBuffer },
          );
          const asset = parseScene(
            gltf.scene,
            actualizedNamespaces,
            aggressiveImport,
            rootBounds,
            parserJson,
            gltf.animations,
          );
          resolve(asset);
        } catch (error) {
          if (error instanceof Error) {
            reject(error);
          } else {
            reject(new Error(String(error)));
          }
        }
      },
      (error: ErrorEvent) => {
        reject(new Error(`Error loading GLTF: ${error.message}`));
      },
    );
  });
}
