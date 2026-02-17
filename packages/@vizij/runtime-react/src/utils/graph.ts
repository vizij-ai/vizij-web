import type { GraphRegistrationConfig } from "@vizij/orchestrator-react";

type GraphLikeNode = {
  id?: string;
  type?: string;
  kind?: string;
  params?: {
    path?: string;
  };
  path?: string;
};

function getNodeKind(node: GraphLikeNode): string {
  return String(node.type ?? node.kind ?? "").toLowerCase();
}

function getNodePath(node: GraphLikeNode): string {
  return String(node.params?.path ?? node.path ?? "").trim();
}

function getNodes(spec: GraphRegistrationConfig["spec"]): GraphLikeNode[] {
  if (!spec || typeof spec !== "object") {
    return [];
  }
  const maybeNodes = (spec as Record<string, unknown>).nodes;
  if (!Array.isArray(maybeNodes)) {
    return [];
  }
  return maybeNodes as GraphLikeNode[];
}

export function collectOutputPaths(
  spec: GraphRegistrationConfig["spec"],
): string[] {
  const nodes = getNodes(spec);
  const outputs = new Set<string>();
  nodes.forEach((node) => {
    if (typeof node !== "object" || !node) {
      return;
    }
    if (getNodeKind(node) !== "output") {
      return;
    }
    const path = getNodePath(node);
    if (path) {
      outputs.add(path.trim());
    }
  });
  return Array.from(outputs);
}

export function collectInputPaths(
  spec: GraphRegistrationConfig["spec"],
): string[] {
  const nodes = getNodes(spec);
  const inputs = new Set<string>();
  nodes.forEach((node) => {
    if (getNodeKind(node) !== "input") {
      return;
    }
    const path = getNodePath(node);
    if (path) {
      inputs.add(path.trim());
    }
  });
  return Array.from(inputs);
}

export function collectInputPathMap(
  spec: GraphRegistrationConfig["spec"],
): Record<string, string> {
  const map: Record<string, string> = {};
  const nodes = getNodes(spec);
  nodes.forEach((node) => {
    if (getNodeKind(node) !== "input") {
      return;
    }
    const path = getNodePath(node);
    if (!path) {
      return;
    }
    const id = String(node.id ?? "");
    const key = id.startsWith("input_")
      ? id.slice("input_".length)
      : id || path.trim();
    map[key] = path.trim();
  });
  return map;
}
