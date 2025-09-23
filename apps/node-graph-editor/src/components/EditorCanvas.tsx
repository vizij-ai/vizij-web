import React, { useCallback, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  Node,
  Connection,
  NodeChange,
  EdgeChange,
  ReactFlowInstance,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { useEditorStore } from "../store/useEditorStore";
import { isConnectionCompatible } from "../utils/connectionUtils";
import { useRegistry } from "../contexts/RegistryProvider";

//
// Cache of simple node renderers to ensure stable component identity across renders.
// React Flow warns if nodeTypes object or its component identities change frequently.
// We keep renderers in a module-level cache and reuse them for consistent identity.
//
const simpleNodeCache: Record<string, React.ComponentType<any>> = {};

/**
 * EditorCanvas
 * - Renders a React Flow surface bound to useEditorStore
 * - Handles node/edge changes and onConnect
 * - Supports dropping node types from the palette (application/reactflow)
 */

export default function EditorCanvas(): JSX.Element {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setEdges = useEditorStore((s) => s.setEdges);

  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const { registry, getPortsForType } = useRegistry();

  const nodeTypes = useMemo(() => {
    // Build nodeTypes by reusing cached renderer components so identities stay stable.
    const types: Record<string, React.ComponentType<any>> = {};
    if (registry && Array.isArray(registry.nodes)) {
      for (const n of registry.nodes) {
        const rawTypeId = n.type_id ?? n.id ?? "";
        const typeId = String(rawTypeId).toLowerCase();
        if (!typeId) continue;

        if (!simpleNodeCache[typeId]) {
          // Precompute ports for this type so the renderer can be a plain component (no hooks inside)
          const ports =
            typeof getPortsForType === "function" && typeId
              ? getPortsForType(typeId)
              : { inputs: [], outputs: [] };

          // Create and cache a renderer that renders handles for each input/output port.
          simpleNodeCache[typeId] = ({ data }: any) => {
            return (
              <div
                style={{
                  position: "relative",
                  padding: 8,
                  border: "1px solid #444",
                  borderRadius: 6,
                  background: "#222",
                  color: "#fff",
                  minWidth: 160,
                }}
              >
                {/* left-side input handles */}
                <div
                  style={{
                    position: "absolute",
                    left: -12,
                    top: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {ports.inputs.map((p) => (
                    <div
                      key={p.id}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <Handle
                        id={p.id}
                        type="target"
                        position={Position.Left}
                        style={{ background: "#555", width: 10, height: 10 }}
                        data-type={p.type}
                      />
                      <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                        {p.label ?? p.name}
                      </div>
                    </div>
                  ))}
                </div>

                {/* node core content */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 700 }}>
                    {data?.label ?? n.name ?? typeId}
                  </div>
                  <div style={{ fontSize: 11, color: "#9aa0a6", marginTop: 4 }}>
                    {typeId}
                  </div>
                </div>

                {/* right-side output handles */}
                <div
                  style={{
                    position: "absolute",
                    right: -12,
                    top: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {ports.outputs.map((p) => (
                    <div
                      key={p.id}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <div style={{ fontSize: 11, color: "#cbd5e1" }}>
                        {p.label ?? p.name}
                      </div>
                      <Handle
                        id={p.id}
                        type="source"
                        position={Position.Right}
                        style={{ background: "#4ade80", width: 10, height: 10 }}
                        data-type={p.type}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          };
        }
        types[typeId] = simpleNodeCache[typeId];
      }
    }
    // Depend on registry.nodes.length so we only rebuild when node set changes size.
    return types;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- TODO: evaluate dependency need here
  }, [registry?.nodes?.length, getPortsForType]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes(
        (prev) => applyNodeChanges(changes, prev as Node[] as any) as any,
      );
    },
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges(
        (prev) => applyEdgeChanges(changes, prev as Edge[] as any) as any,
      );
    },
    [setEdges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      // Validate connection compatibility using simple schema-aware helper.
      const sourceId = String(connection.source);
      const targetId = String(connection.target);
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);

      const validation = isConnectionCompatible(
        sourceNode,
        targetNode,
        connection.sourceHandle ?? null,
        connection.targetHandle ?? null,
      );
      if (!validation.ok) {
        // Block the connection and surface the reason via the ConnectionsAssistant UI when available.
        try {
          (window as any).__vizijConnectionsAssistant?.show(
            validation.reason ?? "Incompatible connection",
            [],
          );
        } catch (e) {
          // fallback to console if the assistant API isn't present
          // eslint-disable-next-line no-console
          console.warn("Blocked connection:", validation.reason, e);
        }
        return;
      }

      const id = `e_${connection.source}_${connection.sourceHandle ?? "out"}_${connection.target}_${connection.targetHandle ?? "in"}_${Date.now()}`;
      const newEdge: Edge = {
        id,
        source: sourceId,
        target: targetId,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        animated: !!connection.sourceHandle,
      };
      setEdges((prev) => addEdge(newEdge, prev as Edge[]) as any);
    },
    [setEdges, nodes],
  );

  // selection helpers for Inspector
  const setSelected = useEditorStore((s) => s.setSelected);
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Select clicked node. Let React Flow manage its own selection UI to avoid
      // mutating nodes and inadvertently recomputing/spec reloading.
      setSelected(node.id);
    },
    [setSelected],
  );
  const onPaneClick = useCallback(
    (_event?: React.MouseEvent) => {
      // Deselect when clicking on empty canvas
      setSelected(null);
    },
    [setSelected],
  );

  // handle initialization of react-flow instance
  const onInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
  }, []);

  // Keep React Flow selection and Inspector selection in sync by listening
  // to React Flow's selection change. Some custom node renderers stop click
  // propagation, so relying on onNodeClick alone can miss selections.
  const onSelectionChange = useCallback(
    (selection: { nodes?: Node[]; edges?: Edge[] }) => {
      // Debug: log selection changes coming from React Flow
      // eslint-disable-next-line no-console
      console.debug("[EditorCanvas] onSelectionChange", {
        nodes: selection?.nodes?.map((n) => n.id),
        edges: selection?.edges?.map((e) => e.id),
      });

      const selNode =
        selection?.nodes && selection.nodes.length > 0
          ? selection.nodes[0]
          : null;
      if (selNode) {
        setSelected(String(selNode.id));
      } else {
        setSelected(null);
      }
    },
    [setSelected],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (!rfInstance || !reactFlowWrapper.current) return;

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      // Prefer the newer screenToFlowPosition API if available.
      const position = rfInstance.screenToFlowPosition
        ? rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          })
        : // fallback: compute relative to wrapper and use project if present
          (() => {
            const bounds = reactFlowWrapper.current!.getBoundingClientRect();
            const x = event.clientX - bounds.left;
            const y = event.clientY - bounds.top;
            return rfInstance.project ? rfInstance.project({ x, y }) : { x, y };
          })();

      const id = `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const newNode: Node = {
        id,
        type, // node type id (will match registry type ids)
        position,
        data: { label: type },
      };

      setNodes((prev) => [...prev, newNode] as any);
    },
    [rfInstance, setNodes],
  );

  return (
    <ReactFlowProvider>
      <div
        ref={reactFlowWrapper}
        style={{ width: "100%", height: "100%" }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes as Node[]}
          edges={edges as Edge[]}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onSelectionChange={onSelectionChange}
          nodeTypes={nodeTypes}
          fitView
          onInit={onInit}
        >
          <Background gap={16} size={1} color="#f0f0f0" />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}
