import type {
  PoseDefinition,
  PoseGroupDefinition,
  VizijAssetBundle,
} from "@vizij/runtime-react";

export type DemoBundleSummary = {
  faceId: string | null;
  graphKinds: string[];
  graphIds: string[];
  graphCount: number;
  rigCount: number;
  animationCount: number;
  programCount: number;
  poseCount: number;
  poseGroupCount: number;
  capabilities: {
    rig: boolean;
    poses: boolean;
    animations: boolean;
    programs: boolean;
  };
  metadataKeys: string[];
  controlInputCount: number;
  animationLabels: string[];
  programLabels: string[];
  poseGroupLabels: string[];
  poseGroups: PoseGroupDefinition[];
  poses: PoseDefinition[];
};

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

export function summarizeAssetBundle(
  assetBundle: VizijAssetBundle,
): DemoBundleSummary {
  const bundle = assetBundle.bundle;
  const graphs = Array.isArray(bundle?.graphs) ? bundle.graphs : [];
  const poses = Array.isArray(assetBundle.pose?.config?.poses)
    ? assetBundle.pose?.config?.poses
    : [];
  const poseGroups = Array.isArray(assetBundle.pose?.config?.poseGroups)
    ? assetBundle.pose?.config?.poseGroups
    : [];
  const graphKinds = uniqueSorted(
    graphs.map((entry) =>
      typeof entry.kind === "string" ? entry.kind : "unknown",
    ),
  );
  const graphIds = uniqueSorted(
    graphs
      .map((entry) => (typeof entry.id === "string" ? entry.id : ""))
      .filter(Boolean),
  );
  const animationCount = Array.isArray(assetBundle.animations)
    ? assetBundle.animations.length
    : 0;
  const programCount = Array.isArray(assetBundle.programs)
    ? assetBundle.programs.length
    : 0;
  const rigCount = graphs.filter((entry) => {
    const kind = typeof entry.kind === "string" ? entry.kind.toLowerCase() : "";
    return kind === "rig" || kind === "low-level" || kind === "pose-driver";
  }).length;
  const metadataKeys = uniqueSorted(
    Object.keys({
      ...(bundle?.metadata ?? {}),
      ...(assetBundle.metadata ?? {}),
    }),
  );
  const animationLabels = uniqueSorted(
    (assetBundle.animations ?? []).map((animation) =>
      typeof animation.clip?.name === "string" && animation.clip.name.trim()
        ? animation.clip.name
        : animation.id,
    ),
  );
  const programLabels = uniqueSorted(
    (assetBundle.programs ?? []).map((program) =>
      typeof program.label === "string" && program.label.trim()
        ? program.label
        : program.id,
    ),
  );
  const poseGroupLabels = uniqueSorted(
    poseGroups.map((group) =>
      typeof group.name === "string" && group.name.trim()
        ? group.name
        : group.id,
    ),
  );

  return {
    faceId: assetBundle.faceId ?? assetBundle.pose?.config?.faceId ?? null,
    graphKinds,
    graphIds,
    graphCount: graphs.length,
    rigCount,
    animationCount,
    programCount,
    poseCount: poses.length,
    poseGroupCount: poseGroups.length,
    capabilities: {
      rig: rigCount > 0 || Boolean(assetBundle.rig),
      poses: poses.length > 0,
      animations: animationCount > 0,
      programs: programCount > 0,
    },
    metadataKeys,
    controlInputCount: Array.isArray(assetBundle.rig?.inputMetadata)
      ? assetBundle.rig.inputMetadata.length
      : 0,
    animationLabels,
    programLabels,
    poseGroupLabels,
    poseGroups,
    poses,
  };
}

export function formatPathLabel(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase()),
    )
    .join(" / ");
}

export function formatGraphKind(kind: string): string {
  return kind
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
