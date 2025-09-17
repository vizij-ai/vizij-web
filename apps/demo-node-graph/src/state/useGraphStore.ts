import { create } from "zustand";
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnNodesChange,
  type OnEdgesChange,
} from "reactflow";

export type RFState = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setNodeData: (nodeId: string, data: any) => void;
  setGraph: (graph: Pick<RFState, "nodes" | "edges">) => void;
  renameNode: (nodeId: string, newId: string) => void;
  updateNodeType: (
    nodeId: string,
    newType: string,
    defaults?: Record<string, unknown>,
  ) => void;
  removeEdge: (edgeId: string) => void;
};

const initialNodes: Node[] = [
  // Sources
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
    position: { x: 300, y: 60 },
    data: { label: "Oscillator" },
  },
  {
    id: "offset",
    type: "constant",
    position: { x: 300, y: 160 },
    data: { label: "Offset", value: 0.3 },
  },
  {
    id: "const0",
    type: "constant",
    position: { x: 300, y: 260 },
    data: { label: "Zero", value: 0 },
  },

  // Oscillator + math chain
  {
    id: "add1",
    type: "add",
    position: { x: 540, y: 60 },
    data: { label: "Add Offset" },
  },
  {
    id: "clamp1",
    type: "clamp",
    position: { x: 780, y: 60 },
    data: { label: "Clamp 0..1", min: 0, max: 1 },
  },
  {
    id: "remap1",
    type: "remap",
    position: { x: 1020, y: 60 },
    data: {
      label: "Remap 0..1 → -1..1",
      in_min: 0,
      in_max: 1,
      out_min: -1,
      out_max: 1,
    },
  },

  // Logic / conditional
  {
    id: "gt0",
    type: "greaterthan",
    position: { x: 540, y: 180 },
    data: { label: "Osc > 0" },
  },
  {
    id: "then1",
    type: "constant",
    position: { x: 780, y: 180 },
    data: { label: "Then 1", value: 1 },
  },
  {
    id: "else1",
    type: "constant",
    position: { x: 780, y: 240 },
    data: { label: "Else 0", value: 0 },
  },
  {
    id: "if1",
    type: "if",
    position: { x: 1020, y: 210 },
    data: { label: "Gate" },
  },

  // Trig + power + log path
  {
    id: "two",
    type: "constant",
    position: { x: 540, y: 380 },
    data: { label: "Power (b=2)", value: 2 },
  },
  {
    id: "sin1",
    type: "sin",
    position: { x: 540, y: 320 },
    data: { label: "Sin(Time)" },
  },
  {
    id: "power1",
    type: "power",
    position: { x: 780, y: 320 },
    data: { label: "Sin^2" },
  },
  {
    id: "econst",
    type: "constant",
    position: { x: 960, y: 380 },
    data: { label: "Log base (e)", value: 2.718281828 },
  },
  {
    id: "log1",
    type: "log",
    position: { x: 1020, y: 320 },
    data: { label: "Log (base e)" },
  },

  // Vector playground
  {
    id: "v1",
    type: "vectorconstant",
    position: { x: 0, y: 420 },
    data: { label: "v1", value: [1, 2, 3] },
  },
  {
    id: "v2",
    type: "vectorconstant",
    position: { x: 0, y: 520 },
    data: { label: "v2", value: [0, 1, 0] },
  },
  {
    id: "vadd",
    type: "vectoradd",
    position: { x: 300, y: 470 },
    data: { label: "v1 + v2" },
  },
  {
    id: "vlen",
    type: "vectorlength",
    position: { x: 780, y: 470 },
    data: { label: "Length(vadd)" },
  },
  {
    id: "vidx",
    type: "vectorindex",
    position: { x: 780, y: 530 },
    data: { label: "Index 2 of v1" },
  },
  {
    id: "idx",
    type: "constant",
    position: { x: 540, y: 560 },
    data: { label: "Index", value: 2 },
  },
  {
    id: "vnorm2",
    type: "vectornormalize",
    position: { x: 300, y: 560 },
    data: { label: "Normalize v2" },
  },
  {
    id: "vdot",
    type: "vectordot",
    position: { x: 1020, y: 470 },
    data: { label: "Dot(v1, norm(v2))" },
  },
  {
    id: "vcross",
    type: "vec3cross",
    position: { x: 1020, y: 530 },
    data: { label: "Cross(v1,v2)" },
  },

  // Split / Join / Reducers
  {
    id: "vbig",
    type: "vectorconstant",
    position: { x: 0, y: 650 },
    data: { label: "vBig", value: [0, 1, 2, 3, 4, 5, 6, 7] },
  },
  {
    id: "split1",
    type: "split",
    position: { x: 150, y: 650 },
    data: { label: "Split [3,2,3]", sizes: [3, 2, 3] },
  },
  {
    id: "join1",
    type: "join",
    position: { x: 300, y: 650 },
    data: { label: "Join(part1,part3)" },
  },
  {
    id: "vlen2",
    type: "vectorlength",
    position: { x: 540, y: 650 },
    data: { label: "Length(join)" },
  },
  {
    id: "vmean",
    type: "vectormean",
    position: { x: 780, y: 650 },
    data: { label: "Mean" },
  },
  {
    id: "vmin",
    type: "vectormin",
    position: { x: 780, y: 690 },
    data: { label: "Min" },
  },
  {
    id: "vmax",
    type: "vectormax",
    position: { x: 780, y: 730 },
    data: { label: "Max" },
  },

  // Robotics: 3-link IK
  {
    id: "ms1",
    type: "multislider",
    position: { x: 0, y: 820 },
    data: { label: "Target (x,y,theta)", min: -5, max: 5, x: 2, y: 1, z: 0.5 },
  },
  {
    id: "bone1",
    type: "constant",
    position: { x: 0, y: 900 },
    data: { label: "Bone1", value: 2 },
  },
  {
    id: "bone2",
    type: "constant",
    position: { x: 0, y: 940 },
    data: { label: "Bone2", value: 2 },
  },
  {
    id: "bone3",
    type: "constant",
    position: { x: 0, y: 980 },
    data: { label: "Bone3", value: 1 },
  },
  {
    id: "ik1",
    type: "inversekinematics",
    position: { x: 300, y: 840 },
    data: { label: "Inverse Kinematics" },
  },
  {
    id: "ikidx0",
    type: "vectorindex",
    position: { x: 540, y: 820 },
    data: { label: "IK[0]" },
  },
  {
    id: "ikidx1",
    type: "vectorindex",
    position: { x: 540, y: 860 },
    data: { label: "IK[1]" },
  },
  {
    id: "ikidx2",
    type: "vectorindex",
    position: { x: 540, y: 900 },
    data: { label: "IK[2]" },
  },
  {
    id: "i0",
    type: "constant",
    position: { x: 480, y: 820 },
    data: { label: "Index 0", value: 0 },
  },
  {
    id: "i1",
    type: "constant",
    position: { x: 480, y: 860 },
    data: { label: "Index 1", value: 1 },
  },
  {
    id: "i2",
    type: "constant",
    position: { x: 480, y: 900 },
    data: { label: "Index 2", value: 2 },
  },

  // Output sink with many inputs
  {
    id: "out",
    type: "output",
    position: { x: 1360, y: 300 },
    data: {
      label: "Output",
      inputs: [
        "input_1",
        "input_2",
        "input_3",
        "input_4",
        "input_5",
        "input_6",
        "input_7",
        "input_8",
        "input_9",
        "input_10",
        "input_11",
        "input_12",
        "input_13",
        "input_14",
        "input_15",
        "input_16",
        "input_17",
        "input_18",
        "input_19",
        "input_20",
      ],
    },
  },
];

const initialEdges: Edge[] = [
  // Oscillator + math chain
  {
    id: "e-freq-osc",
    source: "freq",
    target: "osc",
    targetHandle: "frequency",
    animated: true,
  },
  {
    id: "e-osc-add1",
    source: "osc",
    target: "add1",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-offset-add1",
    source: "offset",
    target: "add1",
    targetHandle: "b",
    animated: true,
  },
  {
    id: "e-add1-clamp1",
    source: "add1",
    target: "clamp1",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-clamp1-remap1",
    source: "clamp1",
    target: "remap1",
    targetHandle: "in",
    animated: true,
  },

  // Logic / conditional
  {
    id: "e-osc-gt0",
    source: "osc",
    target: "gt0",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-const0-gt0",
    source: "const0",
    target: "gt0",
    targetHandle: "b",
    animated: true,
  },
  {
    id: "e-gt0-if1",
    source: "gt0",
    target: "if1",
    targetHandle: "cond",
    animated: true,
  },
  {
    id: "e-then1-if1",
    source: "then1",
    target: "if1",
    targetHandle: "then",
    animated: true,
  },
  {
    id: "e-else1-if1",
    source: "else1",
    target: "if1",
    targetHandle: "else",
    animated: true,
  },

  // Trig + power + log path
  {
    id: "e-time-sin1",
    source: "time",
    target: "sin1",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-sin1-power1",
    source: "sin1",
    target: "power1",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-two-power1",
    source: "two",
    target: "power1",
    targetHandle: "b",
    animated: true,
  },
  {
    id: "e-power1-log1",
    source: "power1",
    target: "log1",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-econst-log1",
    source: "econst",
    target: "log1",
    targetHandle: "b",
    animated: true,
  },

  // Vector playground
  {
    id: "e-v1-vadd",
    source: "v1",
    target: "vadd",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-v2-vadd",
    source: "v2",
    target: "vadd",
    targetHandle: "b",
    animated: true,
  },
  {
    id: "e-vadd-vlen",
    source: "vadd",
    target: "vlen",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-v1-vidx",
    source: "v1",
    target: "vidx",
    targetHandle: "v",
    animated: true,
  },
  {
    id: "e-idx-vidx",
    source: "idx",
    target: "vidx",
    targetHandle: "index",
    animated: true,
  },
  {
    id: "e-v2-vnorm2",
    source: "v2",
    target: "vnorm2",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-v1-vdot",
    source: "v1",
    target: "vdot",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-vnorm2-vdot",
    source: "vnorm2",
    target: "vdot",
    targetHandle: "b",
    animated: true,
  },
  {
    id: "e-v1-vcross",
    source: "v1",
    target: "vcross",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-v2-vcross",
    source: "v2",
    target: "vcross",
    targetHandle: "b",
    animated: true,
  },

  // Split / Join / Reducers
  {
    id: "e-vbig-split1",
    source: "vbig",
    target: "split1",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-split1p1-join1",
    source: "split1",
    sourceHandle: "part1",
    target: "join1",
    targetHandle: "a",
    animated: true,
  },
  {
    id: "e-split1p3-join1",
    source: "split1",
    sourceHandle: "part3",
    target: "join1",
    targetHandle: "b",
    animated: true,
  },
  {
    id: "e-join1-vlen2",
    source: "join1",
    target: "vlen2",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-join1-vmean",
    source: "join1",
    target: "vmean",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-join1-vmin",
    source: "join1",
    target: "vmin",
    targetHandle: "in",
    animated: true,
  },
  {
    id: "e-join1-vmax",
    source: "join1",
    target: "vmax",
    targetHandle: "in",
    animated: true,
  },

  // Robotics: IK path
  {
    id: "e-ms1x-ik1",
    source: "ms1",
    sourceHandle: "x",
    target: "ik1",
    targetHandle: "x",
    animated: true,
  },
  {
    id: "e-ms1y-ik1",
    source: "ms1",
    sourceHandle: "y",
    target: "ik1",
    targetHandle: "y",
    animated: true,
  },
  {
    id: "e-ms1z-ik1",
    source: "ms1",
    sourceHandle: "z",
    target: "ik1",
    targetHandle: "theta",
    animated: true,
  },
  {
    id: "e-bone1-ik1",
    source: "bone1",
    target: "ik1",
    targetHandle: "bone1",
    animated: true,
  },
  {
    id: "e-bone2-ik1",
    source: "bone2",
    target: "ik1",
    targetHandle: "bone2",
    animated: true,
  },
  {
    id: "e-bone3-ik1",
    source: "bone3",
    target: "ik1",
    targetHandle: "bone3",
    animated: true,
  },

  {
    id: "e-ik1-ikidx0",
    source: "ik1",
    target: "ikidx0",
    targetHandle: "v",
    animated: true,
  },
  {
    id: "e-ik1-ikidx1",
    source: "ik1",
    target: "ikidx1",
    targetHandle: "v",
    animated: true,
  },
  {
    id: "e-ik1-ikidx2",
    source: "ik1",
    target: "ikidx2",
    targetHandle: "v",
    animated: true,
  },
  {
    id: "e-i0-ikidx0",
    source: "i0",
    target: "ikidx0",
    targetHandle: "index",
    animated: true,
  },
  {
    id: "e-i1-ikidx1",
    source: "i1",
    target: "ikidx1",
    targetHandle: "index",
    animated: true,
  },
  {
    id: "e-i2-ikidx2",
    source: "i2",
    target: "ikidx2",
    targetHandle: "index",
    animated: true,
  },

  // Output wiring (20 inputs)
  {
    id: "o-1",
    source: "osc",
    target: "out",
    targetHandle: "input_1",
    animated: true,
  },
  {
    id: "o-2",
    source: "add1",
    target: "out",
    targetHandle: "input_2",
    animated: true,
  },
  {
    id: "o-3",
    source: "clamp1",
    target: "out",
    targetHandle: "input_3",
    animated: true,
  },
  {
    id: "o-4",
    source: "remap1",
    target: "out",
    targetHandle: "input_4",
    animated: true,
  },
  {
    id: "o-5",
    source: "if1",
    target: "out",
    targetHandle: "input_5",
    animated: true,
  },
  {
    id: "o-6",
    source: "sin1",
    target: "out",
    targetHandle: "input_6",
    animated: true,
  },
  {
    id: "o-7",
    source: "power1",
    target: "out",
    targetHandle: "input_7",
    animated: true,
  },
  {
    id: "o-8",
    source: "log1",
    target: "out",
    targetHandle: "input_8",
    animated: true,
  },
  {
    id: "o-9",
    source: "vlen",
    target: "out",
    targetHandle: "input_9",
    animated: true,
  },
  {
    id: "o-10",
    source: "vidx",
    target: "out",
    targetHandle: "input_10",
    animated: true,
  },
  {
    id: "o-11",
    source: "vdot",
    target: "out",
    targetHandle: "input_11",
    animated: true,
  },
  {
    id: "o-12",
    source: "vcross",
    target: "out",
    targetHandle: "input_12",
    animated: true,
  },
  {
    id: "o-13",
    source: "vlen2",
    target: "out",
    targetHandle: "input_13",
    animated: true,
  },
  {
    id: "o-14",
    source: "vmean",
    target: "out",
    targetHandle: "input_14",
    animated: true,
  },
  {
    id: "o-15",
    source: "vmin",
    target: "out",
    targetHandle: "input_15",
    animated: true,
  },
  {
    id: "o-16",
    source: "vmax",
    target: "out",
    targetHandle: "input_16",
    animated: true,
  },
  {
    id: "o-17",
    source: "ik1",
    target: "out",
    targetHandle: "input_17",
    animated: true,
  },
  {
    id: "o-18",
    source: "ikidx0",
    target: "out",
    targetHandle: "input_18",
    animated: true,
  },
  {
    id: "o-19",
    source: "ikidx1",
    target: "out",
    targetHandle: "input_19",
    animated: true,
  },
  {
    id: "o-20",
    source: "ikidx2",
    target: "out",
    targetHandle: "input_20",
    animated: true,
  },
];

const useGraphStore = create<RFState>((set, get) => ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection: Connection) => {
    const { source, sourceHandle, target, targetHandle } = connection;
    if (!source || !target) return;

    const sourceNode = get().nodes.find((n) => n.id === source);
    const targetNode = get().nodes.find((n) => n.id === target);

    if (!sourceNode || !targetNode) return;

    if (targetNode.type === "output") {
      set({
        edges: addEdge({ ...connection, animated: true }, get().edges),
      });
      return;
    }

    set({
      edges: addEdge({ ...connection, animated: true }, get().edges),
    });
  },
  addNode: (node: Node) => {
    set({
      nodes: [...get().nodes, node],
    });
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setNodeData: (nodeId: string, data: any) => {
    set({
      nodes: get().nodes.map((n) => {
        if (n.id === nodeId) {
          return { ...n, data: { ...n.data, ...data } };
        }
        return n;
      }),
    });
  },
  setGraph: (graph: Pick<RFState, "nodes" | "edges">) => {
    set(graph);
  },
  renameNode: (nodeId: string, newId: string) => {
    if (!newId || nodeId === newId) return;
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId ? { ...node, id: newId } : node,
      ),
      edges: get().edges.map((edge) => {
        let updated = edge;
        if (edge.source === nodeId) {
          updated = { ...updated, source: newId };
        }
        if (edge.target === nodeId) {
          updated = { ...updated, target: newId };
        }
        return updated;
      }),
    });
  },
  updateNodeType: (
    nodeId: string,
    newType: string,
    defaults?: Record<string, unknown>,
  ) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          type: newType,
          data: {
            ...(defaults ?? {}),
          },
        };
      }),
    });
  },
  removeEdge: (edgeId: string) => {
    set({
      edges: get().edges.filter((edge) => edge.id !== edgeId),
    });
  },
}));

export default useGraphStore;
