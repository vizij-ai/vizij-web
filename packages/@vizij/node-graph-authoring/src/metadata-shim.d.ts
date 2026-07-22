declare module "@vizij/node-graph/metadata" {
  import type { Registry, NodeSignature, NodeType } from "@vizij/node-graph";

  export function getNodeRegistry(): Registry;
  export function findNodeSignature(
    typeId: NodeType | string,
  ): NodeSignature | undefined;
  export function requireNodeSignature(
    typeId: NodeType | string,
  ): NodeSignature;
  export function listNodeTypeIds(): NodeType[];
  export const nodeRegistryVersion: string;
}
