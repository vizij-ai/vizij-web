import { requireNodeSignature } from "@vizij/node-graph-wasm/metadata";
import type { NodeType, ValueJSON } from "@vizij/node-graph-wasm";

export type BindingOperatorType = "spring" | "damp" | "slew";

export interface BindingOperatorState {
  type: BindingOperatorType;
  enabled: boolean;
  params: Record<string, number>;
}

export interface BindingOperatorParamDefinition {
  id: string;
  label: string;
  doc?: string;
  min?: number;
  max?: number;
  defaultValue: number;
}

export interface BindingOperatorDefinition {
  type: BindingOperatorType;
  nodeType: NodeType;
  label: string;
  description?: string;
  inputs: string[];
  params: BindingOperatorParamDefinition[];
}

const OPERATOR_TYPES: readonly BindingOperatorType[] = [
  "spring",
  "damp",
  "slew",
] as const;

function valueJsonToNumber(value: ValueJSON | undefined): number {
  if (!value || typeof value !== "object") {
    return typeof value === "number" ? value : 0;
  }
  if ("float" in value && typeof value.float === "number") {
    return value.float;
  }
  if ("int" in value && typeof value.int === "number") {
    return value.int;
  }
  return 0;
}

const operatorDefinitionMap = new Map<
  BindingOperatorType,
  BindingOperatorDefinition
>();

OPERATOR_TYPES.forEach((type) => {
  const signature = requireNodeSignature(type);
  const params: BindingOperatorParamDefinition[] = signature.params.map(
    (param: {
      id: string;
      label: string;
      doc?: string;
      min?: number;
      max?: number;
      default_json?: ValueJSON;
    }) => ({
      id: param.id,
      label: param.label,
      doc: param.doc,
      min: param.min ?? undefined,
      max: param.max ?? undefined,
      defaultValue: valueJsonToNumber(param.default_json),
    }),
  );

  operatorDefinitionMap.set(type, {
    type,
    nodeType: signature.type_id,
    label: signature.name,
    description: signature.doc,
    inputs: signature.inputs.map((input: { id: string }) => input.id),
    params,
  });
});

export function getBindingOperatorDefinition(
  type: BindingOperatorType,
): BindingOperatorDefinition {
  const definition = operatorDefinitionMap.get(type);
  if (!definition) {
    throw new Error(`Unknown binding operator type '${type}'.`);
  }
  return definition;
}

export const bindingOperatorDefinitions: BindingOperatorDefinition[] =
  OPERATOR_TYPES.map((type) => getBindingOperatorDefinition(type));

export function createDefaultOperatorSettings(
  type: BindingOperatorType,
): BindingOperatorState {
  const definition = getBindingOperatorDefinition(type);
  const params: Record<string, number> = {};
  definition.params.forEach((param) => {
    params[param.id] = param.defaultValue;
  });
  return {
    type,
    enabled: false,
    params,
  };
}

export function ensureOperatorParams(
  operator: BindingOperatorState,
): BindingOperatorState {
  const definition = getBindingOperatorDefinition(operator.type);
  const params: Record<string, number> = {};
  definition.params.forEach((param) => {
    const value = operator.params?.[param.id];
    params[param.id] = typeof value === "number" ? value : param.defaultValue;
  });
  return {
    type: operator.type,
    enabled: !!operator.enabled,
    params,
  };
}

export const bindingOperatorTypes: readonly BindingOperatorType[] =
  OPERATOR_TYPES;
