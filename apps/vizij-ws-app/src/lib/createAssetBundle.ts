import { invoke } from "@tauri-apps/api/core";
import type { VizijAssetBundle, RootBounds } from "@vizij/runtime-react";

const DEFAULT_ROOT_BOUNDS: RootBounds = {
  center: { x: 0, y: 0 },
  size: { x: 3, y: 2 },
};

/**
 * Check if a source string is a URL (http:// or https://)
 */
function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

/**
 * Read a local file via Tauri and convert to Blob
 */
async function readLocalFileAsBlob(path: string): Promise<Blob> {
  const base64Data = await invoke<string>("read_glb_file", { path });
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: "model/gltf-binary" });
}

/**
 * Create a VizijAssetBundle from a GLB source (URL or local path)
 */
export async function createAssetBundleFromSource(
  source: string,
  namespace: string = "vizij-ws"
): Promise<VizijAssetBundle> {
  if (isUrl(source)) {
    // URL-based loading
    return {
      namespace,
      glb: {
        kind: "url",
        src: source,
        aggressiveImport: true,
        rootBounds: DEFAULT_ROOT_BOUNDS,
      },
    };
  } else {
    // Local file - read via Tauri and create blob
    const blob = await readLocalFileAsBlob(source);
    return {
      namespace,
      glb: {
        kind: "blob",
        blob,
        aggressiveImport: true,
        rootBounds: DEFAULT_ROOT_BOUNDS,
      },
    };
  }
}

/**
 * Create a VizijAssetBundle from a File object (for file picker)
 */
export function createAssetBundleFromFile(
  file: File,
  namespace: string = "vizij-ws"
): VizijAssetBundle {
  return {
    namespace,
    glb: {
      kind: "blob",
      blob: file,
      aggressiveImport: true,
      rootBounds: DEFAULT_ROOT_BOUNDS,
    },
  };
}

/**
 * Get the GLB source from CLI arguments
 */
export async function getGlbSource(): Promise<string | null> {
  return invoke<string | null>("get_glb_source");
}
