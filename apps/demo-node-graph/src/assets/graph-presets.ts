import { type Edge, type Node } from "reactflow";

export type GraphPreset = {
  id: string;
  name: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
};

const cloneNodes = (nodes: Node[]): Node[] =>
  nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    data: { ...(node.data ?? {}) },
  }));

const cloneEdges = (edges: Edge[]): Edge[] =>
  edges.map((edge) => ({ ...edge }));

export const graphPresets: GraphPreset[] = [
  {
    id: "oscillator-basics",
    name: "Oscillator Basics",
    description:
      "Shows a driven oscillator with clamping and remapping to -1..1",
    nodes: cloneNodes([
      {
        id: "time",
        type: "time",
        position: { x: 0, y: 0 },
        data: { label: "Time" },
      },
      {
        id: "freq",
        type: "slider",
        position: { x: 0, y: 120 },
        data: { label: "Frequency (Hz)", value: 0.5, min: 0, max: 2 },
      },
      {
        id: "osc",
        type: "oscillator",
        position: { x: 240, y: 60 },
        data: { label: "Oscillator" },
      },
      {
        id: "offset",
        type: "constant",
        position: { x: 240, y: 160 },
        data: { label: "Offset", value: 0.3 },
      },
      {
        id: "add1",
        type: "add",
        position: { x: 480, y: 60 },
        data: { label: "Add Offset" },
      },
      {
        id: "const0",
        type: "constant",
        position: { x: 480, y: 160 },
        data: { label: "Clamp Min", value: 0 },
      },
      {
        id: "clamp_max",
        type: "constant",
        position: { x: 480, y: 220 },
        data: { label: "Clamp Max", value: 1 },
      },
      {
        id: "clamp1",
        type: "clamp",
        position: { x: 720, y: 60 },
        data: { label: "Clamp" },
      },
      {
        id: "remap_in_min",
        type: "constant",
        position: { x: 720, y: -20 },
        data: { label: "In Min", value: 0 },
      },
      {
        id: "remap_in_max",
        type: "constant",
        position: { x: 720, y: 20 },
        data: { label: "In Max", value: 1 },
      },
      {
        id: "remap_out_min",
        type: "constant",
        position: { x: 720, y: 100 },
        data: { label: "Out Min", value: -1 },
      },
      {
        id: "remap_out_max",
        type: "constant",
        position: { x: 720, y: 140 },
        data: { label: "Out Max", value: 1 },
      },
      {
        id: "remap1",
        type: "remap",
        position: { x: 960, y: 60 },
        data: { label: "Remap" },
      },
      {
        id: "out",
        type: "output",
        position: { x: 1180, y: 60 },
        data: { label: "Output", inputs: ["signal"] },
      },
    ]),
    edges: cloneEdges([
      {
        id: "e-freq-osc",
        source: "freq",
        target: "osc",
        targetHandle: "frequency",
        animated: true,
      },
      {
        id: "e-time-osc",
        source: "time",
        target: "osc",
        targetHandle: "phase",
        animated: true,
      },
      {
        id: "e-osc-add",
        source: "osc",
        target: "add1",
        targetHandle: "a",
        animated: true,
      },
      {
        id: "e-offset-add",
        source: "offset",
        target: "add1",
        targetHandle: "b",
        animated: true,
      },
      {
        id: "e-add-clamp",
        source: "add1",
        target: "clamp1",
        targetHandle: "in",
        animated: true,
      },
      {
        id: "e-min-clamp",
        source: "const0",
        target: "clamp1",
        targetHandle: "min",
        animated: true,
      },
      {
        id: "e-max-clamp",
        source: "clamp_max",
        target: "clamp1",
        targetHandle: "max",
        animated: true,
      },
      {
        id: "e-clamp-remap",
        source: "clamp1",
        target: "remap1",
        targetHandle: "in",
        animated: true,
      },
      {
        id: "e-inmin-remap",
        source: "remap_in_min",
        target: "remap1",
        targetHandle: "in_min",
        animated: true,
      },
      {
        id: "e-inmax-remap",
        source: "remap_in_max",
        target: "remap1",
        targetHandle: "in_max",
        animated: true,
      },
      {
        id: "e-outmin-remap",
        source: "remap_out_min",
        target: "remap1",
        targetHandle: "out_min",
        animated: true,
      },
      {
        id: "e-outmax-remap",
        source: "remap_out_max",
        target: "remap1",
        targetHandle: "out_max",
        animated: true,
      },
      {
        id: "e-remap-out",
        source: "remap1",
        target: "out",
        targetHandle: "signal",
        animated: true,
      },
    ]),
  },
  {
    id: "vector-playground",
    name: "Vector Playground",
    description: "Vector math utilities: add, normalize, dot, and length",
    nodes: cloneNodes([
      {
        id: "v1",
        type: "vectorconstant",
        position: { x: 0, y: 0 },
        data: { label: "v1", value: [1, 2, 3] },
      },
      {
        id: "v2",
        type: "vectorconstant",
        position: { x: 0, y: 120 },
        data: { label: "v2", value: [0, 1, 0] },
      },
      {
        id: "vadd",
        type: "vectoradd",
        position: { x: 220, y: 60 },
        data: { label: "v1 + v2" },
      },
      {
        id: "vnorm",
        type: "vectornormalize",
        position: { x: 220, y: 160 },
        data: { label: "Normalize v2" },
      },
      {
        id: "vdot",
        type: "vectordot",
        position: { x: 440, y: 60 },
        data: { label: "Dot Product" },
      },
      {
        id: "vlen",
        type: "vectorlength",
        position: { x: 440, y: 160 },
        data: { label: "Length" },
      },
      {
        id: "out",
        type: "output",
        position: { x: 640, y: 110 },
        data: { label: "Output", inputs: ["vector_sum", "dot", "length"] },
      },
    ]),
    edges: cloneEdges([
      {
        id: "e-v1-add",
        source: "v1",
        target: "vadd",
        targetHandle: "a",
        animated: true,
      },
      {
        id: "e-v2-add",
        source: "v2",
        target: "vadd",
        targetHandle: "b",
        animated: true,
      },
      {
        id: "e-v2-norm",
        source: "v2",
        target: "vnorm",
        targetHandle: "in",
        animated: true,
      },
      {
        id: "e-add-dot",
        source: "vadd",
        target: "vdot",
        targetHandle: "a",
        animated: true,
      },
      {
        id: "e-norm-dot",
        source: "vnorm",
        target: "vdot",
        targetHandle: "b",
        animated: true,
      },
      {
        id: "e-add-len",
        source: "vadd",
        target: "vlen",
        targetHandle: "in",
        animated: true,
      },
      {
        id: "e-add-out",
        source: "vadd",
        target: "out",
        targetHandle: "vector_sum",
        animated: true,
      },
      {
        id: "e-dot-out",
        source: "vdot",
        target: "out",
        targetHandle: "dot",
        animated: true,
      },
      {
        id: "e-len-out",
        source: "vlen",
        target: "out",
        targetHandle: "length",
        animated: true,
      },
    ]),
  },
  {
    id: "logic-gate",
    name: "Logic Gate",
    description: "Simple conditional gating a sine wave",
    nodes: cloneNodes([
      {
        id: "time",
        type: "time",
        position: { x: 0, y: 0 },
        data: { label: "Time" },
      },
      {
        id: "sin",
        type: "sin",
        position: { x: 220, y: 0 },
        data: { label: "Sin" },
      },
      {
        id: "threshold",
        type: "constant",
        position: { x: 220, y: 120 },
        data: { label: "Threshold", value: 0 },
      },
      {
        id: "greater",
        type: "greaterthan",
        position: { x: 440, y: 40 },
        data: { label: "Sin > 0" },
      },
      {
        id: "then",
        type: "constant",
        position: { x: 440, y: -60 },
        data: { label: "Then", value: 1 },
      },
      {
        id: "else",
        type: "constant",
        position: { x: 440, y: 120 },
        data: { label: "Else", value: -1 },
      },
      {
        id: "if",
        type: "if",
        position: { x: 660, y: 40 },
        data: { label: "Gate" },
      },
      {
        id: "out",
        type: "output",
        position: { x: 860, y: 40 },
        data: { label: "Output", inputs: ["gated"] },
      },
    ]),
    edges: cloneEdges([
      {
        id: "e-time-sin",
        source: "time",
        target: "sin",
        targetHandle: "in",
        animated: true,
      },
      {
        id: "e-sin-greater",
        source: "sin",
        target: "greater",
        targetHandle: "a",
        animated: true,
      },
      {
        id: "e-threshold-greater",
        source: "threshold",
        target: "greater",
        targetHandle: "b",
        animated: true,
      },
      {
        id: "e-greater-if",
        source: "greater",
        target: "if",
        targetHandle: "cond",
        animated: true,
      },
      {
        id: "e-then-if",
        source: "then",
        target: "if",
        targetHandle: "then",
        animated: true,
      },
      {
        id: "e-else-if",
        source: "else",
        target: "if",
        targetHandle: "else",
        animated: true,
      },
      {
        id: "e-if-out",
        source: "if",
        target: "out",
        targetHandle: "gated",
        animated: true,
      },
    ]),
  },
];

export const getInitialGraph = () => {
  const preset = graphPresets[0];
  return {
    n: cloneNodes(preset.nodes),
    e: cloneEdges(preset.edges),
  };
};

export const getPresetById = (id: string) =>
  graphPresets.find((preset) => preset.id === id) ?? null;

export const clonePresetGraph = (preset: GraphPreset) => ({
  nodes: cloneNodes(preset.nodes),
  edges: cloneEdges(preset.edges),
});
