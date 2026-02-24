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
  onError?: (error: Error) => void;
  onComplete?: () => void;
};

function normalizeExportError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === "string") {
    return new Error(error);
  }
  return new Error("Failed to export scene.");
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revocation so browsers finish resolving the download URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

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
          const error = new Error("Failed to export scene.");
          options.onError?.(error);
          return;
        }
        const trimmed = fileName.trim();
        const safeFileName = trimmed.length > 0 ? trimmed : "scene.glb";
        const downloadName = safeFileName.toLowerCase().endsWith(".glb")
          ? safeFileName
          : `${safeFileName}.glb`;
        triggerBlobDownload(
          new Blob([gltf], {
            type: "application/octet-stream",
          }),
          downloadName,
        );
        options.onComplete?.();
      },
      (error) => {
        detachBundle();
        options.onError?.(normalizeExportError(error));
      },
      exporterOptions,
    );
  } catch (error) {
    detachBundle();
    const normalizedError = normalizeExportError(error);
    options.onError?.(normalizedError);
    throw normalizedError;
  }
}
