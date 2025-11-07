import type { GraphSpec } from "@vizij/node-graph-wasm";

export type IrValueType =
  | "scalar"
  | "vector"
  | "boolean"
  | "color"
  | "quaternion"
  | "transform"
  | "unknown";

export interface IrPortRef {
  nodeId: string;
  portId?: string;
  component?: string;
}

export interface IrNodeInput {
  id: string;
  valueType: IrValueType;
  cardinality?: "single" | "variadic";
  required?: boolean;
}

export interface IrNodeOutput {
  id: string;
  valueType: IrValueType;
  cardinality?: "single" | "variadic";
}

export interface IrNode {
  id: string;
  type: string;
  category?: string;
  label?: string;
  description?: string;
  params?: Record<string, unknown>;
  inputDefaults?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface IrEdge {
  id?: string;
  from: IrPortRef;
  to: IrPortRef;
  metadata?: Record<string, unknown>;
}

export interface IrConstant {
  id: string;
  value: number;
  valueType: IrValueType;
  metadata?: Record<string, unknown>;
}

export interface IrIssue {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  targetId?: string;
  tags?: string[];
  details?: Record<string, unknown>;
}

export interface IrBindingSummary {
  targetId: string;
  animatableId: string;
  component?: string;
  slotId: string;
  slotAlias: string;
  inputId: string | null;
  remap: Record<string, unknown>;
  expression: string;
  valueType: "scalar" | "vector";
  issues?: string[];
}

export interface IrGraphSummary {
  faceId: string;
  inputs: string[];
  outputs: string[];
  bindings: IrBindingSummary[];
}

export interface IrGraphMetadata {
  source: string;
  registryVersion?: string;
  generatedAt?: string;
  annotations?: Record<string, unknown>;
}

export interface IrLegacyArtifacts {
  spec?: GraphSpec;
}

export interface IrGraph {
  id: string;
  faceId: string;
  nodes: IrNode[];
  edges: IrEdge[];
  constants: IrConstant[];
  issues: IrIssue[];
  summary: IrGraphSummary;
  metadata: IrGraphMetadata;
  legacy?: IrLegacyArtifacts;
}

export interface IrCompileOptions {
  preferLegacySpec?: boolean;
}

export interface IrCompileResult {
  spec: GraphSpec;
  issues: IrIssue[];
}
