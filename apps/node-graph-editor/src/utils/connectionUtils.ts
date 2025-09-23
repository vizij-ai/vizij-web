import type { EditorNode } from "../store/useEditorStore";

/**
 * connectionUtils
 * - contains helper to validate compatibility between a source node output and a target node input.
 *
 * Implementations:
 * - isConnectionCompatible: existing fallback used where registry is not available
 * - isConnectionCompatibleWithRegistry: schema-aware check that uses registry helpers (best-effort)
 */

export type Suggestion = {
  title: string;
  detail?: string;
};

export function isConnectionCompatible(
  sourceNode: EditorNode | undefined,
  targetNode: EditorNode | undefined,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): { ok: boolean; reason?: string; suggestions?: Suggestion[] } {
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: "Missing source or target node" };
  }

  const srcType = (sourceNode.type ?? "").toString().toLowerCase();
  const tgtType = (targetNode.type ?? "").toString().toLowerCase();

  if (!srcType || !tgtType) {
    return { ok: false, reason: "Unknown node type" };
  }

  // If target handle explicitly accepts "any" (handle naming convention), allow.
  if ((targetHandle ?? "").toLowerCase().includes("any")) {
    return { ok: true };
  }

  // If either node type contains 'constant' or 'output' allow (simple rule)
  if (srcType.includes("constant") || tgtType.includes("output")) {
    return { ok: true };
  }

  // Allow identical-type wiring as a fallback
  if (srcType === tgtType) {
    return { ok: true };
  }

  // Not compatible by these simple rules
  return {
    ok: false,
    reason: `Incompatible types: source (${srcType}) → target (${tgtType})`,
  };
}

/**
 * Schema-aware compatibility check using registry information.
 * - registry is the object returned by RegistryProvider (may have nodes array and other helpers)
 * - This is a pure function (no hooks); call from components that have access to registry.
 */
export function isConnectionCompatibleWithRegistry(
  registry: any,
  sourceNode: EditorNode | undefined,
  targetNode: EditorNode | undefined,
  sourceHandle?: string | null,
  targetHandle?: string | null,
): { ok: boolean; reason?: string; suggestions?: Suggestion[] } {
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: "Missing source or target node" };
  }
  try {
    // Try to use registry.getPortsForType if available
    const typeForSource = (sourceNode.type ?? "").toString().toLowerCase();
    const typeForTarget = (targetNode.type ?? "").toString().toLowerCase();

    let srcPortType: string | null = null;
    let tgtPortType: string | null = null;

    if (registry && typeof registry.nodes !== "undefined") {
      // Prefer provider helper shape if provided under registry.nodes
      const findNodeSchema = (typeId: string) =>
        Array.isArray(registry.nodes)
          ? registry.nodes.find(
              (n: any) =>
                (n.type_id ?? n.id ?? "").toString().toLowerCase() ===
                typeId.toLowerCase(),
            )
          : null;

      if (typeof (registry as any).getPortsForType === "function") {
        const srcPorts = (registry as any).getPortsForType(typeForSource);
        const tgtPorts = (registry as any).getPortsForType(typeForTarget);
        if (sourceHandle && Array.isArray(srcPorts.outputs)) {
          const p = srcPorts.outputs.find(
            (o: any) => String(o.id) === String(sourceHandle),
          );
          if (p) srcPortType = String(p.type ?? "any");
        }
        if (targetHandle && Array.isArray(tgtPorts.inputs)) {
          const p = tgtPorts.inputs.find(
            (i: any) => String(i.id) === String(targetHandle),
          );
          if (p) tgtPortType = String(p.type ?? "any");
        }
      } else {
        // Fallback: inspect node schema directly if available
        const srcSchema = findNodeSchema(typeForSource);
        const tgtSchema = findNodeSchema(typeForTarget);
        if (srcSchema && Array.isArray(srcSchema.outputs) && sourceHandle) {
          const p = srcSchema.outputs.find(
            (o: any) => String(o.id) === String(sourceHandle),
          );
          if (p) srcPortType = String(p.type ?? p.data_type ?? "any");
        }
        if (tgtSchema && Array.isArray(tgtSchema.inputs) && targetHandle) {
          const p = tgtSchema.inputs.find(
            (i: any) => String(i.id) === String(targetHandle),
          );
          if (p) tgtPortType = String(p.type ?? p.data_type ?? "any");
        }
      }
    }

    // If no explicit handle-level type found, fall back to node type ids
    const finalSrcType =
      (srcPortType ?? sourceNode.type ?? "").toString().toLowerCase() || "any";
    const finalTgtType =
      (tgtPortType ?? targetNode.type ?? "").toString().toLowerCase() || "any";

    // Accept wildcard
    if ((targetHandle ?? "").toLowerCase().includes("any")) {
      return { ok: true };
    }

    // constants / outputs allowed
    if (
      String(sourceNode.type ?? "")
        .toLowerCase()
        .includes("constant") ||
      String(targetNode.type ?? "")
        .toLowerCase()
        .includes("output")
    ) {
      return { ok: true };
    }

    // identical types ok
    if (finalSrcType === finalTgtType) {
      return { ok: true };
    }

    // If types differ, provide suggestion stubs: attempt to find simple converter nodes in registry
    const suggestions: Suggestion[] = [];
    if (registry && Array.isArray(registry.nodes)) {
      // Look for nodes that have single input of finalSrcType and single output of finalTgtType
      for (const n of registry.nodes) {
        const norm = (function (s: any) {
          const inputs: any[] = Array.isArray(s.inputs)
            ? s.inputs
            : Array.isArray(s.ports)
              ? s.ports.filter(
                  (p: any) =>
                    (p.direction ?? p.dir ?? "").toString().toLowerCase() !==
                    "output",
                )
              : [];
          const outputs: any[] = Array.isArray(s.outputs)
            ? s.outputs
            : Array.isArray(s.ports)
              ? s.ports.filter(
                  (p: any) =>
                    (p.direction ?? p.dir ?? "").toString().toLowerCase() ===
                    "output",
                )
              : [];
          return { inputs, outputs };
        })(n);
        if (Array.isArray(norm.inputs) && Array.isArray(norm.outputs)) {
          if (
            norm.inputs.some(
              (i: any) =>
                String(i.type ?? i.data_type ?? "any").toLowerCase() ===
                finalSrcType,
            ) &&
            norm.outputs.some(
              (o: any) =>
                String(o.type ?? o.data_type ?? "any").toLowerCase() ===
                finalTgtType,
            )
          ) {
            suggestions.push({
              title: `Insert conversion node: ${n.type_id ?? n.id}`,
              detail: `Use ${n.type_id ?? n.id} to convert ${finalSrcType} → ${finalTgtType}`,
            });
            // limit suggestions
            if (suggestions.length >= 3) break;
          }
        }
      }
    }

    return {
      ok: false,
      reason: `Incompatible types: ${finalSrcType} → ${finalTgtType}`,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  } catch (err: any) {
    // On any failure, return a conservative rejection with reason
    return {
      ok: false,
      reason: `Compatibility check failed: ${err?.message ?? String(err)}`,
    };
  }
}
