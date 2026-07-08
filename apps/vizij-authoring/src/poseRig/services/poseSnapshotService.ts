import type { PoseDefinition, StandardInputId } from "../types";
import { resolveDeterministicPoseId } from "../utils";

const EPSILON = 1e-8;

export const PoseSnapshotService = {
  createPoseDefinition(
    name: string,
    group?: string | null,
    options?: {
      existingIds?: Iterable<string>;
      preferredId?: string | null;
      reservedIds?: Iterable<string>;
    },
  ): PoseDefinition {
    const now = new Date().toISOString();
    return {
      id: resolveDeterministicPoseId({
        existingIds: options?.existingIds,
        preferredId: options?.preferredId,
        name,
        group,
        reservedIds: options?.reservedIds,
      }),
      name,
      description: "",
      group: group ?? null,
      values: {},
      createdAt: now,
      updatedAt: now,
    };
  },

  capture(
    currentValues: Record<StandardInputId, number>,
    neutralValues: Record<StandardInputId, number>,
    options?: { name?: string; group?: string | null },
  ): PoseDefinition {
    const pose = this.createPoseDefinition(
      options?.name || "New Pose",
      options?.group,
    );
    const normalized: Record<string, number> = {};

    Object.entries(currentValues).forEach(([inputId, value]) => {
      const neutralValue = neutralValues[inputId];
      // If neutral is undefined, we assume 0 or keep it?
      // Logic from usePoseRigAuthoring:
      if (neutralValue === undefined) {
        normalized[inputId] = value;
        return;
      }
      if (Math.abs(value - neutralValue) >= EPSILON) {
        normalized[inputId] = value;
      }
    });

    pose.values = normalized;
    return pose;
  },

  apply(
    pose: PoseDefinition,
    neutralValues: Record<StandardInputId, number>,
  ): Record<StandardInputId, number> {
    // Returns the values to be applied to the rig.
    // It merges pose values with neutral values for missing keys.
    const result: Record<StandardInputId, number> = { ...neutralValues };
    Object.entries(pose.values).forEach(([inputId, value]) => {
      result[inputId] = value;
    });
    return result;
  },
};
