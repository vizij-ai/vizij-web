import type { RawValue } from "@vizij/utils";

export type ValueKind =
  | "float"
  | "bool"
  | "vec2"
  | "vec3"
  | "vec4"
  | "quat"
  | "color"
  | "vector"
  | "transform"
  | "custom";

export type OrchestratorAnimatableComponent = {
  key: string;
  label: string;
};

export type OrchestratorAnimatableOption = {
  optionId: string;
  animId: string;
  name: string;
  group: string;
  label: string;
  type: string;
  defaultValue: RawValue;
  component?: OrchestratorAnimatableComponent;
};

export type AnimatableListItem = {
  id: string;
  name: string;
  group: string;
  label: string;
  type: string;
  defaultValue: RawValue;
  constraints?: unknown;
};

export type AnimatableListGroup = {
  key: string;
  label: string;
  items: AnimatableListItem[];
};

export type BezierHandleState = {
  x: number;
  y: number;
};

export type AnimationKeyframeState = {
  id: string;
  stamp: number;
  value: any;
  handleIn?: BezierHandleState | null;
  handleOut?: BezierHandleState | null;
};

export type AnimationTrackState = {
  id: string;
  name: string;
  animatableId: string;
  optionId?: string;
  componentKey?: string | null;
  valueKind: ValueKind;
  shapeJson?: string;
  keyframes: AnimationKeyframeState[];
};

export type AnimationEditorState = {
  id: string;
  name: string;
  duration: number;
  playerName: string;
  loopMode: "once" | "loop" | "pingpong";
  speed: number;
  tracks: AnimationTrackState[];
};

export type GraphParamState = {
  id: string;
  label: string;
  type: ValueKind;
  value: any;
  meta?: {
    min?: number;
    max?: number;
    step?: number;
    fixedBounds?: boolean;
  };
};

export type GraphNodeState = {
  id: string;
  type: string;
  name: string;
  category: string;
  params: GraphParamState[];
  inputs: Record<string, string>;
  outputShapeJson?: string;
  inputShapeJson?: string;
  outputValueKind?: ValueKind;
};

export type GraphEditorState = {
  nodes: GraphNodeState[];
  inputs: string[];
  outputs: string[];
};
