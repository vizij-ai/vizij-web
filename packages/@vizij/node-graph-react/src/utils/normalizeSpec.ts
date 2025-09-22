/**
 * normalizeSpec
 * Thin wrapper for the normalizeGraphSpec helper from @vizij/node-graph-wasm.
 * Abstracting this behind our own function makes it easier to mock in tests and
 * to add additional normalization behavior later if needed.
 */

import { normalizeGraphSpec as wasmNormalizeGraphSpec } from "@vizij/node-graph-wasm";

export type GraphSpec = any;

/**
 * Normalize a graph spec into the canonical shape used by the Graph runtime.
 * Delegates to the WASM package's normalizeGraphSpec.
 */
export function normalizeSpec(spec: GraphSpec): GraphSpec {
  return wasmNormalizeGraphSpec(spec);
}
