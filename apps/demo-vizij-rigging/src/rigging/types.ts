import type { StandardRigInput } from "../low-level/standardRigInputs";

export type StandardInputId = StandardRigInput["id"];

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

export interface EmotionDefinition {
  id: string;
  name: string;
  description?: string;
  values: Record<StandardInputId, number>;
  createdAt: string;
  updatedAt: string;
}

export type EmotionWeightMap = Record<string, number>;

export interface RigAuthoringState {
  neutralInputs: Record<StandardInputId, number>;
  emotions: EmotionDefinition[];
}

export interface RigConfigFile {
  version: 1;
  faceId: string | null;
  title?: string;
  description?: string;
  neutralInputs: Record<StandardInputId, number>;
  emotions: EmotionDefinition[];
  lowLevel?: LowLevelRigSummary | null;
  metadata?: {
    createdAt: string;
    updatedAt: string;
    author?: string;
  };
}

export interface GraphGenerationSummary {
  inputs: Array<{
    id: StandardInputId;
    path: string;
    neutral: number;
    contributions: Array<{
      emotionId: string;
      emotionName: string;
      delta: number;
    }>;
  }>;
  outputs: string[];
}
