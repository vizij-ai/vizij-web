import type { PoseIrBlendMode } from "../poseRig/types";

export interface PoseGroupInspectorSelection {
  groupPath: string;
  label: string;
  groupId: string | null;
  poseIds: string[];
  nodeId: string;
}

export interface BlendStageInspectorSelection {
  id: string;
  label: string;
  mode: PoseIrBlendMode;
  sourceSummary: string;
  sourceIds: string[];
}
