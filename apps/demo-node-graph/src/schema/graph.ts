import { z } from "zod";

export const NodeType = z.enum([
    "constant", 
    "add", 
    "subtract", 
    "multiply", 
    "divide", 
    "power", 
    "log", 
    "sin", 
    "cos", 
    "tan", 
    "time", 
    "oscillator", 
    "slider",
    // Logic
    "and",
    "or",
    "not",
    "xor",
    // Conditional
    "greaterthan",
    "lessthan",
    "equal",
    "notequal",
    "if",
    // Vector
    "vec3",
    "vec3split",
    "vec3add",
    "vec3subtract",
    "vec3multiply",
    "vec3scale",
    "output"
]);

export const NodeParams = z.object({
  value: z.union([z.number(), z.boolean(), z.array(z.number())]).optional(),
  frequency: z.number().optional(),
  phase: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const NodeSpec = z.object({
  id: z.string(),
  type: NodeType,
  params: NodeParams.default({}),
  inputs: z.array(z.string()).default([]),
});

export const GraphSpec = z.object({ nodes: z.array(NodeSpec) });
export type GraphSpec = z.infer<typeof GraphSpec>;
