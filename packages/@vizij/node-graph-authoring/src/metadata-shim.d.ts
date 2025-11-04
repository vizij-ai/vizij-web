declare module "@vizij/node-graph-wasm/metadata" {
  import type {
    Registry,
    NodeSignature,
    NodeType,
  } from "@vizij/node-graph-wasm";

  export function getNodeRegistry(): Registry;
  export function findNodeSignature(
    typeId: NodeType | string,
  ): NodeSignature | undefined;
  export function requireNodeSignature(
    typeId: NodeType | string,
  ): NodeSignature;
}
