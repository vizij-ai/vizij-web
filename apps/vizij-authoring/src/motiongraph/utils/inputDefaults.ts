import type { PortSpec, VariadicSpec } from "../contexts/RegistryProvider";

const FLOAT_TYPES = new Set(["f32", "float", "f64", "double"]);
const INT_TYPES = new Set(["i32", "int", "integer"]);
const BOOL_TYPES = new Set(["bool", "boolean"]);

export function formatVariadicPortId(groupId: string, index: number): string {
  return `${groupId}_${index}`;
}

export function defaultVariadicCount(spec: VariadicSpec | null): number {
  if (!spec) return 0;
  return Math.max(spec.min ?? 0, 2);
}

export function defaultInputValueForPortType(
  type: string,
): unknown | undefined {
  const normalized = type.toLowerCase();
  if (BOOL_TYPES.has(normalized)) {
    return false;
  }
  if (FLOAT_TYPES.has(normalized) || INT_TYPES.has(normalized)) {
    return 0;
  }
  return undefined;
}

export function buildInitialInputDefaultsForPorts(
  inputs: readonly PortSpec[],
  variadicInputs: VariadicSpec | null,
  variadicInputCount = defaultVariadicCount(variadicInputs),
): Record<string, unknown> | undefined {
  const inputDefaults: Record<string, unknown> = {};
  const addDefault = (portId: string, portType: string) => {
    const value = defaultInputValueForPortType(portType);
    if (value !== undefined) {
      inputDefaults[portId] = value;
    }
  };

  inputs.forEach((port) => addDefault(port.id, port.type));

  if (variadicInputs) {
    for (let index = 0; index < variadicInputCount; index += 1) {
      addDefault(
        formatVariadicPortId(variadicInputs.id, index),
        variadicInputs.type,
      );
    }
  }

  return Object.keys(inputDefaults).length > 0 ? inputDefaults : undefined;
}
