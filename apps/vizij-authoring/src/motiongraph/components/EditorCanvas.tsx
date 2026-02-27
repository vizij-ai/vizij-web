import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";
import type { ComponentType, DragEvent } from "react";
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
} from "reactflow";
import "reactflow/dist/style.css";
import { useEditorStore } from "../store/useEditorStore";
import { useRegistry } from "../contexts/RegistryProvider";
import { checkConnectionCompatibility } from "../utils/connectionValidation";
import { LEGEND_TYPES } from "../utils/portColors";
import { createNodeRenderer, defaultVariadicCount } from "./GraphNode";
import { unwrapDefault } from "./MgNodeInspector";
import OutputTargetNode, { OUTPUT_TARGET_TYPE } from "./OutputTargetNode";
import InputSourceNode, { INPUT_SOURCE_TYPE } from "./InputSourceNode";

export default function EditorCanvas() {
  const nodes = useEditorStore((s) => s.nodes);
  const edges = useEditorStore((s) => s.edges);
  const setNodes = useEditorStore((s) => s.setNodes);
  const setEdges = useEditorStore((s) => s.setEdges);
  const setSelected = useEditorStore((s) => s.setSelected);

  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const { nodesByType, getPortsForType } = useRegistry();

  // Keep a ref so callbacks always see the latest registry (avoids stale closures)
  const getPortsRef = useRef(getPortsForType);
  getPortsRef.current = getPortsForType;

  const registryEntries = useMemo(
    () => Array.from(nodesByType?.entries?.() ?? []),
    [nodesByType],
  );

  // Build custom node types from registry
  const nodeTypes = useMemo(() => {
    const types: Record<string, ComponentType<any>> = {};
    for (const [typeId, schema] of registryEntries) {
      if (!typeId) continue;
      types[typeId] = createNodeRenderer(typeId, schema, getPortsForType);
    }
    types[OUTPUT_TARGET_TYPE] = OutputTargetNode;
    types[INPUT_SOURCE_TYPE] = InputSourceNode;
    return types;
  }, [registryEntries, getPortsForType]);

  // --- Sync output target nodes with enabledOutputs ---

  const enabledOutputs = useEditorStore((s) => s.enabledOutputs);

  useEffect(() => {
    setNodes((prev) => {
      // Remove output target nodes that are no longer enabled
      const filtered = prev.filter(
        (n) =>
          n.type !== OUTPUT_TARGET_TYPE ||
          enabledOutputs.has((n.data as any).outputPath),
      );

      // Find which enabled outputs don't have a node yet
      const existingPaths = new Set(
        filtered
          .filter((n) => n.type === OUTPUT_TARGET_TYPE)
          .map((n) => (n.data as any).outputPath as string),
      );

      const toAdd: Node[] = [];
      const sortedPaths = Array.from(enabledOutputs).sort();
      const newPaths = sortedPaths.filter((p) => !existingPaths.has(p));

      if (newPaths.length > 0) {
        // Place new outputs to the right of all existing nodes, stacked vertically
        let startX = 600;
        let startY = 40;
        if (filtered.length > 0) {
          const NODE_WIDTH_ESTIMATE = 250;
          startX =
            Math.max(...filtered.map((n) => n.position.x)) +
            NODE_WIDTH_ESTIMATE +
            60;
          // Stack below existing output targets at that x, or start at top
          const existingOutputs = filtered.filter(
            (n) => n.type === OUTPUT_TARGET_TYPE,
          );
          if (existingOutputs.length > 0) {
            startY = Math.max(...existingOutputs.map((n) => n.position.y)) + 50;
          }
        }

        for (let i = 0; i < newPaths.length; i++) {
          const path = newPaths[i];
          // Strip "rig/{rigId}/standard/" prefix and show full variable path
          const label =
            path.replace(/^rig\/[^/]+\/standard\//, "").replace(/\//g, ".") ||
            path;
          toAdd.push({
            id: `__output_target_${path}`,
            type: OUTPUT_TARGET_TYPE,
            position: { x: startX, y: startY + i * 50 },
            selectable: true,
            deletable: false,
            data: {
              outputPath: path,
              label,
            },
          });
        }
      }

      if (toAdd.length === 0 && filtered.length === prev.length) {
        return prev; // No changes
      }

      return [...filtered, ...toAdd];
    });

    // Clean up edges connected to removed output target nodes
    const validTargetIds = new Set(
      Array.from(enabledOutputs).map((p) => `__output_target_${p}`),
    );
    setEdges((prev) =>
      prev.filter(
        (e) =>
          !e.target.startsWith("__output_target_") ||
          validTargetIds.has(e.target),
      ),
    );
  }, [enabledOutputs, setNodes, setEdges]);

  // --- Sync input source nodes with enabledInputs ---

  const enabledInputs = useEditorStore((s) => s.enabledInputs);

  useEffect(() => {
    setNodes((prev) => {
      // Remove input source nodes that are no longer enabled
      const filtered = prev.filter(
        (n) =>
          n.type !== INPUT_SOURCE_TYPE ||
          enabledInputs.has((n.data as any).inputPath),
      );

      // Find which enabled inputs don't have a node yet
      const existingPaths = new Set(
        filtered
          .filter((n) => n.type === INPUT_SOURCE_TYPE)
          .map((n) => (n.data as any).inputPath as string),
      );

      const toAdd: Node[] = [];
      const sortedPaths = Array.from(enabledInputs).sort();
      const newPaths = sortedPaths.filter((p) => !existingPaths.has(p));

      if (newPaths.length > 0) {
        // Place new inputs to the LEFT of all existing nodes, stacked vertically
        let startX = -200;
        let startY = 40;
        if (filtered.length > 0) {
          startX = Math.min(...filtered.map((n) => n.position.x)) - 250;
          const existingInputNodes = filtered.filter(
            (n) => n.type === INPUT_SOURCE_TYPE,
          );
          if (existingInputNodes.length > 0) {
            startY =
              Math.max(...existingInputNodes.map((n) => n.position.y)) + 50;
          }
        }

        for (let i = 0; i < newPaths.length; i++) {
          const path = newPaths[i];
          const label = path.replace(/\//g, ".") || path;
          toAdd.push({
            id: `__input_source_${path}`,
            type: INPUT_SOURCE_TYPE,
            position: { x: startX, y: startY + i * 50 },
            selectable: true,
            deletable: false,
            data: {
              inputPath: path,
              label,
            },
          });
        }
      }

      if (toAdd.length === 0 && filtered.length === prev.length) {
        return prev; // No changes
      }

      return [...filtered, ...toAdd];
    });

    // Clean up edges connected to removed input source nodes
    const validSourceIds = new Set(
      Array.from(enabledInputs).map((p) => `__input_source_${p}`),
    );
    setEdges((prev) =>
      prev.filter(
        (e) =>
          !e.source.startsWith("__input_source_") ||
          validSourceIds.has(e.source),
      ),
    );
  }, [enabledInputs, setNodes, setEdges]);

  // --- React Flow callbacks ---

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((prev) => applyNodeChanges(changes, prev) as any);
    },
    [setNodes],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      setEdges((prev) => applyEdgeChanges(changes, prev) as any);
    },
    [setEdges],
  );

  const validateConnection = useCallback(
    (connection: Connection): { ok: boolean; reason?: string } => {
      const currentNodes = useEditorStore.getState().nodes;
      const srcNode = currentNodes.find((n) => n.id === connection.source);
      const tgtNode = currentNodes.find((n) => n.id === connection.target);
      if (!srcNode?.type || !tgtNode?.type) return { ok: true };
      return checkConnectionCompatibility(
        { getPortsForType: getPortsRef.current },
        srcNode.type,
        tgtNode.type,
        connection.sourceHandle ?? null,
        connection.targetHandle ?? null,
      );
    },
    [],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const result = validateConnection(connection);
      if (!result.ok) {
        console.warn("[motiongraph] Blocked connection:", result.reason);
        return;
      }
      setEdges((prev) => {
        // Remove any existing edge targeting the same input handle
        // (each input slot accepts only one connection).
        const filtered = prev.filter(
          (e) =>
            !(
              e.target === connection.target &&
              e.targetHandle === connection.targetHandle
            ),
        );
        return addEdge(connection, filtered) as any;
      });
    },
    [setEdges, validateConnection],
  );

  const isValidConnection = useCallback(
    (connection: Connection) => validateConnection(connection).ok,
    [validateConnection],
  );

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelected(node.id);
    },
    [setSelected],
  );

  const onPaneClick = useCallback(() => {
    setSelected(null);
  }, [setSelected]);

  const onEdgeDoubleClick = useCallback(
    (_event: React.MouseEvent, edge: Edge) => {
      setEdges((prev) => prev.filter((e) => e.id !== edge.id));
    },
    [setEdges],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      // Prevent deletion of output target and input source nodes (they are removed via panels)
      const actuallyDeleted = deleted.filter(
        (n) => n.type !== OUTPUT_TARGET_TYPE && n.type !== INPUT_SOURCE_TYPE,
      );
      if (actuallyDeleted.length === 0) return;

      const deletedIds = new Set(actuallyDeleted.map((n) => n.id));
      // Remove edges connected to deleted nodes
      setEdges((prev) =>
        prev.filter(
          (e) => !deletedIds.has(e.source) && !deletedIds.has(e.target),
        ),
      );
      // Clear selection if deleted node was selected
      const selectedId = useEditorStore.getState().selectedNodeId;
      if (selectedId && deletedIds.has(selectedId)) {
        setSelected(null);
      }
    },
    [setEdges, setSelected],
  );

  const onInit = useCallback((instance: ReactFlowInstance) => {
    setRfInstance(instance);
  }, []);

  // --- Drag and drop from palette ---

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

      // Convert screen coordinates to flow coordinates
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

      // Look up registry for display label
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

      // Initialize params with resolved defaults from the registry schema
      // so new nodes display proper values instead of [object Object].
      const params: Record<string, unknown> = {};
      if (registryEntry?.params) {
        for (const p of registryEntry.params) {
          const def = unwrapDefault(p.default_json);
          if (def !== undefined) {
            params[p.id] = def;
          }
        }
      }

      // Initialize variadic input count for nodes that support it
      const portsInfo = getPortsRef.current(type);
      const variadicInputCount = defaultVariadicCount(portsInfo.variadicInputs);

      const newNode: Node = {
        id,
        type,
        position,
        data: {
          label: displayLabel,
          originalType: canonicalType,
          params,
          ...(variadicInputCount > 0 ? { variadicInputCount } : {}),
        },
      };

      setNodes((prev) => [...prev, newNode] as any);
    },
    [nodesByType, rfInstance, setNodes],
  );

  return (
    <ReactFlowProvider>
      <div className="w-full h-full relative">
        <div
          ref={reactFlowWrapper}
          className="w-full h-full"
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
            onEdgeDoubleClick={onEdgeDoubleClick}
            onNodesDelete={onNodesDelete}
            deleteKeyCode={["Backspace", "Delete"]}
            nodeTypes={nodeTypes}
            isValidConnection={isValidConnection}
            fitView
            onInit={onInit}
          >
            <Background gap={20} size={1} color="#333" />
            <MiniMap
              nodeColor="#475569"
              maskColor="rgba(0,0,0,0.6)"
              style={{ background: "#1e1e1e" }}
            />
            <Controls />
          </ReactFlow>
        </div>
        <PortLegend />
      </div>
    </ReactFlowProvider>
  );
}

// ─── Collapsible port type legend ───────────────────────────────────

const PortLegend: FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <div className="absolute top-2 left-2 z-10">
      <button
        onClick={() => setOpen(!open)}
        className="px-2 py-1 text-xs rounded bg-neutral-800/90 text-neutral-400 hover:text-neutral-200 border border-neutral-700 transition-colors"
        title="Toggle port legend"
      >
        {open ? "Hide Legend" : "Legend"}
      </button>
      {open && (
        <div className="mt-1 p-3 rounded-lg bg-neutral-800/95 border border-neutral-700 space-y-2 min-w-40">
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
            Port Types
          </div>
          {LEGEND_TYPES.map((entry) => (
            <div key={entry.type} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                style={{
                  background: entry.color.bg,
                  border: `2px solid ${entry.color.border}`,
                }}
              />
              <span className="text-xs text-neutral-300">{entry.label}</span>
            </div>
          ))}
          <div className="border-t border-neutral-700 pt-2 mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block flex-shrink-0 border-2 border-blue-500" />
              <span className="text-xs text-neutral-300">Selected node</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-1 rounded-full bg-sky-400/20 text-sky-400 leading-tight">
                opt
              </span>
              <span className="text-xs text-neutral-300">Optional port</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
