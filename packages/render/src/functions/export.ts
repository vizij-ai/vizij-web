import { GLTFExporter } from "three-stdlib";
import { Group } from "three";
import * as THREE from "three";
import { convertYupToZup } from "./transforms";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export function exportScene(data: Group): void {
  const rotatedData = convertYupToZup(data.clone());
  const exporter = new GLTFExporter();
  exporter.parse(
    rotatedData,
    (gltf) => {
      if (!(gltf instanceof ArrayBuffer)) {
        throw new Error("Failed to export scene!");
      }
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([gltf], {
          type: "application/octet-stream",
        }),
      );
      link.download = "scene.glb";
      link.click();
    },
    () => {
      // alert("Failed to export scene!");
    },
    {
      trs: true,
      onlyVisible: false,
      binary: true,
      includeCustomExtensions: true,
    },
  );
}
