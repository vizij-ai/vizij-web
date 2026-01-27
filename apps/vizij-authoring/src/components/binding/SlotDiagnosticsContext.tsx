import { createContext, useCallback, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import type { MachineReport } from "@vizij/node-graph-authoring";
import { createSlotKey } from "./slotKeys";

export interface SlotDiagnosticsNode {
  id: string;
  label: string;
  type: string;
  category?: string;
  distance?: number;
}

export interface SlotDiagnostics {
  metadata?: MachineReport["summary"]["bindings"][number]["metadata"];
  upstreamNodes: SlotDiagnosticsNode[];
  downstreamNodes: SlotDiagnosticsNode[];
  expressionNode?: SlotDiagnosticsNode;
  nodeId?: string;
  expressionNodeId?: string;
}

type SlotDiagnosticsContextValue = {
  resolveSlotDiagnostics: (
    targetId: string,
    slotId?: string | null,
  ) => SlotDiagnostics | undefined;
};

const SlotDiagnosticsContext =
  createContext<SlotDiagnosticsContextValue | null>(null);

type MachineReportNode = NonNullable<MachineReport["irGraph"]>["nodes"][number];

function describeMachineNode(node?: MachineReportNode): SlotDiagnosticsNode {
  if (!node) {
    return {
      id: "unknown",
      label: "Unknown node",
      type: "unknown",
    };
  }
  const registryName = node.annotations?.registry?.name;
  const label =
    (typeof node.label === "string" && node.label.trim().length > 0
      ? node.label.trim()
      : registryName && registryName.trim().length > 0
        ? registryName.trim()
        : undefined) ?? node.type;
  return {
    id: node.id,
    label,
    type: node.type,
    category: node.annotations?.registry?.category ?? node.category,
  };
}

type NodeAdjacency = Map<string, Set<string>>;

function buildSlotDiagnosticsLookup(
  report: MachineReport | null,
): Map<string, SlotDiagnostics> | null {
  if (!report) {
    return null;
  }
  const diagnostics = new Map<string, SlotDiagnostics>();
  const inboundEdges: NodeAdjacency = new Map();
  const outboundEdges: NodeAdjacency = new Map();
  const nodeIndex = new Map<string, MachineReportNode>();

  if (report.irGraph) {
    report.irGraph.nodes.forEach((node) => {
      nodeIndex.set(node.id, node);
    });
    report.irGraph.edges.forEach((edge) => {
      const sourceId = edge.from?.nodeId;
      const targetId = edge.to?.nodeId;
      if (!sourceId || !targetId) {
        return;
      }
      if (!outboundEdges.has(sourceId)) {
        outboundEdges.set(sourceId, new Set<string>());
      }
      outboundEdges.get(sourceId)!.add(targetId);
      if (!inboundEdges.has(targetId)) {
        inboundEdges.set(targetId, new Set<string>());
      }
      inboundEdges.get(targetId)!.add(sourceId);
    });
  }

  report.summary.bindings.forEach((binding) => {
    const normalizedSlotId = binding.slotId?.trim();
    if (!normalizedSlotId) {
      return;
    }
    const expressionNodeId = binding.expressionNodeId ?? binding.nodeId;
    const expressionNode = expressionNodeId
      ? describeMachineNode(nodeIndex.get(expressionNodeId))
      : undefined;
    const upstreamNodes =
      expressionNodeId && inboundEdges.size > 0
        ? collectReachableNodes(
            expressionNodeId,
            inboundEdges,
            nodeIndex,
            "upstream",
          )
        : [];
    const downstreamNodes =
      expressionNodeId && outboundEdges.size > 0
        ? collectReachableNodes(
            expressionNodeId,
            outboundEdges,
            nodeIndex,
            "downstream",
          )
        : [];
    diagnostics.set(createSlotKey(binding.targetId, normalizedSlotId), {
      metadata: binding.metadata,
      upstreamNodes,
      downstreamNodes,
      expressionNode,
      nodeId: binding.nodeId,
      expressionNodeId,
    });
  });

  return diagnostics;
}

function collectReachableNodes(
  startId: string,
  adjacency: NodeAdjacency,
  nodeIndex: Map<string, MachineReportNode>,
  direction: "upstream" | "downstream",
  maxDepth = 8,
): SlotDiagnosticsNode[] {
  if (!adjacency.has(startId)) {
    return [];
  }
  const queue: Array<{ id: string; depth: number }> = [
    { id: startId, depth: 0 },
  ];
  const visited = new Set<string>();
  const nodes: Array<SlotDiagnosticsNode & { distance: number }> = [];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth >= maxDepth) {
      continue;
    }
    const neighbors = adjacency.get(id);
    if (!neighbors) {
      continue;
    }
    const nextDepth = depth + 1;
    neighbors.forEach((neighborId) => {
      if (visited.has(neighborId) || neighborId === startId) {
        return;
      }
      visited.add(neighborId);
      const node = describeMachineNode(nodeIndex.get(neighborId));
      nodes.push({
        ...node,
        distance: nextDepth,
      });
      queue.push({ id: neighborId, depth: nextDepth });
    });
  }

  nodes.sort((a, b) => {
    const distanceA = a.distance ?? 0;
    const distanceB = b.distance ?? 0;
    if (direction === "upstream") {
      return distanceB - distanceA;
    }
    return distanceA - distanceB;
  });

  return nodes;
}

export function SlotDiagnosticsProvider({
  report,
  children,
}: {
  report: MachineReport | null;
  children: ReactNode;
}) {
  const lookup = useMemo(() => buildSlotDiagnosticsLookup(report), [report]);

  const resolveSlotDiagnostics = useCallback(
    (targetId: string, slotId?: string | null) => {
      if (!lookup || !slotId) {
        return undefined;
      }
      const trimmed = slotId.trim();
      if (!trimmed) {
        return undefined;
      }
      return lookup.get(createSlotKey(targetId, trimmed));
    },
    [lookup],
  );

  const value = useMemo(
    () => ({ resolveSlotDiagnostics }),
    [resolveSlotDiagnostics],
  );

  return (
    <SlotDiagnosticsContext.Provider value={value}>
      {children}
    </SlotDiagnosticsContext.Provider>
  );
}

export function useSlotDiagnosticsResolver() {
  return useContext(SlotDiagnosticsContext)?.resolveSlotDiagnostics;
}
