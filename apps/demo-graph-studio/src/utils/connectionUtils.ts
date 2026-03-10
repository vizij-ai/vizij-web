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

const VECTOR_TYPES = new Set(["vector", "vec", "vec2", "vec3", "vec4", "quat"]);
const FLOAT_TYPES = new Set(["f32", "float", "f64", "double"]);
const NUMERIC_POLYMORPHIC_INPUTS = new Map<
  string,
  { fixed?: readonly string[]; variadic?: readonly string[] }
>([
  ["abs", { fixed: ["in"] }],
  ["add", { variadic: ["operand"] }],
  ["centered_remap", { fixed: ["in"] }],
  ["clamp", { fixed: ["in", "min", "max"] }],
  ["cos", { fixed: ["in"] }],
  ["damp", { fixed: ["in"] }],
  ["divide", { fixed: ["lhs", "rhs"] }],
  ["log", { fixed: ["value", "base"] }],
  ["max", { variadic: ["operand"] }],
  ["min", { variadic: ["operand"] }],
  ["modulo", { fixed: ["lhs", "rhs"] }],
  ["multiply", { variadic: ["operand"] }],
  ["oscillator", { fixed: ["frequency", "phase"] }],
  ["piecewise_remap", { fixed: ["in"] }],
  ["power", { fixed: ["base", "exp"] }],
  ["remap", { fixed: ["in", "in_min", "in_max", "out_min", "out_max"] }],
  ["round", { fixed: ["in"] }],
  ["sign", { fixed: ["in"] }],
  ["sin", { fixed: ["in"] }],
  ["slew", { fixed: ["in"] }],
  ["spring", { fixed: ["in"] }],
  ["sqrt", { fixed: ["in"] }],
  ["subtract", { fixed: ["lhs", "rhs"] }],
  ["tan", { fixed: ["in"] }],
  ["vectoradd", { fixed: ["a", "b"] }],
  ["vectordot", { fixed: ["a", "b"] }],
  ["vectorindex", { fixed: ["v"] }],
  ["vectorlength", { fixed: ["in"] }],
  ["vectormax", { fixed: ["in"] }],
  ["vectormean", { fixed: ["in"] }],
  ["vectormedian", { fixed: ["in"] }],
  ["vectormin", { fixed: ["in"] }],
  ["vectormode", { fixed: ["in"] }],
  ["vectormultiply", { fixed: ["a", "b"] }],
  ["vectornormalize", { fixed: ["in"] }],
  ["vectorscale", { fixed: ["v"] }],
  ["vectorsubtract", { fixed: ["a", "b"] }],
]);

type NumericOutputInferenceRule = {
  outputs: readonly string[];
  fixed?: readonly string[];
  variadic?: readonly string[];
};

const NUMERIC_SCALAR_PASSTHROUGH_OUTPUTS = new Map<
  string,
  NumericOutputInferenceRule
>([
  ["abs", { outputs: ["out"], fixed: ["in"] }],
  ["add", { outputs: ["out"], variadic: ["operand"] }],
  ["centered_remap", { outputs: ["out"], fixed: ["in"] }],
  ["clamp", { outputs: ["out"], fixed: ["in", "min", "max"] }],
  ["cos", { outputs: ["out"], fixed: ["in"] }],
  ["damp", { outputs: ["out"], fixed: ["in"] }],
  ["divide", { outputs: ["out"], fixed: ["lhs", "rhs"] }],
  ["log", { outputs: ["out"], fixed: ["value", "base"] }],
  ["max", { outputs: ["out"], variadic: ["operand"] }],
  ["min", { outputs: ["out"], variadic: ["operand"] }],
  ["modulo", { outputs: ["out"], fixed: ["lhs", "rhs"] }],
  ["multiply", { outputs: ["out"], variadic: ["operand"] }],
  ["oscillator", { outputs: ["out"], fixed: ["frequency", "phase"] }],
  ["piecewise_remap", { outputs: ["out"], fixed: ["in"] }],
  ["power", { outputs: ["out"], fixed: ["base", "exp"] }],
  [
    "remap",
    {
      outputs: ["out"],
      fixed: ["in", "in_min", "in_max", "out_min", "out_max"],
    },
  ],
  ["round", { outputs: ["out"], fixed: ["in"] }],
  ["sign", { outputs: ["out"], fixed: ["in"] }],
  ["sin", { outputs: ["out"], fixed: ["in"] }],
  ["slew", { outputs: ["out"], fixed: ["in"] }],
  ["spring", { outputs: ["out"], fixed: ["in"] }],
  ["sqrt", { outputs: ["out"], fixed: ["in"] }],
  ["subtract", { outputs: ["out"], fixed: ["lhs", "rhs"] }],
  ["tan", { outputs: ["out"], fixed: ["in"] }],
  ["vectoradd", { outputs: ["out"], fixed: ["a", "b"] }],
  ["vectormultiply", { outputs: ["out"], fixed: ["a", "b"] }],
  ["vectornormalize", { outputs: ["out"], fixed: ["in"] }],
  ["vectorscale", { outputs: ["out"], fixed: ["v", "scalar"] }],
  ["vectorsubtract", { outputs: ["out"], fixed: ["a", "b"] }],
]);

type CompatibilityContext = {
  nodes?: readonly EditorNode[];
  edges?: readonly {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }[];
};

function isVectorFamily(type: string): boolean {
  return VECTOR_TYPES.has(type);
}

function isFloatFamily(type: string): boolean {
  return FLOAT_TYPES.has(type);
}

function matchesPortHandle(
  handle: string | null | undefined,
  exactIds: readonly string[] | undefined,
  variadicIds: readonly string[] | undefined,
): boolean {
  const resolvedHandle = (handle ?? "in").toLowerCase();
  if (exactIds?.some((id) => resolvedHandle === id.toLowerCase())) {
    return true;
  }
  return (
    variadicIds?.some((id) =>
      resolvedHandle.startsWith(`${id.toLowerCase()}_`),
    ) ?? false
  );
}

function resolveVariadicPort(
  ports: {
    variadicInputs?: { id?: string; type?: string } | null;
    variadicOutputs?: { id?: string; type?: string } | null;
  },
  handleId: string | null | undefined,
  direction: "input" | "output",
): string | null {
  if (!handleId) {
    return null;
  }
  const spec =
    direction === "input" ? ports.variadicInputs : ports.variadicOutputs;
  if (!spec?.id) {
    return null;
  }
  const prefix = `${spec.id}_`.toLowerCase();
  if (!handleId.toLowerCase().startsWith(prefix)) {
    return null;
  }
  const suffix = handleId.slice(prefix.length);
  if (!/^\d+$/.test(suffix)) {
    return null;
  }
  return String(spec.type ?? "any");
}

function allowsNumericShapePolymorphism(
  targetNodeType: string,
  targetHandle?: string | null,
): boolean {
  const config = NUMERIC_POLYMORPHIC_INPUTS.get(targetNodeType.toLowerCase());
  if (!config) {
    return false;
  }
  return matchesPortHandle(targetHandle, config.fixed, config.variadic);
}

function unwrapDefaultValue(value: unknown): unknown {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 1) {
    return value;
  }
  const inner = (value as Record<string, unknown>)[keys[0]!];
  return inner == null || typeof inner !== "object" ? inner : value;
}

function inferScalarLikeTypeFromValue(value: unknown): string | null {
  const unwrapped = unwrapDefaultValue(value);
  if (typeof unwrapped === "number") {
    return "float";
  }
  if (typeof unwrapped === "string" && unwrapped.trim().length > 0) {
    return Number.isFinite(Number(unwrapped)) ? "float" : null;
  }
  if (typeof unwrapped === "boolean") {
    return "bool";
  }
  return null;
}

function allowsScalarPassthroughOutput(
  nodeType: string,
  outputHandle: string | null,
): NumericOutputInferenceRule | null {
  const rule = NUMERIC_SCALAR_PASSTHROUGH_OUTPUTS.get(nodeType.toLowerCase());
  if (!rule) {
    return null;
  }
  return matchesPortHandle(outputHandle ?? "out", rule.outputs, undefined)
    ? rule
    : null;
}

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
  context: CompatibilityContext = {},
): { ok: boolean; reason?: string; suggestions?: Suggestion[] } {
  if (!sourceNode || !targetNode) {
    return { ok: false, reason: "Missing source or target node" };
  }
  try {
    const nodesSource =
      (registry && Array.isArray(registry.nodes)
        ? registry.nodes
        : registry &&
            registry.registry &&
            Array.isArray(registry.registry.nodes)
          ? registry.registry.nodes
          : []) ?? [];

    // Try to use registry.getPortsForType if available
    const typeForSource = (sourceNode.type ?? "").toString().toLowerCase();
    const typeForTarget = (targetNode.type ?? "").toString().toLowerCase();

    let srcPortType: string | null = null;
    let tgtPortType: string | null = null;

    if (typeof (registry as any).getPortsForType === "function") {
      const srcPorts = (registry as any).getPortsForType(typeForSource);
      const tgtPorts = (registry as any).getPortsForType(typeForTarget);
      if (sourceHandle && Array.isArray(srcPorts.outputs)) {
        const p = srcPorts.outputs.find(
          (o: any) => String(o.id) === String(sourceHandle),
        );
        srcPortType = String(
          p?.type ??
            resolveVariadicPort(srcPorts, sourceHandle, "output") ??
            "any",
        );
      }
      if (targetHandle && Array.isArray(tgtPorts.inputs)) {
        const p = tgtPorts.inputs.find(
          (i: any) => String(i.id) === String(targetHandle),
        );
        tgtPortType = String(
          p?.type ??
            resolveVariadicPort(tgtPorts, targetHandle, "input") ??
            "any",
        );
      }
    } else if (nodesSource.length > 0) {
      // Prefer provider helper shape if provided under registry.nodes
      const findNodeSchema = (typeId: string) =>
        nodesSource.find(
          (n: any) =>
            (n.type_id ?? n.id ?? "").toString().toLowerCase() ===
            typeId.toLowerCase(),
        );

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

    const resolveEffectiveOutputType = (
      node: EditorNode,
      handle: string | null | undefined,
      visited: Set<string>,
    ): string => {
      const nodeType = (node.type ?? "").toString().toLowerCase();
      const staticType = ((): string => {
        if (typeof (registry as any).getPortsForType !== "function") {
          return (
            (srcPortType ?? node.type ?? "").toString().toLowerCase() || "any"
          );
        }
        const ports = (registry as any).getPortsForType(nodeType);
        const port = handle
          ? ((Array.isArray(ports.outputs)
              ? ports.outputs.find((candidate: any) => candidate.id === handle)
              : null) ?? resolveVariadicPort(ports, handle, "output"))
          : null;
        return String(port?.type ?? "any").toLowerCase();
      })();

      if (!isVectorFamily(staticType) || !context.nodes || !context.edges) {
        return staticType;
      }

      const rule = allowsScalarPassthroughOutput(nodeType, handle ?? null);
      if (!rule) {
        return staticType;
      }

      const visitKey = `${node.id}:${handle ?? "out"}`;
      if (visited.has(visitKey)) {
        return staticType;
      }
      visited.add(visitKey);
      try {
        const resolvedInputTypes: string[] = [];
        context.edges.forEach((edge) => {
          if (edge.target !== node.id) {
            return;
          }
          if (
            !matchesPortHandle(
              edge.targetHandle ?? null,
              rule.fixed,
              rule.variadic,
            )
          ) {
            return;
          }
          const upstream = context.nodes?.find(
            (candidate) => candidate.id === edge.source,
          );
          if (!upstream) {
            return;
          }
          resolvedInputTypes.push(
            resolveEffectiveOutputType(
              upstream,
              edge.sourceHandle ?? null,
              visited,
            ),
          );
        });

        Object.entries((node.data as any)?.inputDefaults ?? {}).forEach(
          ([portId, value]) => {
            if (!matchesPortHandle(portId, rule.fixed, rule.variadic)) {
              return;
            }
            const inferred = inferScalarLikeTypeFromValue(value);
            if (inferred) {
              resolvedInputTypes.push(inferred);
            }
          },
        );

        if (resolvedInputTypes.length === 0) {
          return staticType;
        }
        if (resolvedInputTypes.some((type) => isVectorFamily(type))) {
          return staticType;
        }
        if (resolvedInputTypes.every((type) => isFloatFamily(type))) {
          return "float";
        }
        return staticType;
      } finally {
        visited.delete(visitKey);
      }
    };

    // If no explicit handle-level type found, fall back to node type ids
    const finalSrcType =
      resolveEffectiveOutputType(sourceNode, sourceHandle ?? null, new Set()) ||
      (srcPortType ?? sourceNode.type ?? "").toString().toLowerCase() ||
      "any";
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
    if (
      ((isFloatFamily(finalSrcType) && isVectorFamily(finalTgtType)) ||
        (isVectorFamily(finalSrcType) && isFloatFamily(finalTgtType))) &&
      allowsNumericShapePolymorphism(typeForTarget, targetHandle)
    ) {
      return { ok: true };
    }

    // If types differ, provide suggestion stubs: attempt to find simple converter nodes in registry
    const suggestions: Suggestion[] = [];
    if (nodesSource.length > 0) {
      // Look for nodes that have single input of finalSrcType and single output of finalTgtType
      for (const n of nodesSource) {
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
