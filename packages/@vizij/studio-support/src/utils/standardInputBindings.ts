import type { VizijBundleExtension } from "@vizij/render";
import {
  deriveStandardRigInputIdFromPath,
  normalizeStandardRigInputPath,
} from "@vizij/utils";

export interface StandardInputBindingInfo {
  inputId: string;
  path: string;
  nodeId: string;
  hasBinding: boolean;
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

interface StandardInputBindingGraphSpec {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
}

export function analyzeStandardInputBindings(
  graphSpec: StandardInputBindingGraphSpec | null | undefined,
): Map<string, StandardInputBindingInfo> {
  const result = new Map<string, StandardInputBindingInfo>();

  if (!graphSpec?.nodes || !graphSpec?.edges) {
    return result;
  }

  const outgoingEdgeCounts = new Map<string, number>();
  for (const edge of graphSpec.edges) {
    const fromNodeId = edge.from?.node_id;
    if (fromNodeId) {
      outgoingEdgeCounts.set(
        fromNodeId,
        (outgoingEdgeCounts.get(fromNodeId) ?? 0) + 1,
      );
    }
  }

  for (const node of graphSpec.nodes) {
    if (node.type !== "input") {
      continue;
    }

    const path = node.params?.path;
    if (!path || typeof path !== "string" || !path.includes("/standard/")) {
      continue;
    }

    const standardMatch = path.match(/(\/standard\/.+)$/);
    if (!standardMatch) {
      continue;
    }

    const standardPath = normalizeStandardRigInputPath(standardMatch[1]);
    const connectionCount = outgoingEdgeCounts.get(node.id) ?? 0;
    const inputId = deriveStandardRigInputIdFromPath(standardPath);

    result.set(inputId, {
      inputId,
      path: standardPath,
      nodeId: node.id,
      hasBinding: connectionCount > 0,
      connectionCount,
    });
  }

  return result;
}

export function extractBindingsFromBundle(
  bundle: VizijBundleExtension | null | undefined,
): Map<string, StandardInputBindingInfo> {
  if (!bundle?.graphs?.length) {
    return new Map();
  }

  const rigGraph =
    bundle.graphs.find((entry) => entry.kind === "rig") ?? bundle.graphs[0];
  if (!rigGraph?.spec) {
    return new Map();
  }

  return analyzeStandardInputBindings(
    rigGraph.spec as StandardInputBindingGraphSpec,
  );
}

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
