import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseRigConfigFile, PoseRigGraphSummary } from "../types";
import { buildPoseGraphSpec } from "../graphBuilder";
import { parsePoseGraphSpec } from "../graphParser";

export const PoseGraphService = {
  buildSpec(
    config: PoseRigConfigFile,
    standardInputs: StandardRigInput[],
  ): { spec: GraphSpec; summary: PoseRigGraphSummary } {
    const faceSegment =
      config.rigKind === "generic" ? "standard" : config.faceId;
    return buildPoseGraphSpec({
      faceId: faceSegment,
      neutralInputs: config.neutralInputs,
      poses: config.poses,
      standardInputs,
      // Default to average blend mode if not specified in config (config doesn't have blend mode yet, maybe it should?)
      // For now, we'll assume average or let it be passed in options if we extend this.
      blendMode: "average",
    });
  },

  generateSummary(
    _spec: GraphSpec,
    _standardInputs: StandardRigInput[],
  ): PoseRigGraphSummary {
    // buildPoseGraphSpec returns summary, but if we only have spec, we might need to re-derive it
    // or we can rely on buildSpec returning it.
    // If we need to generate summary from an *existing* spec (e.g. imported), we might need logic for that.
    // For now, let's assume we use buildSpec to get both.
    // If we strictly need to generate summary from spec, we'd need to parse it.
    // Let's use parsePoseGraphSpec to get info, but it returns ParsedPoseGraph (neutral, poses), not GraphSummary.
    // GraphSummary is about contributions.
    // The current graphBuilder calculates summary during build.
    // Re-calculating summary from spec would require reversing the graph logic which is hard.
    // So usually we generate summary when we build the graph.

    // However, the plan says "generateSummary(spec: GraphSpec)".
    // Maybe it means extracting info?
    // For now, I'll leave a TODO or throw if not implemented, but since I'm wrapping buildPoseGraphSpec,
    // I'll expose a method that does both or just return the summary from the build step.

    // Actually, let's look at the plan again.
    // "generateSummary(spec: GraphSpec): GraphSummary"
    // If I have a spec, I can't easily get the summary without knowing the inputs and poses it represents.
    // Unless I parse it back to poses and then rebuild?

    // Let's just implement buildSpec for now which returns both.
    // I'll add a helper to extract summary if possible, or just note that it comes from build.
    throw new Error(
      "generateSummary from spec not fully supported yet; use buildSpec to get summary.",
    );
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
