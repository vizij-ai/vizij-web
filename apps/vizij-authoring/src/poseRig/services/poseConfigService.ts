import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
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

    const inputsById = new Map(
      standardInputs.map((input) => [input.id, input]),
    );
    const inputsBySourceId = new Map<string, string>();
    const inputsByPath = new Map<string, string>();
    const inputsByNormalizedId = new Map<string, string>();
    const inputsByNormalizedPath = new Map<string, string>();
    const inputsByNormalizedSourceId = new Map<string, string>();

    const normalizeToken = (value: string): string =>
      value.trim().replace(/^\/+/, "").replace(/\/+/g, "_").toLowerCase();

    const pushLookupValue = (
      lookup: Map<string, string>,
      key: string | null | undefined,
      inputId: string,
    ) => {
      if (!key) {
        return;
      }
      const normalized = key.trim();
      if (!normalized) {
        return;
      }
      if (!lookup.has(normalized)) {
        lookup.set(normalized, inputId);
      }
    };

    standardInputs.forEach((input) => {
      const normalizedPath = normalizeStandardRigInputPath(input.path);
      pushLookupValue(inputsByPath, normalizedPath, input.id);
      pushLookupValue(inputsByNormalizedId, normalizeToken(input.id), input.id);
      pushLookupValue(
        inputsByNormalizedPath,
        normalizeToken(normalizedPath),
        input.id,
      );
      if (input.sourceId) {
        pushLookupValue(inputsBySourceId, input.sourceId, input.id);
        pushLookupValue(
          inputsByNormalizedSourceId,
          normalizeToken(input.sourceId),
          input.id,
        );
      }
    });

    const validInputs = new Set(inputsById.keys());
    const seenWarnings = new Set<string>();
    const pushWarning = (message: string) => {
      if (seenWarnings.has(message)) {
        return;
      }
      seenWarnings.add(message);
      warnings.push(message);
    };

    const resolveInputId = (
      rawKey: string,
    ): {
      id: string | null;
      reason: "sourceId" | "path" | "normalized" | null;
    } => {
      const key = rawKey.trim();
      if (!key) {
        return { id: null, reason: null };
      }
      if (inputsById.has(key)) {
        return { id: key, reason: null };
      }
      const sourceMatch = inputsBySourceId.get(key);
      if (sourceMatch) {
        return { id: sourceMatch, reason: "sourceId" };
      }
      const normalizedPath = normalizeStandardRigInputPath(key);
      const pathMatch = inputsByPath.get(normalizedPath);
      if (pathMatch) {
        return { id: pathMatch, reason: "path" };
      }
      const normalized = normalizeToken(key);
      const normalizedMatch =
        inputsByNormalizedId.get(normalized) ??
        inputsByNormalizedPath.get(normalized) ??
        inputsByNormalizedSourceId.get(normalized) ??
        null;
      if (normalizedMatch) {
        return { id: normalizedMatch, reason: "normalized" };
      }
      return { id: null, reason: null };
    };

    const neutralInputs: Record<string, number> = {};

    for (const [key, value] of Object.entries(
      candidate.neutralInputs as Record<string, number>,
    )) {
      if (validInputs.size === 0) {
        neutralInputs[key] = value;
        continue;
      }

      const resolved = resolveInputId(key);
      if (!resolved.id) {
        pushWarning(`Neutral value for missing input "${key}" was ignored.`);
        continue;
      }
      neutralInputs[resolved.id] = value;
      if (resolved.id !== key) {
        pushWarning(
          `Neutral input "${key}" remapped to "${resolved.id}" via ${resolved.reason ?? "id"} match.`,
        );
      }
    }

    const poses = candidate.poses.map((pose) => {
      const values: Record<string, number> = {};
      const poseValues =
        pose.values && typeof pose.values === "object"
          ? (pose.values as Record<string, number>)
          : {};
      for (const [key, value] of Object.entries(poseValues)) {
        if (validInputs.size === 0) {
          values[key] = value;
          continue;
        }
        const resolved = resolveInputId(key);
        if (!resolved.id) {
          pushWarning(
            `Pose "${pose.name}" references missing input "${key}" and was pruned.`,
          );
          continue;
        }
        values[resolved.id] = value;
        if (resolved.id !== key) {
          pushWarning(
            `Pose "${pose.name}" input "${key}" remapped to "${resolved.id}" via ${resolved.reason ?? "id"} match.`,
          );
        }
      }

      const newPose = {
        ...pose,
        values,
      };
      return newPose;
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
