import { requireNodeSignature } from "@vizij/node-graph-wasm/metadata";
import type { NodeType } from "@vizij/node-graph-wasm";

export type ExpressionFunctionCategory =
  | "math"
  | "logic"
  | "time"
  | "utility"
  | "vector";

export type ExpressionValueType = "scalar" | "vector" | "boolean" | "any";

interface ScalarFunctionConfig {
  typeId: NodeType;
  names: string[];
  minArgs?: number;
  maxArgs?: number | null;
  category?: ExpressionFunctionCategory;
  description?: string;
}

interface OrderedInputSpec {
  id: string;
  optional: boolean;
  valueType: ExpressionValueType;
}

interface VariadicInputSpec {
  id: string;
  min: number;
  max: number | null;
  valueType: ExpressionValueType;
}

export interface ScalarFunctionDefinition {
  nodeType: NodeType;
  inputs: OrderedInputSpec[];
  variadic: VariadicInputSpec | null;
  minArgs: number;
  maxArgs: number | null;
  resultValueType: ExpressionValueType;
}

export interface ScalarFunctionVocabularyEntry {
  name: string;
  aliases: string[];
  nodeType: NodeType;
  category: ExpressionFunctionCategory;
  description?: string;
}

const FUNCTION_CONFIGS: ScalarFunctionConfig[] = [
  {
    typeId: "sin",
    names: ["sin"],
    category: "math",
    description: "Sine of the input value (radians).",
  },
  {
    typeId: "cos",
    names: ["cos"],
    category: "math",
    description: "Cosine of the input value (radians).",
  },
  {
    typeId: "tan",
    names: ["tan"],
    category: "math",
    description: "Tangent of the input value (radians).",
  },
  {
    typeId: "power",
    names: ["power", "pow"],
    category: "math",
    description: "Raise a base value to an exponent.",
  },
  {
    typeId: "log",
    names: ["log"],
    category: "math",
    description: "Logarithm of the input value.",
  },
  {
    typeId: "clamp",
    names: ["clamp"],
    category: "utility",
    description: "Clamp an input between min/max.",
  },
  {
    typeId: "remap",
    names: ["remap"],
    category: "utility",
    description:
      "Linearly map a value from the input range to the output range.",
  },
  {
    typeId: "centered_remap",
    names: ["centeredremap", "centered_remap"],
    category: "utility",
    description:
      "Remap a value using in/out ranges that include explicit anchors.",
  },
  {
    typeId: "piecewise_remap",
    names: ["piecewiseremap", "piecewise_remap"],
    category: "utility",
    description: "Map a value through piecewise-linear breakpoints.",
  },
  {
    typeId: "abs",
    names: ["abs"],
    category: "math",
    description: "Absolute value of the input.",
  },
  {
    typeId: "add",
    names: ["add"],
    category: "math",
    description: "Sum all operands together.",
  },
  {
    typeId: "multiply",
    names: ["multiply"],
    category: "math",
    description: "Multiply operands together.",
  },
  {
    typeId: "subtract",
    names: ["subtract"],
    category: "math",
    description: "Subtract rhs from lhs.",
  },
  {
    typeId: "divide",
    names: ["divide"],
    category: "math",
    description: "Divide lhs by rhs.",
  },
  {
    typeId: "min",
    names: ["min"],
    category: "math",
    description: "Minimum of all operands.",
  },
  {
    typeId: "max",
    names: ["max"],
    category: "math",
    description: "Maximum of all operands.",
  },
  {
    typeId: "modulo",
    names: ["modulo", "mod"],
    category: "math",
    description: "Modulo of lhs by rhs.",
  },
  {
    typeId: "greaterthan",
    names: ["greaterthan", "gt"],
    minArgs: 2,
    maxArgs: 2,
    category: "logic",
    description: "Return true when lhs > rhs.",
  },
  {
    typeId: "lessthan",
    names: ["lessthan", "lt"],
    minArgs: 2,
    maxArgs: 2,
    category: "logic",
    description: "Return true when lhs < rhs.",
  },
  {
    typeId: "equal",
    names: ["equal", "eq"],
    minArgs: 2,
    maxArgs: 2,
    category: "logic",
    description: "Return true when operands are equal.",
  },
  {
    typeId: "notequal",
    names: ["notequal", "neq", "ne"],
    minArgs: 2,
    maxArgs: 2,
    category: "logic",
    description: "Return true when operands differ.",
  },
  {
    typeId: "and",
    names: ["and"],
    minArgs: 2,
    maxArgs: 2,
    category: "logic",
    description: "Logical AND.",
  },
  {
    typeId: "or",
    names: ["or"],
    minArgs: 2,
    maxArgs: 2,
    category: "logic",
    description: "Logical OR.",
  },
  {
    typeId: "xor",
    names: ["xor"],
    minArgs: 2,
    maxArgs: 2,
    category: "logic",
    description: "Logical XOR.",
  },
  {
    typeId: "not",
    names: ["not"],
    minArgs: 1,
    maxArgs: 1,
    category: "logic",
    description: "Logical NOT of input.",
  },
  {
    typeId: "if",
    names: ["if"],
    minArgs: 2,
    maxArgs: 3,
    category: "logic",
    description: "Conditional branch with optional fallback.",
  },
  {
    typeId: "round",
    names: ["round"],
    category: "math",
    description: "Round input using the configured mode (floor/ceil/trunc).",
  },
  {
    typeId: "case",
    names: ["case"],
    minArgs: 3,
    category: "logic",
    description: "Route the selector value to matching labeled branches.",
  },
  {
    typeId: "time",
    names: ["time"],
    minArgs: 0,
    maxArgs: 0,
    category: "time",
    description: "Graph time in seconds.",
  },
  {
    typeId: "oscillator",
    names: ["oscillator"],
    minArgs: 2,
    maxArgs: 2,
    category: "time",
    description: "Sine/cosine oscillator driven by time.",
  },
  {
    typeId: "spring",
    names: ["spring"],
    category: "time",
    description:
      "Spring toward the target with configurable stiffness and damping.",
  },
  {
    typeId: "damp",
    names: ["damp"],
    category: "time",
    description: "Damp input values toward zero at the specified rate.",
  },
  {
    typeId: "slew",
    names: ["slew"],
    category: "time",
    description: "Limit the rate of change between inputs over time.",
  },
  {
    typeId: "default-blend",
    names: ["defaultblend", "blend"],
    category: "utility",
    description:
      "Blend operand values using optional baseline/offset and weight inputs.",
  },
  {
    typeId: "blendweightedaverage",
    names: ["blendweightedaverage"],
    category: "utility",
    description: "Compute weighted average blends using aggregate sums.",
  },
  {
    typeId: "blendadditive",
    names: ["blendadditive"],
    category: "utility",
    description: "Additive blending helper.",
  },
  {
    typeId: "blendmultiply",
    names: ["blendmultiply"],
    category: "utility",
    description: "Multiplicative blending helper.",
  },
  {
    typeId: "blendweightedoverlay",
    names: ["blendweightedoverlay"],
    category: "utility",
    description: "Overlay blending helper driven by weighted sums.",
  },
  {
    typeId: "blendweightedaverageoverlay",
    names: ["blendweightedaverageoverlay"],
    category: "utility",
    description: "Overlay helper that adds averaged deltas to the base value.",
  },
  {
    typeId: "blendmax",
    names: ["blendmax"],
    category: "utility",
    description: "Select the operand whose effective weight is largest.",
  },
  {
    typeId: "vec3cross",
    names: ["vec3cross", "cross"],
    category: "vector",
    description: "Cross product of vectors A × B.",
  },
  {
    typeId: "vectoradd",
    names: ["vectoradd", "vadd"],
    category: "vector",
    description: "Element-wise sum of vectors.",
  },
  {
    typeId: "vectorsubtract",
    names: ["vectorsubtract", "vsub"],
    category: "vector",
    description: "Element-wise subtraction of vectors.",
  },
  {
    typeId: "vectormultiply",
    names: ["vectormultiply", "vmul"],
    category: "vector",
    description: "Element-wise multiplication of vectors.",
  },
  {
    typeId: "vectorscale",
    names: ["vectorscale", "vscale"],
    category: "vector",
    description: "Scale a vector by a scalar value.",
  },
  {
    typeId: "vectornormalize",
    names: ["vectornormalize", "vnormalize"],
    category: "vector",
    description: "Normalize a vector to unit length.",
  },
  {
    typeId: "vectordot",
    names: ["vectordot", "vdot"],
    category: "vector",
    description: "Dot product of vectors A · B.",
  },
  {
    typeId: "vectorlength",
    names: ["vectorlength", "vlength"],
    category: "vector",
    description: "Euclidean length of a vector.",
  },
  {
    typeId: "vectorindex",
    names: ["vectorindex", "vindex"],
    category: "vector",
    description: "Extract a component from a vector.",
  },
  {
    typeId: "vectorconstant",
    names: ["vectorconstant", "vconst"],
    category: "vector",
    description: "Constant vector value.",
  },
  {
    typeId: "join",
    names: ["join"],
    category: "vector",
    description: "Join scalar inputs into a vector.",
  },
  {
    typeId: "split",
    names: ["split"],
    category: "vector",
    description: "Split a vector into scalar outputs.",
  },
  {
    typeId: "vectormin",
    names: ["vectormin"],
    category: "vector",
    description: "Minimum component in a vector.",
  },
  {
    typeId: "vectormax",
    names: ["vectormax"],
    category: "vector",
    description: "Maximum component in a vector.",
  },
  {
    typeId: "vectormean",
    names: ["vectormean"],
    category: "vector",
    description: "Mean of the provided vector values.",
  },
  {
    typeId: "vectormedian",
    names: ["vectormedian"],
    category: "vector",
    description: "Median of the provided vector values.",
  },
  {
    typeId: "vectormode",
    names: ["vectormode"],
    category: "vector",
    description: "Mode of the provided vector values.",
  },
  {
    typeId: "weightedsumvector",
    names: ["weightedsumvector", "vectorsum"],
    category: "vector",
    description: "Weighted sum across vectors with optional masks.",
  },
];

export const SCALAR_FUNCTIONS = new Map<string, ScalarFunctionDefinition>();
export const SCALAR_FUNCTION_VOCABULARY: ScalarFunctionVocabularyEntry[] = [];

type SignatureInput = {
  id: string;
  optional?: boolean | number | null;
};
type SignatureOutput = {
  id: string;
  ty?: string | null;
};

for (const config of FUNCTION_CONFIGS) {
  const signature = requireNodeSignature(config.typeId);
  const signatureInputs = signature.inputs as SignatureInput[];
  const inputs: OrderedInputSpec[] = signatureInputs.map((input) => ({
    id: input.id,
    optional: Boolean(input.optional),
    valueType: inferExpressionValueType((input as { ty?: string | null }).ty),
  }));

  const variadic = signature.variadic_inputs
    ? {
        id: signature.variadic_inputs.id,
        min: signature.variadic_inputs.min,
        max: signature.variadic_inputs.max ?? null,
        valueType: inferExpressionValueType(signature.variadic_inputs.ty),
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
    resultValueType: inferExpressionValueType(
      (signature.outputs as SignatureOutput[])?.[0]?.ty ?? null,
    ),
  };

  if (config.typeId === "if" || config.typeId === "case") {
    const adjustedInputs: OrderedInputSpec[] = definition.inputs.map(
      (input, index) => {
        if (config.typeId === "if" && index === 0) {
          return input;
        }
        return {
          ...input,
          valueType: "any" as ExpressionValueType,
        };
      },
    );
    definition.inputs = adjustedInputs;
    if (definition.variadic) {
      definition.variadic = {
        ...definition.variadic,
        valueType: "any" as ExpressionValueType,
      };
    }
    definition.resultValueType = "any";
  }

  const names = new Set<string>(
    [config.typeId, ...config.names].map((name) => name.toLowerCase()),
  );
  names.forEach((name) => {
    SCALAR_FUNCTIONS.set(name, definition);
  });
  const orderedNames = Array.from(names);
  const displayName = orderedNames[0] ?? config.typeId;
  SCALAR_FUNCTION_VOCABULARY.push({
    name: displayName,
    aliases: orderedNames.slice(1),
    nodeType: config.typeId,
    category: config.category ?? "math",
    description: config.description,
  });
}

function inferExpressionValueType(ty?: string | null): ExpressionValueType {
  if (!ty) {
    return "scalar";
  }
  const normalized = ty.toLowerCase();
  if (normalized === "any") {
    return "any";
  }
  if (
    normalized === "vector" ||
    normalized === "vec2" ||
    normalized === "vec3" ||
    normalized === "vec4" ||
    normalized === "quat" ||
    normalized === "colorrgba" ||
    normalized === "transform" ||
    normalized === "array" ||
    normalized === "list" ||
    normalized === "record"
  ) {
    return "vector";
  }
  if (normalized === "bool" || normalized === "boolean") {
    return "boolean";
  }
  return "scalar";
}
