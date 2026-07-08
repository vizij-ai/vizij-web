import type { PortSpec, VariadicSpec } from "../contexts/RegistryProvider";
import {
  OUTPUT_TARGET_TYPE,
  OUTPUT_TARGET_PORT_ID,
  OUTPUT_TARGET_PORT_TYPE,
} from "../components/OutputTargetNode";
import {
  INPUT_SOURCE_TYPE,
  INPUT_SOURCE_PORT_ID,
  INPUT_SOURCE_PORT_TYPE,
} from "../components/InputSourceNode";

const VECTOR_TYPES = new Set(["vector", "vec", "vec2", "vec3", "vec4", "quat"]);
const FLOAT_TYPES = new Set(["f32", "float", "f64", "double"]);
const INT_TYPES = new Set(["i32", "int", "integer"]);

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

type PortsForType = {
  inputs: PortSpec[];
  outputs: PortSpec[];
  variadicInputs?: VariadicSpec | null;
  variadicOutputs?: VariadicSpec | null;
};

type Registry = {
  getPortsForType: (typeId: string) => PortsForType;
};

type GraphNodeLike = {
  id: string;
  type?: string | null;
  data?: {
    inputDefaults?: Record<string, unknown>;
  };
};

type GraphEdgeLike = {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
};

type CompatibilityContext = {
  sourceNodeId?: string | null;
  nodes?: readonly GraphNodeLike[];
  edges?: readonly GraphEdgeLike[];
};

function isVectorFamily(type: string): boolean {
  return VECTOR_TYPES.has(type);
}

function isFloatFamily(type: string): boolean {
  return FLOAT_TYPES.has(type);
}

function isIntFamily(type: string): boolean {
  return INT_TYPES.has(type);
}

function matchesPortHandle(
  handle: string | null,
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

function allowsNumericShapePolymorphism(
  targetNodeType: string,
  targetHandle: string | null,
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

/**
 * Try to resolve a handle ID as a variadic port instance.
 * Variadic ports have IDs like `operand_0`, `operand_1`, etc.
 */
function resolveVariadicPort(
  ports: PortsForType,
  handleId: string,
  direction: "input" | "output",
): PortSpec | null {
  const spec =
    direction === "input" ? ports.variadicInputs : ports.variadicOutputs;
  if (!spec?.id) return null;
  const prefix = spec.id + "_";
  if (!handleId.startsWith(prefix)) return null;
  const suffix = handleId.slice(prefix.length);
  if (!/^\d+$/.test(suffix)) return null;
  return { id: handleId, name: handleId, type: spec.type, direction };
}

function resolveSourcePorts(
  registry: Registry,
  sourceNodeType: string,
): PortsForType {
  if (sourceNodeType === INPUT_SOURCE_TYPE) {
    return {
      inputs: [],
      outputs: [
        {
          id: INPUT_SOURCE_PORT_ID,
          name: "output",
          type: INPUT_SOURCE_PORT_TYPE,
          direction: "output" as const,
        },
      ],
    };
  }
  return registry.getPortsForType(sourceNodeType);
}

function resolveStaticOutputType(
  ports: PortsForType,
  handle: string | null,
): { id: string | null; type: string } {
  const port = handle
    ? (ports.outputs.find((candidate) => candidate.id === handle) ??
      resolveVariadicPort(ports, handle, "output"))
    : null;
  return {
    id: port?.id ?? handle,
    type: (port?.type ?? "any").toLowerCase(),
  };
}

function resolveEffectiveOutputType(
  registry: Registry,
  nodeType: string,
  handle: string | null,
  context: CompatibilityContext,
  visited: Set<string>,
): string {
  const ports = resolveSourcePorts(registry, nodeType);
  const staticOutput = resolveStaticOutputType(ports, handle);
  if (
    !isVectorFamily(staticOutput.type) ||
    !context.sourceNodeId ||
    !context.nodes ||
    !context.edges
  ) {
    return staticOutput.type;
  }

  const rule = allowsScalarPassthroughOutput(nodeType, staticOutput.id);
  if (!rule) {
    return staticOutput.type;
  }

  const visitKey = `${context.sourceNodeId}:${staticOutput.id ?? "out"}`;
  if (visited.has(visitKey)) {
    return staticOutput.type;
  }

  visited.add(visitKey);
  try {
    const node = context.nodes.find(
      (candidate) => candidate.id === context.sourceNodeId,
    );
    if (!node) {
      return staticOutput.type;
    }

    const resolvedInputTypes: string[] = [];
    context.edges.forEach((edge) => {
      if (edge.target !== node.id) {
        return;
      }
      if (
        !matchesPortHandle(edge.targetHandle ?? null, rule.fixed, rule.variadic)
      ) {
        return;
      }
      const sourceNode = context.nodes?.find(
        (candidate) => candidate.id === edge.source,
      );
      if (!sourceNode?.type) {
        return;
      }
      resolvedInputTypes.push(
        resolveEffectiveOutputType(
          registry,
          String(sourceNode.type),
          edge.sourceHandle ?? null,
          {
            ...context,
            sourceNodeId: edge.source,
          },
          visited,
        ),
      );
    });

    Object.entries(node.data?.inputDefaults ?? {}).forEach(
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
      return staticOutput.type;
    }
    if (resolvedInputTypes.some((type) => isVectorFamily(type))) {
      return staticOutput.type;
    }
    if (resolvedInputTypes.every((type) => isFloatFamily(type))) {
      return "float";
    }
    return staticOutput.type;
  } finally {
    visited.delete(visitKey);
  }
}

export function checkConnectionCompatibility(
  registry: Registry,
  sourceNodeType: string,
  targetNodeType: string,
  sourceHandle: string | null,
  targetHandle: string | null,
  context: CompatibilityContext = {},
): { ok: boolean; reason?: string } {
  // Output targets are input-only sinks - they cannot be connection sources
  if (sourceNodeType === OUTPUT_TARGET_TYPE) {
    return { ok: false, reason: "Output targets cannot be connection sources" };
  }
  // Input sources are output-only - they cannot be connection targets
  if (targetNodeType === INPUT_SOURCE_TYPE) {
    return { ok: false, reason: "Input sources cannot be connection targets" };
  }

  const srcPorts = resolveSourcePorts(registry, sourceNodeType);

  const tgtPorts: PortsForType =
    targetNodeType === OUTPUT_TARGET_TYPE
      ? {
          inputs: [
            {
              id: OUTPUT_TARGET_PORT_ID,
              name: "input",
              type: OUTPUT_TARGET_PORT_TYPE,
              direction: "input" as const,
            },
          ],
          outputs: [],
        }
      : registry.getPortsForType(targetNodeType);

  const srcPort = sourceHandle
    ? (srcPorts.outputs.find((p) => p.id === sourceHandle) ??
      resolveVariadicPort(srcPorts, sourceHandle, "output"))
    : null;
  const tgtPort = targetHandle
    ? (tgtPorts.inputs.find((p) => p.id === targetHandle) ??
      resolveVariadicPort(tgtPorts, targetHandle, "input"))
    : null;

  const srcType = resolveEffectiveOutputType(
    registry,
    sourceNodeType,
    srcPort?.id ?? sourceHandle,
    context,
    new Set<string>(),
  );
  const tgtType = (tgtPort?.type ?? "any").toLowerCase();

  if (srcType === "any" || tgtType === "any") {
    return { ok: true };
  }
  if (srcType === tgtType) {
    return { ok: true };
  }
  if (isFloatFamily(srcType) && isFloatFamily(tgtType)) {
    return { ok: true };
  }
  if (isIntFamily(srcType) && isIntFamily(tgtType)) {
    return { ok: true };
  }
  if (isVectorFamily(srcType) && isVectorFamily(tgtType)) {
    return { ok: true };
  }
  if (
    ((isFloatFamily(srcType) && isVectorFamily(tgtType)) ||
      (isVectorFamily(srcType) && isFloatFamily(tgtType))) &&
    allowsNumericShapePolymorphism(targetNodeType, tgtPort?.id ?? targetHandle)
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Incompatible types: ${srcType} → ${tgtType}`,
  };
}
