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

function isVectorFamily(type: string): boolean {
  return VECTOR_TYPES.has(type);
}

function isFloatFamily(type: string): boolean {
  return FLOAT_TYPES.has(type);
}

function isIntFamily(type: string): boolean {
  return INT_TYPES.has(type);
}

type PortsForType = {
  inputs: PortSpec[];
  outputs: PortSpec[];
  variadicInputs?: VariadicSpec | null;
  variadicOutputs?: VariadicSpec | null;
};

type Registry = {
  getPortsForType: (typeId: string) => PortsForType;
};

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

export function checkConnectionCompatibility(
  registry: Registry,
  sourceNodeType: string,
  targetNodeType: string,
  sourceHandle: string | null,
  targetHandle: string | null,
): { ok: boolean; reason?: string } {
  // Output targets are input-only sinks — they cannot be connection sources
  if (sourceNodeType === OUTPUT_TARGET_TYPE) {
    return { ok: false, reason: "Output targets cannot be connection sources" };
  }
  // Input sources are output-only — they cannot be connection targets
  if (targetNodeType === INPUT_SOURCE_TYPE) {
    return { ok: false, reason: "Input sources cannot be connection targets" };
  }

  // Synthesize port spec for input source nodes (not in the WASM registry)
  const srcPorts: PortsForType =
    sourceNodeType === INPUT_SOURCE_TYPE
      ? {
          inputs: [],
          outputs: [
            {
              id: INPUT_SOURCE_PORT_ID,
              name: "output",
              type: INPUT_SOURCE_PORT_TYPE,
              direction: "output" as const,
            },
          ],
        }
      : registry.getPortsForType(sourceNodeType);

  // Synthesize port spec for output target nodes (not in the WASM registry)
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

  const srcType = (srcPort?.type ?? "any").toLowerCase();
  const tgtType = (tgtPort?.type ?? "any").toLowerCase();

  // Wildcard: "any" is compatible with everything
  if (srcType === "any" || tgtType === "any") {
    return { ok: true };
  }

  // Exact match
  if (srcType === tgtType) {
    return { ok: true };
  }

  // Type families: aliases within each family are mutually compatible
  if (isFloatFamily(srcType) && isFloatFamily(tgtType)) {
    return { ok: true };
  }
  if (isIntFamily(srcType) && isIntFamily(tgtType)) {
    return { ok: true };
  }
  if (isVectorFamily(srcType) && isVectorFamily(tgtType)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: `Incompatible types: ${srcType} \u2192 ${tgtType}`,
  };
}
