import type {
  LowLevelRigSummary,
  PoseDefinition,
  PoseRigConfigFile,
} from "./types";

export const POSE_RIG_CONFIG_VERSION = 1;

export function clonePoseDefinition(pose: PoseDefinition): PoseDefinition {
  return {
    ...pose,
    values: { ...pose.values },
  };
}

export function buildPoseRigConfig(options: {
  faceId: string | null;
  neutralInputs: Record<string, number>;
  poses: PoseDefinition[];
  lowLevel?: LowLevelRigSummary | null;
  previous?: PoseRigConfigFile | null;
  title?: string;
  description?: string;
}): PoseRigConfigFile {
  const {
    faceId,
    neutralInputs,
    poses,
    lowLevel,
    previous,
    title,
    description,
  } = options;
  const now = new Date().toISOString();
  return {
    version: POSE_RIG_CONFIG_VERSION,
    faceId,
    title: title ?? previous?.title,
    description: description ?? previous?.description,
    neutralInputs: { ...neutralInputs },
    poses: poses.map(clonePoseDefinition),
    lowLevel: lowLevel ?? previous?.lowLevel ?? null,
    metadata: {
      createdAt: previous?.metadata?.createdAt ?? now,
      updatedAt: now,
      author: previous?.metadata?.author,
    },
  };
}

export function parsePoseRigConfig(payload: unknown): PoseRigConfigFile {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid pose rig config payload.");
  }
  const candidate = payload as Partial<PoseRigConfigFile>;
  if (candidate.version !== POSE_RIG_CONFIG_VERSION) {
    throw new Error(
      `Unsupported pose rig config version: ${candidate.version ?? "unknown"}.`,
    );
  }
  if (!Array.isArray(candidate.poses)) {
    throw new Error("Pose rig config missing pose definitions.");
  }
  if (!candidate.neutralInputs || typeof candidate.neutralInputs !== "object") {
    throw new Error("Pose rig config missing neutral inputs.");
  }
  return {
    version: POSE_RIG_CONFIG_VERSION,
    faceId: candidate.faceId ?? null,
    title: candidate.title ?? undefined,
    description: candidate.description ?? undefined,
    neutralInputs: { ...(candidate.neutralInputs as Record<string, number>) },
    poses: candidate.poses.map((pose) => clonePoseDefinition(pose)),
    lowLevel:
      (candidate.lowLevel as LowLevelRigSummary | null | undefined) ?? null,
    metadata: candidate.metadata
      ? { ...candidate.metadata }
      : {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
  };
}

export function diffLowLevelSummaries(
  reference: LowLevelRigSummary | null,
  target: LowLevelRigSummary | null,
): string[] {
  if (!reference || !target) {
    return ["Missing low-level summary for comparison."];
  }
  const issues: string[] = [];
  if (reference.faceId !== target.faceId) {
    issues.push(
      `Face mismatch: config uses "${reference.faceId}", current face "${target.faceId}".`,
    );
  }

  const refInputs = new Set(
    reference.bindings.map((binding) => binding.inputId),
  );
  const targetInputs = new Set(
    target.bindings.map((binding) => binding.inputId),
  );
  refInputs.forEach((inputId) => {
    if (!inputId) {
      return;
    }
    if (!targetInputs.has(inputId)) {
      issues.push(`Input ${inputId} missing in current low-level rig.`);
    }
  });

  const refAnimIds = new Set(
    reference.bindings.map((binding) => binding.animatableId),
  );
  const targetAnimIds = new Set(
    target.bindings.map((binding) => binding.animatableId),
  );
  refAnimIds.forEach((animId) => {
    if (!targetAnimIds.has(animId)) {
      issues.push(
        `Animatable ${animId} referenced in config not found in current asset.`,
      );
    }
  });

  return issues;
}
