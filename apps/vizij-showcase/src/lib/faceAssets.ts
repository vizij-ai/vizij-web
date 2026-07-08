import type { VizijAssetBundle } from "@vizij/runtime-react";

const FACE_ASSET_PATHS = {
  quoriCurrentExtended: new URL(
    "../../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
    import.meta.url,
  ).href,
} as const;

export type ShowcaseFaceAssetKey = keyof typeof FACE_ASSET_PATHS;

const FACE_ASSET_GLB_BASE = {
  kind: "url" as const,
  aggressiveImport: true,
};

export const faceAssetBundleTemplate: VizijAssetBundle = {
  namespace: "vizij-showcase",
  glb: {
    ...FACE_ASSET_GLB_BASE,
    src: FACE_ASSET_PATHS.quoriCurrentExtended,
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
  asset: ShowcaseFaceAssetKey = "quoriCurrentExtended",
): VizijAssetBundle {
  return {
    ...faceAssetBundleTemplate,
    namespace: `${faceAssetBundleTemplate.namespace}-${key}`,
    glb: createGlbConfig(asset),
  };
}
