import React, { useCallback, useEffect } from "react";
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow } from "reactflow";
import "reactflow/dist/style.css";
import useGraphStore from "../state/useGraphStore";
import SliderNode from "./nodes/SliderNode";
import ConstantNode from "./nodes/ConstantNode";
import DisplayNode from "./nodes/DisplayNode";
import OscillatorNode from "./nodes/OscillatorNode";
import BinaryOpNode from "./nodes/BinaryOpNode";
import UnaryOpNode from "./nodes/UnaryOpNode";
import IfNode from "./nodes/IfNode";
import ClampNode from "./nodes/ClampNode";
import RemapNode from "./nodes/RemapNode";
import Vec3Node from "./nodes/Vec3Node";
import Vec3SplitNode from "./nodes/Vec3SplitNode";
import Vec3AddNode from "./nodes/Vec3AddNode";
import Vec3SubtractNode from "./nodes/Vec3SubtractNode";
import Vec3MultiplyNode from "./nodes/Vec3MultiplyNode";
import Vec3ScaleNode from "./nodes/Vec3ScaleNode";
import VectorOpNode from "./nodes/VectorOpNode";
import OutputNode from "./nodes/OutputNode";

const nodeTypes = {
  slider: SliderNode,
  constant: ConstantNode,
  time: DisplayNode,
  oscillator: OscillatorNode,
  add: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "+" }} />,
  subtract: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "-" }} />,
  multiply: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "*" }} />,
  divide: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "/" }} />,
  power: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "^" }} />,
  log: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "log" }} />,
  greaterthan: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: ">" }} />,
  lessthan: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "<" }} />,
  equal: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "==" }} />,
  notequal: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "!=" }} />,
  and: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "&&" }} />,
  or: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "||" }} />,
  xor: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "xor" }} />,
  not: (p: any) => <UnaryOpNode {...p} data={{ ...p.data, op: "!" }} />,
  sin: (p: any) => <UnaryOpNode {...p} data={{ ...p.data, op: "sin" }} />,
  cos: (p: any) => <UnaryOpNode {...p} data={{ ...p.data, op: "cos" }} />,
  tan: (p: any) => <UnaryOpNode {...p} data={{ ...p.data, op: "tan" }} />,
  if: IfNode,
  clamp: ClampNode,
  remap: RemapNode,
  vec3: Vec3Node,
  vec3split: Vec3SplitNode,
  vec3add: Vec3AddNode,
  vec3subtract: Vec3SubtractNode,
  vec3multiply: Vec3MultiplyNode,
  vec3scale: Vec3ScaleNode,
  vec3normalize: (p: any) => <UnaryOpNode {...p} data={{ ...p.data, op: "normalize" }} />,
  vec3dot: (p: any) => <BinaryOpNode {...p} data={{ ...p.data, op: "dot" }} />,
  vec3cross: (p: any) => <VectorOpNode {...p} data={{ ...p.data, op: "cross", label: "Vector Cross" }} />,
  vec3length: (p: any) => <UnaryOpNode {...p} data={{ ...p.data, op: "length" }} />,
  output: OutputNode,
};

let id = 0;
const getId = () => `dndnode_${id++}`;

const GraphCanvasInner = () => {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } = useGraphStore();
  const { project } = useReactFlow();

  useEffect(() => {
    let maxId = -1;
    for (const node of nodes) {
      if (node.id.startsWith("dndnode_")) {
        const num = parseInt(node.id.split("_")[1], 10);
        if (!isNaN(num) && num > maxId) maxId = num;
      }
    }
    id = maxId + 1;
  }, [nodes]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = project({ x: event.clientX, y: event.clientY });
      const newNode = { id: getId(), type: type.toLowerCase(), position, data: { label: `${type}` } };
      addNode(newNode);
    },
    [addNode, project]
  );

  return (
    <div style={{ height: "100vh" }} onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            zIndex: 10,
            padding: "10px 15px",
            background: "rgba(42, 42, 42, 0.9)",
            border: "1px solid #555",
            borderRadius: 8,
          }}
        >
          <div><strong>Legend</strong></div>
          <div style={{ marginTop: 5 }}>
            <span style={{ color: "#00aaff" }}>Animated Edge</span>: Indicates data flow
          </div>
        </div>
      </ReactFlow>
    </div>
  );
};

const GraphCanvas = () => (
  <ReactFlowProvider>
    <GraphCanvasInner />
  </ReactFlowProvider>
);

export default GraphCanvas;
