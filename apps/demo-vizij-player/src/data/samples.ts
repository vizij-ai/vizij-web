import type { VizijAssetBundle } from "@vizij/runtime-react";
import type { DemoFaceSource, DemoSampleId } from "../state/types";

const SAMPLE_ASSET_URLS = {
  "quori-current-extended": new URL(
    "../../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
    import.meta.url,
  ).href,
} as const satisfies Record<DemoSampleId, string>;

export type DemoSampleDefinition = {
  id: DemoSampleId;
  label: string;
  eyebrow: string;
  description: string;
  accent: string;
  capabilities: {
    rig: boolean;
    poses: boolean;
    animations: boolean;
    programs: boolean;
  };
  counts: {
    rigs: number;
    poses: number;
    poseGroups: number;
    animations: number;
    programs: number;
  };
  assetUrl: string;
};

export const DEMO_SAMPLES: DemoSampleDefinition[] = [
  {
    id: "quori-current-extended",
    label: "Quori Extended",
    eyebrow: "Conversation face",
    description:
      "The most feature-complete bundle in the repo: grouped poses, two embedded clips, and a procedural motiongraph program.",
    accent: "#ff8a4f",
    capabilities: {
      rig: true,
      poses: true,
      animations: true,
      programs: true,
    },
    counts: {
      rigs: 2,
      poses: 23,
      poseGroups: 2,
      animations: 2,
      programs: 1,
    },
    assetUrl: SAMPLE_ASSET_URLS["quori-current-extended"],
  },
];

export function getSampleDefinition(
  id: DemoSampleId,
): DemoSampleDefinition | undefined {
  return DEMO_SAMPLES.find((sample) => sample.id === id);
}

function buildNamespace(source: DemoFaceSource): string {
  return `demo-vizij-player-${source.id}`;
}

export function buildAssetBundleForSource(
  source: DemoFaceSource,
): VizijAssetBundle {
  const base = {
    namespace: buildNamespace(source),
    pose: {
      stageNeutralFilter: (_id: string, path: string) =>
        !path.includes("/color/"),
    },
  } satisfies Pick<VizijAssetBundle, "namespace" | "pose">;

  if (source.kind === "sample") {
    const sample = getSampleDefinition(source.id);
    if (!sample) {
      throw new Error(`Unknown demo sample "${source.id}".`);
    }
    return {
      ...base,
      glb: {
        kind: "url",
        src: sample.assetUrl,
        aggressiveImport: true,
      },
      metadata: {
        sampleId: sample.id,
        sampleLabel: sample.label,
      },
    };
  }

  return {
    ...base,
    glb: {
      kind: "blob",
      blob: source.file,
      aggressiveImport: true,
    },
    metadata: {
      uploadFileName: source.fileName,
      uploadLabel: source.label,
    },
  };
}
