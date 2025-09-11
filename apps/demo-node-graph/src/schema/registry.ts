/**
 * Lightweight schema access without relying on types being exported by @vizij/node-graph-wasm.
 * Falls back to calling the raw wasm export get_node_schemas_json() if the wrapper export
 * getNodeSchemas() is not available in the installed package version.
 */

import * as GraphWasm from "@vizij/node-graph-wasm";

// Minimal local types (only the parts we need for labels)
type PortSpecLite = { id: string; label: string };
type NodeSignatureLite = {
  type_id: string;
  name: string;
  category: string;
  inputs: PortSpecLite[];
  outputs: PortSpecLite[];
};
type RegistryLite = {
  version: string;
  nodes: NodeSignatureLite[];
};

// Lazy-loaded, shared registry promise
let _registryPromise: Promise<RegistryLite> | null = null;

async function getNodeSchemasAny(): Promise<RegistryLite> {
  const gw = GraphWasm as any;
  if (typeof gw.getNodeSchemas === "function") {
    // Wrapper export path
    return (await gw.getNodeSchemas()) as RegistryLite;
  }
  if (typeof gw.get_node_schemas_json === "function") {
    // Raw wasm export path
    const raw = gw.get_node_schemas_json();
    return JSON.parse(raw) as RegistryLite;
  }
  throw new Error(
    "@vizij/node-graph-wasm does not expose getNodeSchemas or get_node_schemas_json; ensure you are using the updated package."
  );
}

/**
 * Ensure the node schema registry is loaded (once) and return it.
 */
export function loadRegistry(): Promise<RegistryLite> {
  if (!_registryPromise) {
    _registryPromise = getNodeSchemasAny();
  }
  return _registryPromise;
}

/**
 * Find the NodeSignature for a given type_id (lowercase NodeType string).
 */
export async function getNodeSignature(
  typeId: string
): Promise<NodeSignatureLite | undefined> {
  const reg = await loadRegistry();
  return reg.nodes.find((n: NodeSignatureLite) => n.type_id === typeId);
}

/**
 * Look up a port label from the registry for a given node type.
 * io: "inputs" | "outputs"
 */
export async function getPortLabel(
  typeId: string,
  portId: string,
  io: "inputs" | "outputs"
): Promise<string | undefined> {
  const sig = await getNodeSignature(typeId);
  if (!sig) return undefined;
  const list = io === "inputs" ? sig.inputs : sig.outputs;
  const match = list.find((p: PortSpecLite) => p.id === portId);
  return match?.label;
}
