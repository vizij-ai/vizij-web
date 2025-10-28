import rigGraph from "./rig.graph.json";
import poseRigGraph from "./pose-rig.graph.json";
import poseRigConfig from "./pose-rig.config.json";

export type PoseDefinition = {
  id: string;
  name?: string;
  description?: string;
  values: Record<string, number | undefined>;
};

export type PoseRigConfig = {
  version: number;
  faceId?: string | null;
  title?: string;
  description?: string;
  neutralInputs: Record<string, number>;
  poses: PoseDefinition[];
  metadata?: Record<string, unknown>;
  lowLevel?: Record<string, unknown> | null;
};

export const faceAssetUrl = "/assets/face.glb";
export const rigGraphSpec = rigGraph;
export const poseRigGraphSpec = poseRigGraph;
export const poseRigConfiguration = poseRigConfig as PoseRigConfig;
