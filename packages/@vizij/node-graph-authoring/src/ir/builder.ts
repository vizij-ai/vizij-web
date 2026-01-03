import type { GraphSpec } from "@vizij/node-graph-wasm";
import {
  type IrBindingSummary,
  type IrConstant,
  type IrEdge,
  type IrGraph,
  type IrGraphMetadata,
  type IrGraphSummary,
  type IrIssue,
  type IrNode,
} from "./types";

export interface IrGraphBuilderOptions {
  faceId: string;
  source?: string;
  registryVersion?: string;
  generatedAt?: string;
  annotations?: Record<string, unknown>;
}

export interface IrGraphBuilder {
  addNode(node: IrNode): IrNode;
  addEdge(edge: IrEdge): IrEdge;
  addConstant(constant: IrConstant): IrConstant;
  addIssue(issue: IrIssue): IrIssue;
  setSummary(summary: IrGraphSummary): void;
  updateMetadata(metadata: Partial<IrGraphMetadata>): void;
  build(): IrGraph;
}

let graphSequence = 0;

function generateGraphId(faceId: string): string {
  graphSequence += 1;
  return `ir_${faceId}_${graphSequence}`;
}

class DefaultIrGraphBuilder implements IrGraphBuilder {
  private readonly faceId: string;
  private summary: IrGraphSummary;
  private metadata: IrGraphMetadata;
  private readonly nodes: IrNode[] = [];
  private readonly edges: IrEdge[] = [];
  private readonly constants: IrConstant[] = [];
  private readonly issues: IrIssue[] = [];

  constructor(options: IrGraphBuilderOptions) {
    this.faceId = options.faceId;
    this.summary = {
      faceId: options.faceId,
      inputs: [],
      outputs: [],
      bindings: [],
    };
    this.metadata = {
      source: options.source ?? "ir-builder",
      registryVersion: options.registryVersion,
      generatedAt: options.generatedAt,
      annotations: options.annotations,
    };
  }

  addNode(node: IrNode): IrNode {
    this.nodes.push(node);
    return node;
  }

  addEdge(edge: IrEdge): IrEdge {
    this.edges.push(edge);
    return edge;
  }

  addConstant(constant: IrConstant): IrConstant {
    this.constants.push(constant);
    return constant;
  }

  addIssue(issue: IrIssue): IrIssue {
    this.issues.push(issue);
    return issue;
  }

  setSummary(summary: IrGraphSummary): void {
    this.summary = summary;
  }

  updateMetadata(metadata: Partial<IrGraphMetadata>): void {
    this.metadata = {
      ...this.metadata,
      ...metadata,
    };
  }

  build(): IrGraph {
    return {
      id: generateGraphId(this.faceId),
      faceId: this.faceId,
      nodes: [...this.nodes],
      edges: [...this.edges],
      constants: [...this.constants],
      issues: [...this.issues],
      summary: { ...this.summary },
      metadata: { ...this.metadata },
    };
  }
}

export function createIrGraphBuilder(
  options: IrGraphBuilderOptions,
): IrGraphBuilder {
  return new DefaultIrGraphBuilder(options);
}

export interface LegacyIrGraphPayload {
  faceId: string;
  summary: IrGraphSummary;
  issues?: IrIssue[];
  registryVersion?: string;
  source?: string;
  annotations?: Record<string, unknown>;
  spec: GraphSpec;
}

export function createLegacyIrGraph(payload: LegacyIrGraphPayload): IrGraph {
  const builder = createIrGraphBuilder({
    faceId: payload.faceId,
    registryVersion: payload.registryVersion,
    source: payload.source ?? "legacy-graph-builder",
    annotations: payload.annotations,
    generatedAt: new Date().toISOString(),
  });
  builder.setSummary(payload.summary);
  (payload.issues ?? []).forEach((issue) => builder.addIssue(issue));
  const graph = builder.build();
  return {
    ...graph,
    legacy: { spec: payload.spec },
  };
}

export function toIrBindingSummary(
  summaries: {
    targetId: string;
    animatableId: string;
    component?: string;
    slotId: string;
    slotAlias: string;
    inputId: string | null;
    expression: string;
    valueType: "scalar" | "vector";
    issues?: string[];
    nodeId: string;
    expressionNodeId: string;
  }[],
): IrBindingSummary[] {
  return summaries.map((summary) => ({
    ...summary,
    issues: summary.issues ? [...summary.issues] : undefined,
  }));
}
