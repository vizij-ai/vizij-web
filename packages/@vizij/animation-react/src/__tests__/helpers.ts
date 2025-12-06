import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export function getAnimationWasmInitInput(): Uint8Array {
  const wasmPath = resolve(
    here,
    "../../node_modules/@vizij/animation-wasm/dist/pkg/vizij_animation_wasm_bg.wasm",
  );

  const bytes = readFileSync(wasmPath);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
