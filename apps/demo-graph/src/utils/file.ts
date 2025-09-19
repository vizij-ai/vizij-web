export async function readFileAsText(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => {
      reject(new Error("Failed to read file"));
    };
    r.onload = () => {
      resolve(String(r.result ?? ""));
    };
    r.readAsText(file);
  });
}

/**
 * Parse a JSON string and coerce it to a runtime GraphSpec-like object.
 *
 * Accepts:
 * - GraphSpec { nodes: [...], edges: [...] }
 * - Editor shape { nodes: [...], edges: [...] }
 * - Minimal preset shape { n: [...], e: [...] } (from demo-node-graph presets)
 *
 * Returns the parsed object (caller may pass it to NodeGraphProvider or NodeGraphProvider.reload).
 * Throws an Error on parse/validation failure.
 */
export function parseGraphSpecJSON(text: string): any {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("Invalid JSON file");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("JSON does not contain an object");
  }

  const obj = parsed as Record<string, any>;

  // Already a GraphSpec-like object
  if (Array.isArray(obj.nodes) && Array.isArray(obj.edges)) {
    return { nodes: obj.nodes, edges: obj.edges };
  }

  // Preset shape from demo-node-graph: { n, e }
  if (Array.isArray(obj.n) && Array.isArray(obj.e)) {
    return { nodes: obj.n, edges: obj.e };
  }

  // Some exporters might wrap the spec under a top-level "spec" key
  if (obj.spec && typeof obj.spec === "object") {
    const s = obj.spec as Record<string, any>;
    if (Array.isArray(s.nodes) && Array.isArray(s.edges)) {
      return { nodes: s.nodes, edges: s.edges };
    }
  }

  throw new Error(
    "JSON does not contain a recognizable graph spec (expected nodes/edges arrays)",
  );
}
