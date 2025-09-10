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
    "multislider",
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
    // Ranges
    "clamp",
    "remap",
    // Vector
    "vec3",
    "vec3split",
    "vec3add",
    "vec3subtract",
    "vec3multiply",
    "vec3scale",
    "vec3normalize",
    "vec3dot",
    "vec3cross",
    "vec3length",
    "inversekinematics",
    "output"
]);

export const NodeParams = z.object({
  value: z.union([z.number(), z.boolean(), z.array(z.number())]).optional(),
  frequency: z.number().optional(),
  phase: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  in_min: z.number().optional(),
  in_max: z.number().optional(),
  out_min: z.number().optional(),
  out_max: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional(),
});

export const NodeSpec = z.object({
  id: z.string(),
  type: NodeType,
  params: NodeParams.default({}),
  inputs: z.array(z.string()).default([]),
});

export const GraphSpec = z.object({ nodes: z.array(NodeSpec) });
export type GraphSpec = z.infer<typeof GraphSpec>;
