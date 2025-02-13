import { DRACOLoader, GLTFLoader, GLTF } from "three-stdlib";
import { AnimatableValue } from "@semio/utils";
import { World } from "../types";
import { traverseThree } from "./gltf-loading/traverse-three";

/**
 * Loads a GLTF model from a Blob and returns the Three.js scene containing the model.
 *
 * @param blob - The Blob containing the GLTF data.
 * @returns A Promise that resolves with the THREE.Scene containing the loaded model.
 */
export const loadGltfFromBlob = (
  blob: Blob,
  namespaces: string[],
): Promise<[World, Record<string, AnimatableValue>]> => {
  return new Promise((resolve, reject) => {
    console.log("in load from gltf");
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
          resolve(traverseThree(gltf.scene, actualizedNamespaces));
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
};
