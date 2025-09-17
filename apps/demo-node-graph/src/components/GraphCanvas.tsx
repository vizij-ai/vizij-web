import React, { useCallback, useEffect, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import useGraphStore from "../state/useGraphStore";
import SchemaNode from "./nodes/SchemaNode";
import { useRegistry } from "../state/RegistryContext";

/* eslint-disable @typescript-eslint/no-explicit-any */

let id = 0;
const getId = () => `dndnode_${id++}`;

const GraphCanvasInner = () => {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useGraphStore();
  const { registry } = useRegistry();
  const nodeTypes = useMemo(() => {
    const map: Record<string, any> = {};
    nodes.forEach((node) => {
      map[node.type] = SchemaNode;
    });
    registry?.nodes.forEach((sig) => {
      map[sig.type_id.toLowerCase()] = SchemaNode;
    });
    return map;
  }, [nodes, registry]);
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
      const newNode = {
        id: getId(),
        type: type.toLowerCase(),
        position,
        data: { label: `${type}` },
      };
      addNode(newNode);
    },
    [addNode, project],
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
          <div>
            <strong>Legend</strong>
          </div>
          <div style={{ marginTop: 5 }}>
            <span style={{ color: "#00aaff" }}>Animated Edge</span>: Indicates
            data flow
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
