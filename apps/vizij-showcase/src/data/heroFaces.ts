import type { ShowcaseFaceAssetKey } from "../lib/faceAssets";

type HeroFace = {
  namespace: string;
  label: string;
  subtitle: string;
  asset: ShowcaseFaceAssetKey;
};

export const HERO_FACES: readonly HeroFace[] = [
  {
    namespace: "hero-quori",
    label: "Quori · Robot face",
    subtitle: "Current extended rig for embodied assistants",
    asset: "quoriCurrentExtended",
  },
] as const;
