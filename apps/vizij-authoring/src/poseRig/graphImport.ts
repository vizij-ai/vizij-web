import type { GraphSpec, NodeSpec } from "@vizij/node-graph";

type EdgeSpec = NonNullable<GraphSpec["edges"]>[number];

export interface PoseGraphOutputEntry {
  nodeId: string;
  path: string | null;
  inputId?: string | null;
}

export function remapPoseGraphInputs(
  spec: GraphSpec,
  nextFaceId: string,
): void {
  const nodes = (spec.nodes ?? []) as NodeSpec[];
  nodes.forEach((node) => {
    if (node.type !== "input") {
      return;
    }
    const params = node.params as { path?: string } | undefined;
    if (!params?.path) {
      return;
    }
    const updated = replaceRigFaceSegment(params.path, nextFaceId);
    if (updated !== params.path) {
      node.params = { ...(node.params ?? {}), path: updated };
    }
  });
}

export function listPoseGraphOutputs(spec: GraphSpec): PoseGraphOutputEntry[] {
  const nodes = (spec.nodes ?? []) as NodeSpec[];
  const selectors = new Map<string, string>();
  const edges = (spec.edges ?? []) as EdgeSpec[];
  edges.forEach((edge) => {
    if (!edge || typeof edge !== "object") {
      return;
    }
    const toNode = edge.to ?? null;
    if (!toNode?.node_id) {
      return;
    }
    const segments = edge.selector ?? [];
    if (!Array.isArray(segments) || segments.length === 0) {
      return;
    }
    const last = segments[segments.length - 1];
    if (last && typeof last.field === "string") {
      selectors.set(toNode.node_id, last.field);
    }
  });

  return nodes
    .filter((node) => node.type === "output")
    .map((node) => {
      const params = node.params as { path?: string } | undefined;
      return {
        nodeId: node.id,
        path: typeof params?.path === "string" ? params.path : null,
        inputId: selectors.get(node.id) ?? null,
      };
    });
}

export function updatePoseGraphOutputPath(
  spec: GraphSpec,
  nodeId: string,
  nextPath: string,
): void {
  const nodes = (spec.nodes ?? []) as NodeSpec[];
  const target = nodes.find((node) => node.id === nodeId);
  if (!target) {
    return;
  }
  target.params = { ...(target.params ?? {}), path: nextPath };
}

function replaceRigFaceSegment(path: string, nextFaceId: string): string {
  const normalized = path.trim();
  if (!normalized) {
    return path;
  }
  return normalized.replace(/rig\/(.+?)(?=\/)/, `rig/${nextFaceId}`);
}
