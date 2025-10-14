import { GLTFExporter } from "three-stdlib";
import { Group } from "three";
import * as THREE from "three";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export function exportScene(data: Group, fileName = "scene.glb"): void {
  const exporter = new GLTFExporter();
  exporter.parse(
    data,
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
      const trimmed = fileName.trim();
      const safeFileName =
        trimmed.length > 0 ? trimmed : "scene.glb";
      const downloadName = safeFileName.toLowerCase().endsWith(".glb")
        ? safeFileName
        : `${safeFileName}.glb`;
      link.download = downloadName;
      link.click();
      URL.revokeObjectURL(link.href);
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
