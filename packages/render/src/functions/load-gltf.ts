import * as THREE from "three";
import { GLTFLoader, DRACOLoader, GLTF } from "three-stdlib";
import { AnimatableValue } from "@semio/utils";
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
): Promise<[World, Record<string, AnimatableValue>]> {
  const modelLoader = new GLTFLoader();
  modelLoader.setDRACOLoader(new DRACOLoader());

  const modelData = await modelLoader.loadAsync(url);

  const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];

  return traverseThree(modelData.scene, actualizedNamespaces, aggressiveImport);
}

export async function loadGLTFFromBlob(
  blob: Blob,
  namespaces: string[],
  aggressiveImport = false,
): Promise<[World, Record<string, AnimatableValue>]> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());

    const reader = new FileReader();

    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;

      loader.parse(
        arrayBuffer,
        "", // Base path for resolving external resources
        (gltf: GLTF) => {
          // Create a scene and add the loaded GLTF model
          const actualizedNamespaces = namespaces.length > 0 ? namespaces : ["default"];
          // console.log("actualizedNamespaces", actualizedNamespaces);
          resolve(traverseThree(gltf.scene, actualizedNamespaces, aggressiveImport));
        },
        (error: ErrorEvent) => {
          reject(new Error(`Error loading GLTF: ${error.message}`));
        },
      );
    };

    reader.onerror = () => {
      reject(new Error("Failed to read Blob as ArrayBuffer."));
    };

    reader.readAsArrayBuffer(blob);
  });
}
