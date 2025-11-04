import { requireNodeSignature } from "@vizij/node-graph-wasm/metadata";
import type { NodeType } from "@vizij/node-graph-wasm";

interface ScalarFunctionConfig {
  typeId: NodeType;
  names: string[];
  minArgs?: number;
  maxArgs?: number | null;
}

interface OrderedInputSpec {
  id: string;
  optional: boolean;
}

interface VariadicInputSpec {
  id: string;
  min: number;
  max: number | null;
}

export interface ScalarFunctionDefinition {
  nodeType: NodeType;
  inputs: OrderedInputSpec[];
  variadic: VariadicInputSpec | null;
  minArgs: number;
  maxArgs: number | null;
}

const FUNCTION_CONFIGS: ScalarFunctionConfig[] = [
  { typeId: "sin", names: ["sin"] },
  { typeId: "cos", names: ["cos"] },
  { typeId: "tan", names: ["tan"] },
  { typeId: "power", names: ["power", "pow"] },
  { typeId: "log", names: ["log"] },
  { typeId: "clamp", names: ["clamp"] },
  { typeId: "add", names: ["add"] },
  { typeId: "multiply", names: ["multiply"] },
  { typeId: "subtract", names: ["subtract"] },
  { typeId: "divide", names: ["divide"] },
  {
    typeId: "greaterthan",
    names: ["greaterthan", "gt"],
    minArgs: 2,
    maxArgs: 2,
  },
  { typeId: "lessthan", names: ["lessthan", "lt"], minArgs: 2, maxArgs: 2 },
  { typeId: "equal", names: ["equal", "eq"], minArgs: 2, maxArgs: 2 },
  {
    typeId: "notequal",
    names: ["notequal", "neq", "ne"],
    minArgs: 2,
    maxArgs: 2,
  },
  { typeId: "and", names: ["and"], minArgs: 2, maxArgs: 2 },
  { typeId: "or", names: ["or"], minArgs: 2, maxArgs: 2 },
  { typeId: "xor", names: ["xor"], minArgs: 2, maxArgs: 2 },
  { typeId: "not", names: ["not"], minArgs: 1, maxArgs: 1 },
  { typeId: "if", names: ["if"], minArgs: 2, maxArgs: 3 },
  { typeId: "time", names: ["time"], minArgs: 0, maxArgs: 0 },
  { typeId: "oscillator", names: ["oscillator"], minArgs: 2, maxArgs: 2 },
];

export const SCALAR_FUNCTIONS = new Map<string, ScalarFunctionDefinition>();

type SignatureInput = {
  id: string;
  optional?: boolean | number | null;
};

for (const config of FUNCTION_CONFIGS) {
  const signature = requireNodeSignature(config.typeId);
  const signatureInputs = signature.inputs as SignatureInput[];
  const inputs: OrderedInputSpec[] = signatureInputs.map((input) => ({
    id: input.id,
    optional: Boolean(input.optional),
  }));

  const variadic = signature.variadic_inputs
    ? {
        id: signature.variadic_inputs.id,
        min: signature.variadic_inputs.min,
        max: signature.variadic_inputs.max ?? null,
      }
    : null;

  const derivedMin = variadic
    ? variadic.min
    : inputs.filter((input) => !input.optional).length;
  const derivedMax = variadic ? variadic.max : inputs.length;

  const minArgs = config.minArgs ?? derivedMin;
  const maxArgs =
    config.maxArgs !== undefined ? config.maxArgs : (derivedMax ?? null);

  const definition: ScalarFunctionDefinition = {
    nodeType: config.typeId,
    inputs,
    variadic,
    minArgs,
    maxArgs,
  };

  const names = new Set<string>(
    [config.typeId, ...config.names].map((name) => name.toLowerCase()),
  );
  names.forEach((name) => {
    SCALAR_FUNCTIONS.set(name, definition);
  });
}
