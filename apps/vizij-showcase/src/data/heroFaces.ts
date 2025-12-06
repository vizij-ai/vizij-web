import type { ShowcaseFaceAssetKey } from "../lib/faceAssets";

type HeroFace = {
  namespace: string;
  label: string;
  subtitle: string;
  asset: ShowcaseFaceAssetKey;
};

export const HERO_FACES: readonly HeroFace[] = [
  {
    namespace: "hero-hugo",
    label: "Hugo · Product demo",
    subtitle: "Latest rig tuned for in-app hosts",
    asset: "hugoLatest",
  },
  {
    namespace: "hero-quori",
    label: "Quori · Robot face",
    subtitle: "Latest rig for embodied assistants",
    asset: "quoriLatest",
  },
] as const;
