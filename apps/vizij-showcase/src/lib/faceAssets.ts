import type { VizijAssetBundle } from "@vizij/runtime-react";
import { FACE_ROOT_BOUNDS } from "../config/runtimeFace";

const FACE_ASSET_PATHS = {
  hugoLatest: "/assets/Hugo_Latest_Rigged.glb",
  quoriLatest: "/assets/Quori_Latest_Rigged.glb",
} as const;

export type ShowcaseFaceAssetKey = keyof typeof FACE_ASSET_PATHS;

const FACE_ASSET_GLB_BASE = {
  kind: "url" as const,
  aggressiveImport: true,
  rootBounds: FACE_ROOT_BOUNDS,
};

export const faceAssetBundleTemplate: VizijAssetBundle = {
  namespace: "vizij-showcase",
  glb: {
    ...FACE_ASSET_GLB_BASE,
    src: FACE_ASSET_PATHS.hugoLatest,
  },
  pose: {
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};

function createGlbConfig(asset: ShowcaseFaceAssetKey): VizijAssetBundle["glb"] {
  return {
    ...FACE_ASSET_GLB_BASE,
    src: FACE_ASSET_PATHS[asset],
  };
}

export function createShowcaseBundle(
  key: string,
  asset: ShowcaseFaceAssetKey = "hugoLatest",
): VizijAssetBundle {
  return {
    ...faceAssetBundleTemplate,
    namespace: `${faceAssetBundleTemplate.namespace}-${key}`,
    glb: createGlbConfig(asset),
  };
}
