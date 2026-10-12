import type { Pose, PoseGroup, VizijDescription } from "@vizij/runtime";

export type DemoBundleSummary = {
  faceId: string | null;
  graphKinds: string[];
  /** Each bundle graph's `kind:id`, or its kind alone when it has no id. */
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
  poseGroups: PoseGroup[];
  poses: Pose[];
};

const RIG_KINDS = new Set(["rig", "low-level", "pose-driver"]);

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right),
  );
}

/** What the panels show of a face, from `describe(glb)`. */
export function summarizeDescription(
  description: VizijDescription | null,
): DemoBundleSummary {
  const graphs = description?.graphs ?? [];
  const poses = description?.poses ?? [];
  const poseGroups = description?.poseGroups ?? [];
  const animations = description?.animations ?? [];
  const programs = description?.programs ?? [];
  const rigCount = graphs.filter((graph) =>
    RIG_KINDS.has(graph.kind.toLowerCase()),
  ).length;

  return {
    faceId: description?.faceId ?? null,
    graphKinds: uniqueSorted(graphs.map((graph) => graph.kind)),
    graphIds: uniqueSorted(
      graphs.map((graph) =>
        graph.id ? `${graph.kind}:${graph.id}` : graph.kind,
      ),
    ),
    graphCount: graphs.length,
    rigCount,
    animationCount: animations.length,
    programCount: programs.length,
    poseCount: poses.length,
    poseGroupCount: poseGroups.length,
    capabilities: {
      rig: rigCount > 0,
      poses: poses.length > 0,
      animations: animations.length > 0,
      programs: programs.length > 0,
    },
    metadataKeys: uniqueSorted(Object.keys(description?.metadata ?? {})),
    controlInputCount: description?.rigInputs.length ?? 0,
    animationLabels: uniqueSorted(
      animations.map((animation) => animation.name?.trim() || animation.id),
    ),
    programLabels: uniqueSorted(
      programs.map((program) => program.label?.trim() || program.id),
    ),
    poseGroupLabels: uniqueSorted(
      poseGroups.map((group) => group.name?.trim() || group.id),
    ),
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
