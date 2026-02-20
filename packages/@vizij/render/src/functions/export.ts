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
};

export function exportScene(
  data: Group,
  fileNameOrOptions: string | ExportSceneOptions = "scene.glb",
): Promise<void> {
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

  let didDetachBundle = false;
  const detachBundleOnce = () => {
    if (didDetachBundle) {
      return;
    }
    didDetachBundle = true;
    detachBundle();
  };

  return new Promise<void>((resolve, reject) => {
    try {
      exporter.parse(
        data,
        (gltf) => {
          detachBundleOnce();
          if (!(gltf instanceof ArrayBuffer)) {
            reject(new Error("Failed to export scene."));
            return;
          }
          const link = document.createElement("a");
          const blobUrl = URL.createObjectURL(
            new Blob([gltf], {
              type: "application/octet-stream",
            }),
          );
          link.href = blobUrl;
          const trimmed = fileName.trim();
          const safeFileName = trimmed.length > 0 ? trimmed : "scene.glb";
          const downloadName = safeFileName.toLowerCase().endsWith(".glb")
            ? safeFileName
            : `${safeFileName}.glb`;
          link.download = downloadName;
          link.click();
          setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
          resolve();
        },
        (error) => {
          detachBundleOnce();
          reject(
            error instanceof Error
              ? error
              : new Error("Failed to export scene."),
          );
        },
        exporterOptions,
      );
    } catch (error) {
      detachBundleOnce();
      reject(error);
    }
  }).finally(() => {
    detachBundleOnce();
  });
}
