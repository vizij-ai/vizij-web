import { GLTFExporter } from "three-stdlib";
import { AnimationClip, Group } from "three";
import * as THREE from "three";
import type { VizijBundleExtension } from "../types";
import { applyVizijBundle } from "./vizij-bundle";

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export type ExportSceneOptions = {
  fileName?: string;
  bundle?: VizijBundleExtension | null;
  animations?: AnimationClip[];
  binary?: boolean;
};

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

  const detachBundle =
    shouldAttachBundle && options.bundle
      ? applyVizijBundle(data, options.bundle)
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
      data,
      (gltf) => {
        detachBundle();
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
        const safeFileName = trimmed.length > 0 ? trimmed : "scene.glb";
        const downloadName = safeFileName.toLowerCase().endsWith(".glb")
          ? safeFileName
          : `${safeFileName}.glb`;
        link.download = downloadName;
        link.click();
        URL.revokeObjectURL(link.href);
      },
      () => {
        detachBundle();
        // alert("Failed to export scene!");
      },
      exporterOptions,
    );
  } catch (error) {
    detachBundle();
    throw error;
  }
}
