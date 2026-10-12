/** The faces the showcase loads, by key. */
export const FACE_ASSET_URLS = {
  quoriCurrentExtended: new URL(
    "../../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
    import.meta.url,
  ).href,
} as const;

export type ShowcaseFaceAssetKey = keyof typeof FACE_ASSET_URLS;
