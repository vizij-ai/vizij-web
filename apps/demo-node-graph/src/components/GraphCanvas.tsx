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
import { shallow } from "zustand/shallow";

/* eslint-disable @typescript-eslint/no-explicit-any */

let id = 0;
const getId = () => `dndnode_${id++}`;

const GraphCanvasInner = () => {
  const { edges, onNodesChange, onEdgesChange, onConnect, addNode } =
    useGraphStore(
      (state) => ({
        edges: state.edges,
        onNodesChange: state.onNodesChange,
        onEdgesChange: state.onEdgesChange,
        onConnect: state.onConnect,
        addNode: state.addNode,
      }),
      shallow,
    );
  const { nodes } = useGraphStore(
    (state) => ({
      nodes: state.nodes,
    }),
    shallow,
  );

  const { registry } = useRegistry();

  const nodeTypes = useMemo(() => {
    const map: Record<string, any> = {};
    registry?.nodes.forEach((sig) => {
      map[sig.type_id.toLowerCase()] = SchemaNode;
    });
    return map;
  }, [registry]);

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
      const typeId = type.toLowerCase();
      const signature = registry?.nodes.find(
        (entry) => entry.type_id.toLowerCase() === typeId,
      );
      const defaults: Record<string, unknown> = {};
      signature?.params?.forEach((param) => {
        if (param.default_json !== undefined) {
          defaults[param.id] = param.default_json;
        }
      });
      const label = signature?.name ?? type;
      const newNode = {
        id: getId(),
        type: typeId,
        position,
        data: { label, ...defaults },
      };
      addNode(newNode);
    },
    [addNode, project, registry],
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
