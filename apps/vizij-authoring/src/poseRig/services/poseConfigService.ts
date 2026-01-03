import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseRigConfigFile,
  LowLevelRigSummary,
  PoseDefinition,
} from "../types";
import { POSE_RIG_CONFIG_VERSION } from "../types";

export const PoseConfigService = {
  normalize(
    payload: unknown,
    standardInputs: StandardRigInput[] = [],
    currentFaceId: string | null = null,
  ): { config: PoseRigConfigFile; warnings: string[] } {
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
    if (
      !candidate.neutralInputs ||
      typeof candidate.neutralInputs !== "object"
    ) {
      throw new Error("Pose rig config missing neutral inputs.");
    }

    const warnings: string[] = [];
    const importedFaceId = candidate.faceId;
    if (currentFaceId && importedFaceId && importedFaceId !== currentFaceId) {
      warnings.push(
        `Imported pose rig targets face "${importedFaceId}", current face "${currentFaceId}".`,
      );
    }

    const validInputs = new Set(standardInputs.map((i) => i.id));
    const neutralInputs: Record<string, number> = {};

    for (const [key, value] of Object.entries(
      candidate.neutralInputs as Record<string, number>,
    )) {
      if (validInputs.size > 0 && !validInputs.has(key)) {
        warnings.push(`Neutral value for missing input "${key}" was ignored.`);
        continue;
      }
      neutralInputs[key] = value;
    }

    const poses = candidate.poses.map((pose) => {
      const values: Record<string, number> = {};
      let pruned = false;
      for (const [key, value] of Object.entries(pose.values)) {
        if (validInputs.size > 0 && !validInputs.has(key)) {
          pruned = true;
          continue;
        }
        values[key] = value;
      }
      if (pruned) {
        // We don't have exact message from test for pruning *values* inside pose,
        // but test says: 'Pose "Legacy Pose" references missing input "missing_input" and was pruned.'
        // This implies the input was pruned from the pose.
        // Wait, the test message says "was pruned". Does it mean the POSE was pruned?
        // "Pose ... references missing input ... and was pruned."
        // If the pose becomes empty? Or just the input?
        // "references missing input ... and was pruned" sounds like the input was pruned.
        // But the message starts with "Pose ...".
        // Let's assume it warns about the input being pruned from the pose.
        // I'll construct the warning.
      }
      // Actually, let's look at the test expectation again.
      // 'Pose "Legacy Pose" references missing input "missing_input" and was pruned.'
      // I'll add this warning if I prune an input.

      const newPose = {
        ...pose,
        values,
      };
      return newPose;
    });

    // Re-iterate to generate warnings for pruned inputs in poses
    candidate.poses.forEach((pose) => {
      for (const key of Object.keys(pose.values)) {
        if (validInputs.size > 0 && !validInputs.has(key)) {
          warnings.push(
            `Pose "${pose.name}" references missing input "${key}" and was pruned.`,
          );
        }
      }
    });

    return {
      config: {
        version: POSE_RIG_CONFIG_VERSION,
        faceId: candidate.faceId ?? null,
        rigKind: candidate.rigKind ?? "face-specific",
        title: candidate.title ?? undefined,
        description: candidate.description ?? undefined,
        neutralInputs,
        poses: poses.map((p) => ({ ...p, values: { ...p.values } })),
        lowLevel:
          (candidate.lowLevel as LowLevelRigSummary | null | undefined) ?? null,
        standardInputSchema: candidate.standardInputSchema ?? undefined,
        metadata: candidate.metadata
          ? { ...candidate.metadata }
          : {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
      },
      warnings,
    };
  },

  create(
    poses: PoseDefinition[],
    neutralInputs: Record<string, number>,
    rigName: string,
    faceId: string | null,
    rigKind: "generic" | "face-specific" = "face-specific",
    standardInputSchema?: PoseRigConfigFile["standardInputSchema"],
  ): PoseRigConfigFile {
    return {
      version: POSE_RIG_CONFIG_VERSION,
      faceId,
      rigKind,
      title: rigName,
      neutralInputs: { ...neutralInputs },
      poses: poses.map((p) => ({ ...p, values: { ...p.values } })),
      standardInputSchema: standardInputSchema ?? {
        id: "vizij-standard-face",
        version: "v1",
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  },

  serialize(config: PoseRigConfigFile): string {
    return JSON.stringify(config, null, 2);
  },

  diff(a: PoseRigConfigFile | null, b: PoseRigConfigFile | null): boolean {
    if (a === b) return false;
    if (!a || !b) return true;
    return JSON.stringify(a) !== JSON.stringify(b);
  },
};
