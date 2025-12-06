import * as THREE from "three";
import { AnimationClip, Group } from "three";
import { GLTFLoader, DRACOLoader, GLTF } from "three-stdlib";
import { AnimatableValue, RawVector2 } from "@vizij/utils";
import { World } from "../types/world";
import type { VizijBundleExtension, VizijAnimationClipData } from "../types";
import { traverseThree } from "./gltf-loading/traverse-three";
import { extractVizijBundle } from "./vizij-bundle";
import { extractVizijAnimations } from "./gltf-loading/extract-animations";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export class EmptyModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyModelError";
  }
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

  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  const asset = parseScene(
    modelData.scene,
    actualizedNamespaces,
    aggressiveImport,
    rootBounds,
    (modelData as any)?.parser?.json,
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
      (gltf: GLTF) => {
        try {
          const asset = parseScene(
            gltf.scene,
            actualizedNamespaces,
            aggressiveImport,
            rootBounds,
            (gltf as any)?.parser?.json,
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
  return { world, animatables, bundle, animations };
}

export async function loadGLTFWithBundle(
  url: string,
  namespaces: string[],
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<LoadedVizijAsset> {
  const modelLoader = new GLTFLoader();
  modelLoader.setDRACOLoader(new DRACOLoader());

  const modelData = await modelLoader.loadAsync(url);

  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  return parseScene(
    modelData.scene,
    actualizedNamespaces,
    aggressiveImport,
    rootBounds,
    (modelData as any)?.parser?.json,
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
      (gltf: GLTF) => {
        try {
          const asset = parseScene(
            gltf.scene,
            actualizedNamespaces,
            aggressiveImport,
            rootBounds,
            (gltf as any)?.parser?.json,
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
