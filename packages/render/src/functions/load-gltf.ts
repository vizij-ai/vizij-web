import * as THREE from "three";
import { GLTFLoader, DRACOLoader, GLTF } from "three-stdlib";
import { AnimatableValue, RawVector2 } from "@vizij/utils";
import { World } from "../types/world";
import { traverseThree } from "./gltf-loading/traverse-three";

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
): Promise<[World, Record<string, AnimatableValue>]> {
  const modelLoader = new GLTFLoader();
  modelLoader.setDRACOLoader(new DRACOLoader());

  const modelData = await modelLoader.loadAsync(url);

  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  return traverseThree(
    modelData.scene,
    actualizedNamespaces,
    aggressiveImport,
    rootBounds,
  );
}

export async function loadGLTFFromBlob(
  blob: Blob,
  namespaces: string[],
  aggressiveImport = false,
  rootBounds?: {
    center: RawVector2;
    size: RawVector2;
  },
): Promise<[World, Record<string, AnimatableValue>]> {
  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await loadGLTF(
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
          resolve(
            traverseThree(
              gltf.scene,
              actualizedNamespaces,
              aggressiveImport,
              rootBounds,
            ),
          );
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
