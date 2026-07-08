import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseRigConfigFile,
  PoseRigGraphSummary,
  PoseRigIrFile,
} from "../types";
import { buildPoseGraphSpecFromIr } from "../graphBuilder";
import { parsePoseGraphSpec } from "../graphParser";
import { PoseIrService } from "./poseIrService";

export const PoseGraphService = {
  buildSpec(
    config: PoseRigConfigFile,
    standardInputs: StandardRigInput[],
    options?: {
      blendMode?: "average" | "additive";
      defaultGroupBlendMode?: "average" | "additive";
      crossGroupBlendMode?: "average" | "additive";
      poseGroupSegment?: string | null;
    },
  ): { spec: GraphSpec; summary: PoseRigGraphSummary } {
    const { ir } = PoseIrService.fromConfig(
      config,
      standardInputs,
      config.faceId ?? null,
      {
        defaultGroupBlendMode:
          options?.defaultGroupBlendMode ?? options?.blendMode,
        crossGroupBlendMode: options?.crossGroupBlendMode,
      },
    );

    return this.buildSpecFromIr(ir, standardInputs, {
      rigKind: config.rigKind ?? "face-specific",
      poseGroupSegment: options?.poseGroupSegment ?? null,
    });
  },

  buildSpecFromIr(
    ir: PoseRigIrFile,
    standardInputs: StandardRigInput[],
    options?: {
      poseGroupSegment?: string | null;
      rigKind?: "generic" | "face-specific";
    },
  ): { spec: GraphSpec; summary: PoseRigGraphSummary } {
    return buildPoseGraphSpecFromIr({
      poseIr: ir,
      standardInputs,
      faceId: ir.faceId,
      rigKind: options?.rigKind ?? ir.rigKind ?? "face-specific",
      poseGroupSegment: options?.poseGroupSegment ?? null,
    });
  },

  generateSummary(
    spec: GraphSpec,
    standardInputs: StandardRigInput[],
  ): PoseRigGraphSummary {
    try {
      const parsed = parsePoseGraphSpec(spec, standardInputs, {
        allowUnknownInputs: true,
      });
      const summary: PoseRigGraphSummary = {
        inputs: [],
        outputs: [],
      };

      const standardById = new Map(
        standardInputs.map((input) => [input.id, input]),
      );

      Object.entries(parsed.neutralInputs).forEach(
        ([inputId, neutralValue]) => {
          if (standardById.has(inputId)) {
            return;
          }
          standardById.set(inputId, {
            id: inputId,
            path: inputId,
            label: inputId,
            group: "imported",
            defaultValue: neutralValue,
            range: { min: -1, max: 1 },
          });
        },
      );

      parsed.poses.forEach((pose) => {
        Object.keys(pose.values).forEach((inputId) => {
          if (standardById.has(inputId)) {
            return;
          }
          standardById.set(inputId, {
            id: inputId,
            path: inputId,
            label: inputId,
            group: "imported",
            defaultValue: parsed.neutralInputs[inputId] ?? 0,
            range: { min: -1, max: 1 },
          });
        });
      });

      standardById.forEach((input, inputId) => {
        const neutral =
          parsed.neutralInputs[inputId] ?? input.defaultValue ?? 0;
        const contributions: PoseRigGraphSummary["inputs"][number]["contributions"] =
          [];

        parsed.poses.forEach((pose) => {
          const poseValue = pose.values[inputId];
          if (poseValue === undefined) {
            return;
          }
          const delta = poseValue - neutral;
          if (Math.abs(delta) < 1e-6) {
            return;
          }
          contributions.push({
            poseId: pose.id,
            poseName: pose.name,
            value: poseValue,
            delta,
          });
        });

        if (contributions.length === 0) {
          return;
        }

        summary.inputs.push({
          id: inputId,
          path: input.path,
          neutral,
          contributions,
        });
        summary.outputs.push(input.path);
      });

      return summary;
    } catch {
      return {
        inputs: [],
        outputs: [],
      };
    }
  },

  validate(spec: GraphSpec, standardInputs: StandardRigInput[]): string[] {
    try {
      const result = parsePoseGraphSpec(spec, standardInputs);
      return result.warnings;
    } catch (e: any) {
      return [e.message];
    }
  },

  parse(spec: GraphSpec, standardInputs: StandardRigInput[]) {
    return parsePoseGraphSpec(spec, standardInputs);
  },
};
