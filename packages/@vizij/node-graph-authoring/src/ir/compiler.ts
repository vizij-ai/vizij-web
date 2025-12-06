import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";
import { cloneDeepSafe } from "@vizij/utils";

import {
  type IrConstant,
  type IrEdge,
  type IrNode,
  type IrCompileOptions,
  type IrCompileResult,
  type IrGraph,
} from "./types";

/**
 * Compile an IR graph into a runtime-ready GraphSpec. The current implementation
 * falls back to any legacy GraphSpec that was attached during migration,
 * allowing the IR surface to land incrementally while the dedicated compiler
 * is built.
 */
export function compileIrGraph(
  graph: IrGraph,
  options: IrCompileOptions = {},
): IrCompileResult {
  const preferLegacy = options.preferLegacySpec === true;
  const legacySpec = graph.legacy?.spec;
  if (preferLegacy && legacySpec) {
    return {
      spec: legacySpec,
      issues: [...graph.issues],
    };
  }

  const convertedNodes = graph.nodes.map(convertIrNodeToNodeSpec);
  const existingNodeIds = new Set(convertedNodes.map((node) => node.id));
  graph.constants.forEach((constant) => {
    if (existingNodeIds.has(constant.id)) {
      return;
    }
    convertedNodes.push(convertIrConstantToNodeSpec(constant));
  });
  const convertedEdges = graph.edges.map(convertIrEdgeToGraphEdge);
  const spec: GraphSpec = {
    nodes: convertedNodes,
    edges: convertedEdges.length > 0 ? convertedEdges : undefined,
  };
  inlineSingleUseConstants(spec);
  const metadata = extractGraphSpecMetadata(graph);
  if (metadata !== undefined) {
    (spec as Record<string, unknown>).metadata = metadata;
  }

  return {
    spec,
    issues: [...graph.issues],
  };
}

function convertIrNodeToNodeSpec(node: IrNode): NodeSpec {
  const spec: NodeSpec = {
    id: node.id,
    type: node.type,
  };
  if (node.params) {
    spec.params = cloneJsonLike(node.params);
  }
  if (node.inputDefaults) {
    spec.input_defaults = cloneJsonLike(node.inputDefaults);
  }
  if (node.metadata) {
    spec.metadata = cloneJsonLike(node.metadata);
  }
  return spec;
}

function convertIrConstantToNodeSpec(constant: IrConstant): NodeSpec {
  const spec: NodeSpec = {
    id: constant.id,
    type: "constant",
    params: {
      value: constant.value,
    },
  };
  if (constant.metadata) {
    spec.metadata = cloneJsonLike(constant.metadata);
  }
  return spec;
}

type GraphEdgeSpec = NonNullable<GraphSpec["edges"]>[number];

function convertIrEdgeToGraphEdge(edge: IrEdge): GraphEdgeSpec {
  return {
    from: {
      node_id: edge.from.nodeId,
      output: edge.from.portId,
    },
    to: {
      node_id: edge.to.nodeId,
      input: edge.to.portId,
    },
  };
}

function extractGraphSpecMetadata(
  graph: IrGraph,
): Record<string, unknown> | undefined {
  const annotations = graph.metadata.annotations as
    | {
        graphSpecMetadata?: Record<string, unknown>;
      }
    | undefined;
  if (!annotations?.graphSpecMetadata) {
    return undefined;
  }
  return cloneJsonLike(annotations.graphSpecMetadata);
}

function cloneJsonLike<T>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  return cloneDeepSafe(value);
}

function inlineSingleUseConstants(spec: GraphSpec): void {
  const nodes: NodeSpec[] = spec.nodes ?? [];
  const edges: NonNullable<GraphSpec["edges"]> = spec.edges
    ? [...spec.edges]
    : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const constantUsage = new Map<string, number>();
  edges.forEach((edge: NonNullable<GraphSpec["edges"]>[number]) => {
    const source = nodeById.get(edge.from.node_id);
    if (source?.type === "constant") {
      constantUsage.set(source.id, (constantUsage.get(source.id) ?? 0) + 1);
    }
  });

  const updatedEdges: typeof edges = [];
  const constantsToRemove = new Set<string>();

  edges.forEach((edge: NonNullable<GraphSpec["edges"]>[number]) => {
    const source = nodeById.get(edge.from.node_id);
    if (
      source?.type === "constant" &&
      constantUsage.get(source.id) === 1 &&
      source.params &&
      Object.prototype.hasOwnProperty.call(source.params, "value")
    ) {
      const target = nodeById.get(edge.to.node_id);
      if (target) {
        const value = (source.params as { value?: unknown }).value;
        if (value !== undefined) {
          target.input_defaults = {
            ...(target.input_defaults ?? {}),
            [edge.to.input ?? "in"]: value,
          };
          nodeById.set(target.id, target);
          constantsToRemove.add(source.id);
          return;
        }
      }
    }
    updatedEdges.push(edge);
  });

  spec.nodes = nodes.filter((node) => !constantsToRemove.has(node.id));
  spec.edges = updatedEdges.length > 0 ? updatedEdges : undefined;
}
