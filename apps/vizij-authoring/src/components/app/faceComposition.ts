import type { VizijOptions } from "@vizij/runtime";

/**
 * How authoring composes a face it shows — the main face and the reference
 * face alike: its rig, pose driver and pose graph, with no program from load;
 * the motion-graph editor runs programs.
 */
export const AUTHORING_FACE_OPTIONS: VizijOptions = {
  graphs: ["rig", "pose-driver", "pose"],
  program: "none",
};
