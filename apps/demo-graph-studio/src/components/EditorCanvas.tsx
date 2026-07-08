import React, { useCallback, useMemo, useRef, useState } from "react";
import type { ComponentType, DragEvent, FC, MouseEvent } from "react";
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  ReactFlowInstance,
} from "reactflow";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  Handle,
  Position,
  useUpdateNodeInternals,
} from "reactflow";
import "reactflow/dist/style.css";
import type { JSX } from "react/jsx-runtime";
import { useEditorStore, parseVariadicPortId } from "../store/useEditorStore";
import {
  isConnectionCompatible,
  isConnectionCompatibleWithRegistry,
} from "../utils/connectionUtils";
import { useRegistry } from "../contexts/RegistryProvider";

const simpleNodeCache: Record<string, FC<{ id: string; data: any }>> = {};

const formatVariadicHandleId = (groupId: string, index: number): string =>
  `${groupId}_${index}`;

const buildVariadicEntries = (
  spec: { id?: string | number; min?: number | null; max?: number | null },
  inputMappings: any[],
) => {
  const groupId = spec?.id != null ? String(spec.id) : "";
  if (!groupId) return [];

  const entriesByIndex = new Map<number, any>();
  let cursor = 0;

  const claimIndex = (candidate: number | null | undefined) => {
    let idx =
      candidate != null && Number.isFinite(candidate) ? Number(candidate) : -1;
    if (idx < 0 || entriesByIndex.has(idx)) {
      idx = Math.max(0, cursor);
      while (entriesByIndex.has(idx)) {
        idx += 1;
      }
    }
    cursor = Math.max(cursor, idx + 1);
    return idx;
  };

  inputMappings.forEach((entry) => {
    const portId = String(entry?.portId ?? "");
    const baseId = String(entry?.basePortId ?? portId);
    const parsed = parseVariadicPortId(portId);
    if (
      baseId === groupId ||
      (parsed?.groupId === groupId && Number.isFinite(parsed?.index))
    ) {
      const index = claimIndex(parsed?.index ?? null);
      if (!entriesByIndex.has(index)) {
        entriesByIndex.set(index, entry);
      }
    }
  });

  const existingCount = entriesByIndex.size;
  const highestIndex =
    existingCount > 0 ? Math.max(...entriesByIndex.keys()) : -1;
  const minRequired = Math.max(0, Number(spec?.min ?? 0));
  const maxAllowed =
    spec?.max != null && Number.isFinite(spec.max)
      ? Math.max(0, Number(spec.max))
      : null;

  let desiredCount = Math.max(minRequired, existingCount, highestIndex + 1);
  if (desiredCount === 0) desiredCount = 1;

  if (maxAllowed == null) {
    desiredCount = Math.max(desiredCount, existingCount + 1);
  } else {
    desiredCount = Math.min(desiredCount, maxAllowed);
    if (existingCount < maxAllowed) {
      desiredCount = Math.min(
        Math.max(desiredCount, existingCount + 1),
        maxAllowed,
      );
    }
  }

  const entries: any[] = [];
  for (let idx = 0; idx < desiredCount; idx += 1) {
    const existing = entriesByIndex.get(idx);
    if (existing) {
      entries.push(existing);
    } else {
      entries.push({
        portId: formatVariadicHandleId(groupId, idx),
        basePortId: groupId,
        sourceNodeId: null,
        sourceOutputKey: null,
        selector: null,
      });
    }
  }

  return entries;
};

const compareInputHandles = (a: any, b: any): number => {
  const portA = String(a?.portId ?? "");
  const portB = String(b?.portId ?? "");
  const parsedA = parseVariadicPortId(portA);
  const parsedB = parseVariadicPortId(portB);
  if (parsedA && parsedB) {
    if (parsedA.groupId === parsedB.groupId) {
      return parsedA.index - parsedB.index;
    }
    return parsedA.groupId.localeCompare(parsedB.groupId);
  }
  if (parsedA && !parsedB) return 1;
  if (!parsedA && parsedB) return -1;
  return portA.localeCompare(portB);
};

const createNodeRenderer = (
  typeId: string,
  schema: any,
  getPortsForType?: (typeId: string) => any,
) => {
  if (simpleNodeCache[typeId]) {
    return simpleNodeCache[typeId];
  }

  const ports =
    typeof getPortsForType === "function"
      ? getPortsForType(typeId)
      : {
          inputs: schema.inputs ?? [],
          outputs: schema.outputs ?? [],
          variadicInputs: schema.variadicInputs ?? null,
          variadicOutputs: schema.variadicOutputs ?? null,
        };

  const SimpleNode: FC<{ id: string; data: any }> = ({ id, data }) => {
    const updateNodeInternals = useUpdateNodeInternals();
    const defaults = (data?.input_defaults as Record<string, any>) ?? {};
    const inputMappings: any[] = Array.isArray(data?.inputs) ? data.inputs : [];

    const findMapping = (portId: string) =>
      inputMappings.find((entry) => {
        const candidatePort = String(entry.portId ?? "");
        const candidateBase = String(entry.basePortId ?? candidatePort);
        const target = String(portId);
        return candidatePort === target || candidateBase === target;
      });

    const variadicEntries =
      ports.variadicInputs && ports.variadicInputs.id
        ? buildVariadicEntries(ports.variadicInputs, inputMappings)
        : [];

    React.useEffect(() => {
      updateNodeInternals(id);
    }, [id, updateNodeInternals, variadicEntries.length]);

    const renderInputLabel = (
      label: string,
      portId: string,
      basePortId: string,
      optional?: boolean,
      selector?: string | null,
    ) => {
      const hasDefault =
        defaults &&
        (defaults[portId] !== undefined || defaults[basePortId] !== undefined);
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#e2e8f0",
            }}
          >
            <span>{label}</span>
            {optional ? (
              <span
                style={{
                  fontSize: 9,
                  color: "#38bdf8",
                  background: "rgba(56,189,248,0.2)",
                  padding: "2px 4px",
                  borderRadius: 999,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                }}
              >
                opt
              </span>
            ) : null}
            {hasDefault ? (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#f97316",
                  display: "inline-block",
                }}
                title="Default value applied when unlinked"
              />
            ) : null}
          </div>
          {selector ? (
            <div
              style={{
                fontSize: 10,
                color: "#94a3b8",
                marginTop: 2,
              }}
            >
              sel: {selector}
            </div>
          ) : null}
        </div>
      );
    };

    return (
      <div
        style={{
          position: "relative",
          padding: 12,
          border: "1px solid rgba(148, 163, 184, 0.3)",
          borderRadius: 10,
          background: "linear-gradient(135deg,#1e293b,#111827)",
          color: "#f8fafc",
          width: 240,
          minWidth: 240,
          maxWidth: 240,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>
            {data?.label ??
              schema.signature?.name ??
              schema.signature?.type_id ??
              typeId}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "#94a3b8",
              marginTop: 4,
              wordBreak: "break-word",
              whiteSpace: "normal",
            }}
          >
            {schema.signature?.doc || typeId}
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: -16,
            top: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {ports.inputs.map((p: any) => {
            const mapping = findMapping(p.id);
            return (
              <div
                key={p.id}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Handle
                  id={p.id}
                  type="target"
                  position={Position.Left}
                  style={{
                    background: "#475569",
                    width: 10,
                    height: 10,
                    border: "1px solid #38bdf8",
                  }}
                  data-type={p.type}
                />
                {renderInputLabel(
                  p.label ?? p.name,
                  p.id,
                  p.id,
                  p.optional,
                  mapping?.selector ?? null,
                )}
              </div>
            );
          })}
          {ports.variadicInputs
            ? variadicEntries.map((entry: any, idx: number) => {
                const portId = String(entry.portId ?? "");
                const mapping = findMapping(portId);
                const label = `${
                  ports.variadicInputs?.label ??
                  ports.variadicInputs?.id ??
                  "item"
                } ${idx + 1}`;
                return (
                  <div
                    key={portId}
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Handle
                      id={portId}
                      type="target"
                      position={Position.Left}
                      style={{
                        background: "#475569",
                        width: 10,
                        height: 10,
                        border: "1px solid #f97316",
                      }}
                      data-type={ports.variadicInputs?.type ?? "any"}
                    />
                    {renderInputLabel(
                      label,
                      portId,
                      String(
                        entry.basePortId ?? ports.variadicInputs?.id ?? portId,
                      ),
                      false,
                      mapping?.selector ?? null,
                    )}
                  </div>
                );
              })
            : null}
        </div>

        <div
          style={{
            position: "absolute",
            right: -16,
            top: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {ports.outputs.map((p: any) => (
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
                style={{
                  background: "#34d399",
                  width: 10,
                  height: 10,
                  border: "1px solid rgba(15,118,110,0.6)",
                }}
                data-type={p.type}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  simpleNodeCache[typeId] = SimpleNode;
  return SimpleNode;
};

export default function EditorCanvas(): JSX.Element {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setEdges = useEditorStore((s) => s.setEdges);
  const arrangeNodes = useEditorStore((s) => s.arrangeNodes);

  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const registryState = useRegistry();
  const { nodesByType, getPortsForType } = registryState;

  const registryEntries = useMemo(
    () => Array.from(nodesByType?.entries?.() ?? []),
    [nodesByType],
  );

  const nodeTypes = useMemo(() => {
    const types: Record<string, ComponentType<any>> = {};
    for (const [typeId, schema] of registryEntries) {
      if (!typeId) continue;
      types[typeId] = createNodeRenderer(typeId, schema, getPortsForType);
    }
    return types;
  }, [registryEntries, getPortsForType]);

  const upsertTargetHandleMapping = useCallback(
    (connection: Connection) => {
      if (!connection.target) return;
      const targetId = String(connection.target);
      const handleId = connection.targetHandle
        ? String(connection.targetHandle)
        : null;
      const sourceId = connection.source ? String(connection.source) : null;
      const sourceHandle = connection.sourceHandle
        ? String(connection.sourceHandle)
        : "out";
      if (!handleId) return;

      const basePortId = parseVariadicPortId(handleId)?.groupId ?? handleId;

      setNodes((prev) =>
        prev.map((node) => {
          if (String(node.id) !== targetId) return node;
          const data = { ...(node.data || {}) };
          const inputs = Array.isArray(data.inputs)
            ? [...(data.inputs as any[])]
            : [];
          const existingIdx = inputs.findIndex(
            (entry) => String(entry?.portId ?? "") === handleId,
          );
          const nextEntry = {
            portId: handleId,
            basePortId,
            sourceNodeId: sourceId,
            sourceOutputKey: sourceHandle,
            selector: null,
          };
          if (existingIdx >= 0) {
            inputs[existingIdx] = nextEntry;
          } else {
            inputs.push(nextEntry);
          }
          inputs.sort(compareInputHandles);
          data.inputs = inputs;
          return { ...node, data };
        }),
      );
    },
    [setNodes],
  );

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
      const sourceId = String(connection.source);
      const targetId = String(connection.target);
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);

      const validation =
        registryState && (registryState as any)
          ? isConnectionCompatibleWithRegistry(
              registryState,
              sourceNode,
              targetNode,
              connection.sourceHandle ?? null,
              connection.targetHandle ?? null,
              {
                nodes,
                edges,
              },
            )
          : isConnectionCompatible(
              sourceNode,
              targetNode,
              connection.sourceHandle ?? null,
              connection.targetHandle ?? null,
            );

      if (!validation.ok) {
        try {
          (window as any).__vizijConnectionsAssistant?.show(
            validation.reason ?? "Incompatible connection",
            [],
          );
        } catch {
          // fall back to console without crashing
          console.warn("Blocked connection:", validation.reason);
        }
        return;
      }

      upsertTargetHandleMapping(connection);

      const newEdge: Edge = {
        id: `e_${connection.source}_${connection.sourceHandle ?? "out"}_${connection.target}_${connection.targetHandle ?? "in"}_${Date.now()}`,
        source: sourceId,
        target: targetId,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
        animated: !!connection.sourceHandle,
      };
      setEdges((prev) => addEdge(newEdge, prev as Edge[]) as any);
    },
    [edges, nodes, registryState, setEdges, upsertTargetHandleMapping],
  );

  const setSelected = useEditorStore((s) => s.setSelected);

  const onNodeClick = useCallback(
    (_event: MouseEvent, node: Node) => {
      setSelected(node.id);
    },
    [setSelected],
  );

  const onPaneClick = useCallback(() => {
    setSelected(null);
  }, [setSelected]);

  const onSelectionChange = useCallback(
    (selection: { nodes?: Node[]; edges?: Edge[] }) => {
      const selectedNode =
        selection?.nodes && selection.nodes.length > 0
          ? selection.nodes[0]
          : null;
      setSelected(selectedNode ? String(selectedNode.id) : null);
    },
    [setSelected],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
  }, []);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      if (!rfInstance || !reactFlowWrapper.current) return;

      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const position = rfInstance.screenToFlowPosition
        ? rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          })
        : (() => {
            const bounds = reactFlowWrapper.current!.getBoundingClientRect();
            const x = event.clientX - bounds.left;
            const y = event.clientY - bounds.top;
            return rfInstance.project ? rfInstance.project({ x, y }) : { x, y };
          })();

      const id = `node_${Date.now()}_${Math.floor(Math.random() * 1_000)}`;
      const registryEntry = nodesByType?.get?.(String(type).toLowerCase());
      const canonicalType =
        (registryEntry?.signature?.type_id &&
          String(registryEntry.signature.type_id)) ||
        (registryEntry?.signature?.id && String(registryEntry.signature.id)) ||
        String(type);
      const displayLabel =
        (registryEntry?.signature?.name &&
          String(registryEntry.signature.name)) ||
        canonicalType;

      const newNode: Node = {
        id,
        type,
        position,
        data: { label: displayLabel, originalType: canonicalType },
      };

      setNodes((prev) => [...prev, newNode] as any);
    },
    [nodesByType, rfInstance, setNodes],
  );

  const handleAutoArrange = useCallback(() => {
    arrangeNodes();
    if (!rfInstance) return;
    setTimeout(() => {
      try {
        rfInstance.fitView?.({ padding: 0.25, duration: 250 });
      } catch {
        // fitView optional; ignore failures (e.g., instance disposed)
      }
    }, 75);
  }, [arrangeNodes, rfInstance]);

  return (
    <ReactFlowProvider>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 20,
            pointerEvents: "none",
            display: "flex",
          }}
        >
          <button
            type="button"
            onClick={handleAutoArrange}
            style={{
              pointerEvents: "auto",
              background: "rgba(37,99,235,0.22)",
              border: "1px solid rgba(59,130,246,0.55)",
              color: "#bfdbfe",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              cursor: "pointer",
              boxShadow: "0 2px 8px rgba(15,23,42,0.35)",
              backdropFilter: "blur(4px)",
            }}
          >
            Arrange Graph
          </button>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
