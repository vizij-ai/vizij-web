import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export function getNodeGraphWasmInitInput(): Uint8Array {
  const wasmPath = resolve(
    here,
    "../../node_modules/@vizij/node-graph-wasm/dist/pkg/vizij_graph_wasm_bg.wasm",
  );

  const bytes = readFileSync(wasmPath);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
