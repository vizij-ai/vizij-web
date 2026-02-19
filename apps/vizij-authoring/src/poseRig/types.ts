import type { StandardRigInput } from "@vizij/utils";

export const POSE_RIG_CONFIG_VERSION = 1;
export const POSE_RIG_IR_VERSION = 1;
export const POSE_IR_TARGETING_CONTRACT = "canonical-standard-input-id";
export const POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT =
  "compiled-graph-synthetic-only";

export type StandardInputId = StandardRigInput["id"];
export type PoseBlendMode = "average" | "additive";
export type PoseIrBlendMode = "average" | "add";
export type PoseInputComposeMode = "average" | "add";
export type PoseCrossGroupOverrideMode = PoseBlendMode | "priority";
export type PoseIrCrossGroupOverrideMode = PoseIrBlendMode | "priority";
export type PosePriorityTieBreak = "group-order" | "group-id";
export type PoseNeutralMode = "face-default" | "explicit";
export type PoseDiagnosticSeverity = "warning" | "error" | "info";
export type PoseInputComposeModeMap = Partial<
  Record<StandardInputId, PoseInputComposeMode>
>;

export interface PoseDiagnosticLocation {
  poseId?: string;
  groupId?: string;
  inputId?: StandardInputId;
  path?: string;
}

export interface PoseDiagnostic {
  id: string;
  severity: PoseDiagnosticSeverity;
  message: string;
  code: string;
  source: "pose-config" | "pose-ir" | "pose-graph";
  location?: PoseDiagnosticLocation;
  metadata?: Record<string, unknown>;
}

export interface PoseIrCompileResult {
  ir: PoseRigIrFile;
  warnings: string[];
  diagnostics: PoseDiagnostic[];
}

export interface PoseIrContracts {
  targetIds: typeof POSE_IR_TARGETING_CONTRACT;
  syntheticNodes: typeof POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT;
}

export interface PoseIrNeutralDefinition {
  mode: PoseNeutralMode;
  values: Record<StandardInputId, number>;
}

export interface PoseIrPoseDefinition {
  id: string;
  name: string;
  description?: string;
  groupIds: string[];
  targets: Record<StandardInputId, number>;
  composeModes?: PoseInputComposeModeMap;
  createdAt: string;
  updatedAt: string;
}

export interface PoseIrGroupDefinition {
  id: string;
  name: string;
  path: string;
  intraGroupBlendMode: PoseIrBlendMode;
  poseIds: string[];
}

export interface PoseCrossGroupChannelOverride {
  mode: PoseCrossGroupOverrideMode;
  priorityOrder?: string[];
  tieBreak?: PosePriorityTieBreak;
}

export interface PoseIrCrossGroupChannelOverride {
  mode: PoseIrCrossGroupOverrideMode;
  priorityOrder?: string[];
  tieBreak?: PosePriorityTieBreak;
}

export type PoseCrossGroupChannelOverrideMap = Partial<
  Record<StandardInputId, PoseCrossGroupChannelOverride>
>;

export type PoseIrCrossGroupChannelOverrideMap = Partial<
  Record<StandardInputId, PoseIrCrossGroupChannelOverride>
>;

export interface PoseIrCrossGroupPolicy {
  mode: PoseIrBlendMode;
  overrides?: PoseIrCrossGroupChannelOverrideMap;
}

export interface PoseIrStageSource {
  kind: "group" | "stage";
  id: string;
}

export interface PoseIrBlendStageDefinition {
  id: string;
  name?: string;
  mode: PoseIrBlendMode;
  sources: PoseIrStageSource[];
}

export interface PoseRigIrFile {
  version: 1;
  faceId: string | null;
  rigKind?: "generic" | "face-specific";
  title?: string;
  description?: string;
  contracts: PoseIrContracts;
  neutral: PoseIrNeutralDefinition;
  groups: PoseIrGroupDefinition[];
  crossGroupPolicy: PoseIrCrossGroupPolicy;
  blendStages?: PoseIrBlendStageDefinition[];
  poses: PoseIrPoseDefinition[];
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
  groupIds?: string[];
  // Legacy compatibility fields. New membership logic should prefer `groupIds`.
  group?: string | null;
  groupId?: string | null;
  values: Record<StandardInputId, number>;
  composeModes?: PoseInputComposeModeMap;
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
  crossGroupChannelOverrides?: PoseCrossGroupChannelOverrideMap;
  neutralMode?: PoseNeutralMode;
  blendStages?: PoseIrBlendStageDefinition[];
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
