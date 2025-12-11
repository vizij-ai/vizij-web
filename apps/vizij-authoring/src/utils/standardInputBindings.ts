import type { VizijBundleExtension } from "@vizij/render";
import { deriveStandardRigInputIdFromPath, normalizeStandardRigInputPath } from "@vizij/utils";

/**
 * Represents a standard input's binding status in a rig graph.
 */
export interface StandardInputBindingInfo {
  /** The input ID (e.g., "standard_left_eye_pos_x") */
  inputId: string;
  /** The full path (e.g., "/standard/left_eye/pos/x") */
  path: string;
  /** The node ID in the graph (e.g., "input_standard_left_eye_pos_x") */
  nodeId: string;
  /** Whether this input has outgoing edges (bindings) */
  hasBinding: boolean;
  /** Number of outgoing connections */
  connectionCount: number;
}

interface GraphNode {
  id: string;
  type: string;
  params?: {
    path?: string;
    [key: string]: unknown;
  };
}

interface GraphEdge {
  from: {
    node_id: string;
    output?: string;
  };
  to: {
    node_id: string;
    input?: string;
  };
}

interface GraphSpec {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
  metadata?: {
    vizij?: {
      faceId?: string;
      [key: string]: unknown;
    };
  };
}

/**
 * Extracts standard input binding information from a graph spec.
 * Identifies which standard input nodes have outgoing edges (bindings).
 */
export function analyzeStandardInputBindings(
  graphSpec: GraphSpec | null | undefined,
): Map<string, StandardInputBindingInfo> {
  const result = new Map<string, StandardInputBindingInfo>();

  if (!graphSpec?.nodes || !graphSpec?.edges) {
    return result;
  }

  // Build a set of node IDs that have outgoing edges
  const nodesWithOutgoingEdges = new Map<string, number>();
  for (const edge of graphSpec.edges) {
    const fromNodeId = edge.from?.node_id;
    if (fromNodeId) {
      nodesWithOutgoingEdges.set(
        fromNodeId,
        (nodesWithOutgoingEdges.get(fromNodeId) ?? 0) + 1,
      );
    }
  }

  // Find all standard input nodes and check if they have bindings
  for (const node of graphSpec.nodes) {
    if (node.type !== "input") {
      continue;
    }

    const path = node.params?.path;
    if (!path || typeof path !== "string") {
      continue;
    }

    // Check if this is a standard input path
    if (!path.includes("/standard/")) {
      continue;
    }

    // Extract the standard input part of the path (e.g., "rig/face_id/standard/left_eye/pos/x" -> "/standard/left_eye/pos/x")
    const standardMatch = path.match(/(\/standard\/.+)$/);
    if (!standardMatch) {
      continue;
    }

    const standardPath = normalizeStandardRigInputPath(standardMatch[1]);
    const connectionCount = nodesWithOutgoingEdges.get(node.id) ?? 0;
    const hasBinding = connectionCount > 0;

    // Derive input ID using the same logic as STANDARD_RIG_INPUTS
    const inputId = deriveStandardRigInputIdFromPath(standardPath);

    result.set(inputId, {
      inputId,
      path: standardPath,
      nodeId: node.id,
      hasBinding,
      connectionCount,
    });
  }

  return result;
}

/**
 * Extracts binding information from a VizijBundleExtension.
 * Looks for rig graphs and analyzes their standard input bindings.
 */
export function extractBindingsFromBundle(
  bundle: VizijBundleExtension | null | undefined,
): Map<string, StandardInputBindingInfo> {
  if (!bundle?.graphs?.length) {
    return new Map();
  }

  // Find the rig graph (usually kind === "rig")
  const rigGraph = bundle.graphs.find((g) => g.kind === "rig");

  if (!rigGraph?.spec) {
    // Fallback to first graph if no rig graph found
    const firstGraph = bundle.graphs[0];
    if (!firstGraph?.spec) {
      return new Map();
    }
    return analyzeStandardInputBindings(firstGraph.spec as GraphSpec);
  }

  return analyzeStandardInputBindings(rigGraph.spec as GraphSpec);
}

/**
 * Creates a Set of input IDs that have bindings.
 */
export function getInputIdsWithBindings(
  bindings: Map<string, StandardInputBindingInfo>,
): Set<string> {
  const result = new Set<string>();
  for (const [inputId, info] of bindings) {
    if (info.hasBinding) {
      result.add(inputId);
    }
  }
  return result;
}
