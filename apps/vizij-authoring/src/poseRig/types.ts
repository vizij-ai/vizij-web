import type { StandardRigInput } from "@vizij/utils";

export const POSE_RIG_CONFIG_VERSION = 1;

export type StandardInputId = StandardRigInput["id"];
export type PoseBlendMode = "average" | "additive";

export interface PoseGroupDefinition {
  id: string;
  name: string;
  path: string;
  blendMode?: PoseBlendMode;
}

export interface LowLevelBinding {
  targetId: string;
  animatableId: string;
  component?: "x" | "y" | "z" | "r" | "g" | "b";
  inputId: StandardInputId | null;
  remap: {
    inMin: number;
    inMax: number;
    outMin: number;
    outMax: number;
  };
}

export interface LowLevelRigSummary {
  faceId: string;
  inputs: string[];
  outputs: string[];
  bindings: LowLevelBinding[];
}

export interface PoseDefinition {
  id: string;
  name: string;
  description?: string;
  group?: string | null;
  groupId?: string | null;
  values: Record<StandardInputId, number>;
  createdAt: string;
  updatedAt: string;
}

export type PoseWeightMap = Record<string, number>;

export interface PoseRigAuthoringState {
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
}

export interface PoseRigConfigFile {
  version: 1;
  faceId: string | null;
  rigKind?: "generic" | "face-specific";
  title?: string;
  description?: string;
  poseGroups?: PoseGroupDefinition[];
  crossGroupBlendMode?: PoseBlendMode;
  neutralInputs: Record<StandardInputId, number>;
  poses: PoseDefinition[];
  lowLevel?: LowLevelRigSummary | null;
  metadata?: {
    createdAt: string;
    updatedAt: string;
    author?: string;
  };
  standardInputSchema?: {
    id: string;
    version: string;
  };
}

export interface PoseGraphContribution {
  poseId: string;
  poseName: string;
  value: number;
  delta: number;
}

export interface PoseGraphInputSummary {
  id: StandardInputId;
  path: string;
  neutral: number;
  contributions: PoseGraphContribution[];
}

export interface PoseRigGraphSummary {
  inputs: PoseGraphInputSummary[];
  outputs: string[];
}
